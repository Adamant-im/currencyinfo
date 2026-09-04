import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { CoinPaprikaApi } from './coinpaprika';
import { SourcesManager } from '../sources-manager';
import { RatesMerger } from '../../merger';
import { SourceTickers } from './dto/tickers.dto';

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

  it('should exclude excess individual coins at startup and warn only once across cycles', async () => {
    mockConfig['coinpaprika.ids'] = ['adm-adamant-messenger', 'kcs-kucoin-token'];
    mockConfig['coinpaprika.max_individual_requests'] = 1;

    const api = createApi();
    await api.ready;

    expect(api.enabledCoins).toEqual(new Set(['ADM']));
    expect(warnings()).toContain('coinpaprika.max_individual_requests');
    expect(warnings()).toContain('KCS');
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);

    for (let cycle = 0; cycle < 2; cycle++) {
      mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

      expect(await api.fetch('USD')).toEqual({ 'ADM/USD': 0.01234568 });
    }

    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    expect(mockedAxios.get.mock.calls.slice(1).map(([url]) => url)).toEqual([
      `${TICKERS_URL}/adm-adamant-messenger`,
      `${TICKERS_URL}/adm-adamant-messenger`,
    ]);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
  });

  it('should keep bulk-boundary coins and budget unranked coins in configured order', async () => {
    mockConfig['coinpaprika.ids'] = [
      'eth-ethereum',
      'adm-adamant-messenger',
      'btc-bitcoin',
      'kcs-kucoin-token',
    ];
    mockConfig['coinpaprika.max_individual_requests'] = 1;

    const api = createApi(
      coinsList.map((coin) => ({
        ...coin,
        rank: coin.symbol === 'ETH' ? 0 : coin.symbol === 'BTC' ? 200 : coin.rank,
      })),
    );
    await api.ready;

    expect(api.enabledCoins).toEqual(new Set(['ETH', 'BTC']));
    expect(warnings()).toContain('ADM');
    expect(warnings()).toContain('KCS');
  });

  it.each([
    { ids: ['btc-bitcoin', 'adm-adamant-messenger'], enabled: true, coins: ['BTC'] },
    { ids: ['adm-adamant-messenger'], enabled: false, coins: [] },
  ])('should support a zero individual cap with $ids', async ({ ids, enabled, coins }) => {
    mockConfig['coinpaprika.ids'] = ids;
    mockConfig['coinpaprika.max_individual_requests'] = 0;

    const api = createApi();
    await api.ready;

    expect(api.enabled).toBe(enabled);
    expect(api.enabledCoins).toEqual(new Set(coins));
    expect(warnings()).toContain('ADM');

    for (let cycle = 0; cycle < 2; cycle++) {
      if (enabled) {
        mockedAxios.get.mockResolvedValueOnce({
          data: [{ id: 'btc-bitcoin', symbol: 'BTC', quotes: { USD: { price: 60000 } } }],
        });
      }

      expect(await api.fetch('USD')).toEqual(enabled ? { 'BTC/USD': 60000 } : {});
    }

    expect(mockedAxios.get).toHaveBeenCalledTimes(enabled ? 3 : 1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockNotifier.notify).not.toHaveBeenCalled();
  });

  it('should retain advertised bulk coins through a temporary response gap and recover', async () => {
    mockConfig['coinpaprika.ids'] = ['btc-bitcoin', 'eth-ethereum', 'adm-adamant-messenger'];
    mockConfig['coinpaprika.max_individual_requests'] = 1;

    const api = createApi();
    await api.ready;

    expect(mockLogger.warn).not.toHaveBeenCalled();
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    mockedAxios.get.mockResolvedValueOnce({
      data: { id: 'btc-bitcoin', symbol: 'BTC', quotes: { USD: { price: 60000 } } },
    });

    expect(await api.fetch('USD')).toEqual({ 'BTC/USD': 60000 });
    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ETH', 'ADM']));
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    expect(warnings()).toContain('coinpaprika.max_individual_requests');

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { id: 'btc-bitcoin', symbol: 'BTC', quotes: { USD: { price: 60000 } } },
        { id: 'eth-ethereum', symbol: 'ETH', quotes: { USD: { price: 2500 } } },
      ],
    });
    mockedAxios.get.mockResolvedValueOnce({ data: admTicker });

    expect(await api.fetch('USD')).toEqual({
      'BTC/USD': 60000,
      'ETH/USD': 2500,
      'ADM/USD': 0.01234568,
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(5);
  });

  it('should let another source serve excluded coins without inflating its source-count gate', async () => {
    mockConfig['coinpaprika.ids'] = ['adm-adamant-messenger'];
    mockConfig['coinpaprika.coins'] = ['KCS'];
    mockConfig['coinpaprika.max_individual_requests'] = 1;

    const api = createApi();
    await api.ready;

    const config = new ConfigService({
      minSources: 2,
      base_coins: ['USD'],
      decimals: 8,
      rateDifferencePercentThreshold: 25,
      groupPercentage: 65,
      priorities: ['CoinPaprika', 'OtherSource'],
    });
    const manager = new SourcesManager(config, mockNotifier as Notifier, mockLogger as Logger);
    const otherSource = {
      enabled: true,
      enabledCoins: new Set(['ADM', 'KCS']),
      ready: Promise.resolve(),
      weight: 10,
      resourceName: 'OtherSource',
      fetch: jest.fn().mockResolvedValue({ 'ADM/USD': 0.0123, 'KCS/USD': 12.34 }),
    };
    manager.sources = [api, otherSource];
    await manager.getEnabledCoins();

    expect(manager.sourcePairRecord).toEqual({ 'ADM/USD': 2, 'KCS/USD': 1 });

    class TestMerger extends RatesMerger {
      sourcesManager = manager;
      pairSources = manager.sourcePairRecord;
      config = config;
      notifier = mockNotifier as Notifier;
      rateLifetime = 60;
    }
    const merger = new TestMerger('priority', manager.getSourceWeights());

    for (let cycle = 0; cycle < 2; cycle++) {
      mockedAxios.get.mockResolvedValueOnce({ data: admTicker });
      const quotes: SourceTickers = {};
      merger.mergeTickers(quotes, await api.fetch('USD'), { name: api.resourceName });
      merger.mergeTickers(quotes, await otherSource.fetch(), { name: otherSource.resourceName });
      merger.setTickers(quotes);

      expect(merger.tickers['KCS/USD']).toBe(12.34);
      expect(merger.tickers['ADM/USD']).toBe(0.01234568);
      expect(merger.getRatesWithFewerSources()).toEqual([]);
    }

    const quotes: SourceTickers = {};
    merger.mergeTickers(quotes, await otherSource.fetch(), { name: otherSource.resourceName });
    merger.setTickers(quotes);

    expect(merger.tickers['KCS/USD']).toBe(12.34);
    expect(merger.tickers['ADM/USD']).toBeUndefined();
    expect(merger.getRatesWithFewerSources()).toEqual([['ADM/USD', 2, 1]]);
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
