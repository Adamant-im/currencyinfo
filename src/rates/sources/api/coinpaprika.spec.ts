import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { CoinPaprikaApi } from './coinpaprika';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const COINS_LIST_URL = 'https://api.coinpaprika.com/v1/coins';
const TICKERS_URL = 'https://api.coinpaprika.com/v1/tickers';

// Trimmed excerpt of the real /v1/coins directory, including the genuine ADM symbol collision.
const coinsList = [
  { id: 'btc-bitcoin', name: 'Bitcoin', symbol: 'BTC', rank: 1, is_active: true, type: 'coin' },
  { id: 'eth-ethereum', name: 'Ethereum', symbol: 'ETH', rank: 2, is_active: true, type: 'coin' },
  {
    id: 'adm-adamant-messenger',
    name: 'ADAMANT Messenger',
    symbol: 'ADM',
    rank: 1510,
    is_active: true,
    type: 'coin',
  },
  {
    id: 'adm-voice-of-the-gods-by-virtuals',
    name: 'Voice of the Gods by Virtuals',
    symbol: 'ADM',
    rank: 5688,
    is_active: true,
    type: 'token',
  },
  {
    id: 'adm-delisted-adm',
    name: 'Delisted ADM',
    symbol: 'ADM',
    rank: 5,
    is_active: false,
    type: 'token',
  },
  {
    id: 'kcs-kucoin-token',
    name: 'KuCoin Token',
    symbol: 'KCS',
    rank: 350,
    is_active: true,
    type: 'token',
  },
];

const admTicker = {
  id: 'adm-adamant-messenger',
  name: 'ADAMANT Messenger',
  symbol: 'ADM',
  rank: 1510,
  quotes: { USD: { price: 0.0123456789 } },
};

const kcsTicker = {
  id: 'kcs-kucoin-token',
  name: 'KuCoin Token',
  symbol: 'KCS',
  rank: 350,
  quotes: { USD: { price: 12.3456789 } },
};

describe('CoinPaprikaApi Connector', () => {
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;
  let mockNotifier: Partial<Notifier>;

  /**
   * Queues the coin discovery response (consumed by the constructor) and builds the connector.
   * Pass `null` to skip queueing when discovery is not expected to run.
   */
  const createApi = (coins: unknown[] | null = coinsList) => {
    if (coins) {
      mockedAxios.get.mockResolvedValueOnce({ data: coins });
    }

    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    return new CoinPaprikaApi(configService, mockLogger as Logger, mockNotifier as Notifier);
  };

  const warnings = () => (mockLogger.warn as jest.Mock).mock.calls.flat().join(' ');

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'coinpaprika.enabled': true,
      'coinpaprika.coins': undefined,
      'coinpaprika.ids': ['btc-bitcoin'],
      'coinpaprika.weight': 300,
      'coinpaprika.bulk_limit': 200,
      'coinpaprika.max_individual_requests': 5,
      decimals: 8,
    };

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockNotifier = {
      notify: jest.fn(),
    };
  });

  it('should resolve configured ids from the coins list and expose enabledCoins', async () => {
    mockConfig['coinpaprika.ids'] = ['btc-bitcoin', 'adm-adamant-messenger'];

    const api = createApi();
    await api.ready;

    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ADM']));
    expect(api.weight).toBe(300);
    expect(mockLogger.info).toHaveBeenCalledWith('CoinPaprika coin IDs fetched successfully.');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      COINS_LIST_URL,
      expect.objectContaining({ headers: { 'Accept-Encoding': 'gzip' } }),
    );
  });

  it('should pick the best ranked active candidate for an ambiguous symbol', async () => {
    mockConfig['coinpaprika.ids'] = undefined;
    mockConfig['coinpaprika.coins'] = ['ADM'];

    const api = createApi();
    await api.ready;

    expect(api.enabledCoins).toEqual(new Set(['ADM']));
    expect(warnings()).toContain('adm-adamant-messenger');
    expect(warnings()).toContain('adm-voice-of-the-gods-by-virtuals');
    // The better ranked but inactive entry must never be a candidate.
    expect(warnings()).not.toContain('adm-delisted-adm');

    mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({ 'ADM/USD': 0.01234568 });
    expect(mockedAxios.get.mock.calls[1][0]).toBe(`${TICKERS_URL}/adm-adamant-messenger`);
  });

  it('should let explicit ids win over symbol resolution for the same symbol', async () => {
    mockConfig['coinpaprika.ids'] = ['adm-adamant-messenger'];
    mockConfig['coinpaprika.coins'] = ['ADM'];

    const api = createApi();
    await api.ready;

    expect(api.enabledCoins).toEqual(new Set(['ADM']));

    mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({ 'ADM/USD': 0.01234568 });
    // Coins list + a single per-coin ticker request: no duplicate entry, no duplicate call.
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('should cover in-range coins with one bulk call and fan out for out-of-range ones', async () => {
    mockConfig['coinpaprika.ids'] = ['btc-bitcoin', 'adm-adamant-messenger'];

    const api = createApi();
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { id: 'btc-bitcoin', symbol: 'BTC', rank: 1, quotes: { USD: { price: 60000.12345678 } } },
      ],
    });
    mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 60000.12345678,
      'ADM/USD': 0.01234568,
    });

    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    expect(mockedAxios.get.mock.calls[1][0]).toBe(TICKERS_URL);
    expect(mockedAxios.get.mock.calls[1][1]).toEqual(
      expect.objectContaining({ params: { quotes: 'USD', limit: 200 } }),
    );
    expect(mockedAxios.get.mock.calls[2][0]).toBe(`${TICKERS_URL}/adm-adamant-messenger`);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'CoinPaprika rates updated against USD successfully.',
    );
  });

  it('should not issue the bulk call when every configured coin is out of bulk range', async () => {
    mockConfig['coinpaprika.ids'] = ['adm-adamant-messenger'];

    const api = createApi();
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({ 'ADM/USD': 0.01234568 });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(mockedAxios.get.mock.calls[1][0]).toBe(`${TICKERS_URL}/adm-adamant-messenger`);
  });

  it('should cap the per-coin fan-out and log the truncation', async () => {
    mockConfig['coinpaprika.ids'] = ['adm-adamant-messenger', 'kcs-kucoin-token'];
    mockConfig['coinpaprika.max_individual_requests'] = 1;

    const api = createApi();
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({ 'ADM/USD': 0.01234568 });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(warnings()).toContain('coinpaprika.max_individual_requests');
    expect(warnings()).toContain('KCS');
  });

  it('should keep other rates when a per-coin request fails', async () => {
    mockConfig['coinpaprika.ids'] = ['adm-adamant-messenger', 'kcs-kucoin-token'];

    const api = createApi();
    await api.ready;

    mockedAxios.get.mockRejectedValueOnce(new Error('Request failed with status code 429'));
    mockedAxios.get.mockResolvedValueOnce({ data: kcsTicker });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({ 'KCS/USD': 12.3456789 });
    expect(warnings()).toContain('adm-adamant-messenger');
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });

  it('should reject a bulk row whose symbol does not match the configured symbol', async () => {
    mockConfig['coinpaprika.ids'] = ['btc-bitcoin'];

    const api = createApi();
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: [{ id: 'btc-bitcoin', symbol: 'WBTC', rank: 1, quotes: { USD: { price: 60000 } } }],
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 'btc-bitcoin', symbol: 'WBTC', rank: 1, quotes: { USD: { price: 60000 } } },
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({});
    expect(warnings()).toContain('WBTC');
  });

  it('should keep the first id when two configured ids carry the same symbol', async () => {
    mockConfig['coinpaprika.ids'] = ['usdt-tether', 'usdt-bridged-usdt-sonic-labs'];

    const api = createApi([
      {
        id: 'usdt-tether',
        name: 'Tether',
        symbol: 'USDT',
        rank: 3,
        is_active: true,
        type: 'token',
      },
      {
        id: 'usdt-bridged-usdt-sonic-labs',
        name: 'Bridged USDT',
        symbol: 'USDT',
        rank: 1395,
        is_active: true,
        type: 'token',
      },
    ]);
    await api.ready;

    // Both would emit USDT/USD, and the second price would overwrite the first one silently.
    expect(api.enabledCoins).toEqual(new Set(['USDT']));
    expect(warnings()).toContain('usdt-bridged-usdt-sonic-labs');

    mockedAxios.get.mockResolvedValueOnce({
      data: [{ id: 'usdt-tether', symbol: 'USDT', rank: 3, quotes: { USD: { price: 1.0001 } } }],
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({ 'USDT/USD': 1.0001 });
    // Coins list plus one bulk call: the discarded id costs no request.
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should not report success for a cycle that produced no rate', async () => {
    mockConfig['coinpaprika.ids'] = ['btc-bitcoin'];

    const api = createApi();
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    mockedAxios.get.mockResolvedValueOnce({ data: {} });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({});
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      'CoinPaprika rates updated against USD successfully.',
    );
  });

  it('should return empty object if disabled', async () => {
    mockConfig['coinpaprika.enabled'] = false;

    const api = createApi(null);
    await api.ready;

    const rates = await api.fetch('USD');

    expect(rates).toEqual({});
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
