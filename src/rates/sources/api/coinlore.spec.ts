import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { CoinLoreApi } from './coinlore';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CoinLoreApi Connector', () => {
  let api: CoinLoreApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;
  let mockNotifier: Partial<Notifier>;

  /**
   * Builds a CoinLore ticker row. Every numeric field is a string, as the live API returns it.
   */
  const makeRow = (id: number | string, symbol: string, priceUsd: string, rank = 1) => ({
    id: String(id),
    symbol,
    name: symbol,
    nameid: symbol.toLowerCase(),
    rank,
    price_usd: priceUsd,
  });

  /**
   * Builds a row of the `/api/assets/` directory, which carries no price.
   */
  const makeAsset = (id: number | string, symbol: string, rank = 1, name = symbol) => ({
    id: String(id),
    symbol,
    name,
    nameid: symbol.toLowerCase(),
    rank,
  });

  /**
   * Builds an `/api/assets/` response envelope.
   */
  const makeAssets = (assets: ReturnType<typeof makeAsset>[]) => ({ data: { data: assets } });

  const createApi = () => {
    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    return new CoinLoreApi(configService, mockLogger as Logger, mockNotifier as Notifier);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'coinlore.enabled': true,
      'coinlore.coins': [],
      'coinlore.ids': { BTC: 90, ADM: 33250 },
      'coinlore.weight': 300,
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

    // The default configuration resolves every coin from `coinlore.ids`, so the constructor
    // issues no request and no discovery response has to be queued before it.
    api = createApi();
  });

  it('should resolve explicit ids without any directory request', async () => {
    await api.ready;

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ADM']));
    expect(api.weight).toBe(300);
    expect(mockLogger.info).toHaveBeenCalledWith('CoinLore coin IDs fetched successfully.');
  });

  it('should resolve the symbols missing from ids with a single directory request', async () => {
    mockConfig['coinlore.ids'] = { BTC: 90 };
    mockConfig['coinlore.coins'] = ['ETH', 'ADM'];

    mockedAxios.get.mockResolvedValueOnce(
      makeAssets([
        makeAsset(90, 'BTC', 1),
        makeAsset(80, 'ETH', 2),
        makeAsset(33250, 'ADM', 1066, 'ADAMANT Messenger'),
      ]),
    );

    const resolvingApi = createApi();
    await resolvingApi.ready;

    // The whole ~15k coin directory arrives in one call, so a low-ranked coin such as ADM
    // costs no extra request.
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.coinlore.net/api/assets/',
      expect.objectContaining({ headers: { 'Accept-Encoding': 'gzip' } }),
    );
    expect(resolvingApi.enabledCoins).toEqual(new Set(['BTC', 'ETH', 'ADM']));

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        makeRow(90, 'BTC', '81520.59'),
        makeRow(80, 'ETH', '3000'),
        makeRow(33250, 'ADM', '0.5'),
      ],
    });

    const rates = await resolvingApi.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 81520.59,
      'ETH/USD': 3000,
      'ADM/USD': 0.5,
    });
  });

  it('should pick the best ranked coin for an ambiguous symbol and warn about it', async () => {
    mockConfig['coinlore.ids'] = {};
    mockConfig['coinlore.coins'] = ['ADM'];

    mockedAxios.get.mockResolvedValueOnce(
      makeAssets([
        makeAsset(99999, 'ADM', 6522, 'Some Other ADM'),
        makeAsset(33250, 'ADM', 1066, 'ADAMANT Messenger'),
      ]),
    );

    const ambiguousApi = createApi();
    await ambiguousApi.ready;

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Ambiguous CoinLore symbol 'ADM' matches 2 coins"),
    );

    mockedAxios.get.mockResolvedValueOnce({ data: [makeRow(33250, 'ADM', '0.5')] });

    const rates = await ambiguousApi.fetch('USD');

    expect(rates).toEqual({ 'ADM/USD': 0.5 });
  });

  it('should notify about symbols missing from the directory', async () => {
    mockConfig['coinlore.ids'] = { BTC: 90 };
    mockConfig['coinlore.coins'] = ['NOSUCHCOIN'];

    mockedAxios.get.mockResolvedValueOnce(makeAssets([makeAsset(90, 'BTC', 1)]));

    const partialApi = createApi();
    await partialApi.ready;

    expect(mockNotifier.notify).toHaveBeenCalledWith('warn', expect.stringContaining('NOSUCHCOIN'));
    // The explicitly configured coin still keeps the source usable.
    expect(partialApi.enabledCoins).toEqual(new Set(['BTC']));
  });

  it('should parse the price_usd string and round it to the configured decimals', async () => {
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: [makeRow(90, 'BTC', '81520.593456789012'), makeRow(33250, 'ADM', '0.123456789012')],
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 81520.59345679,
      'ADM/USD': 0.12345679,
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'CoinLore rates updated against USD successfully.',
    );
  });

  it('should reject a row whose symbol does not match the configured id', async () => {
    mockConfig['coinlore.ids'] = { ADM: 33250 };

    const staleApi = createApi();
    await staleApi.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: [makeRow(33250, 'OTHER', '4.2')],
    });

    const rates = await staleApi.fetch('USD');

    expect(rates).toEqual({});
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("returned symbol 'OTHER' instead of the configured 'ADM'"),
    );
  });

  it('should return an empty object and warn for a non-USD base currency', async () => {
    await api.ready;

    const rates = await api.fetch('EUR');

    expect(rates).toEqual({});
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('CoinLore quotes coins in USD only'),
    );
  });

  it('should split more than 100 ids into several ticker requests', async () => {
    const ids: Record<string, number> = {};

    for (let index = 0; index < 150; index++) {
      ids[`C${index}`] = index + 1;
    }

    mockConfig['coinlore.ids'] = ids;
    mockConfig['coinlore.coins'] = [];

    const bulkApi = createApi();
    await bulkApi.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: Array.from({ length: 100 }, (_, index) => makeRow(index + 1, `C${index}`, '2')),
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: Array.from({ length: 50 }, (_, index) => makeRow(index + 101, `C${index + 100}`, '3')),
    });

    const rates = await bulkApi.fetch('USD');

    expect(mockedAxios.get).toHaveBeenCalledTimes(2);

    const firstCall = mockedAxios.get.mock.calls[0];
    const secondCall = mockedAxios.get.mock.calls[1];

    expect(firstCall[0]).toBe('https://api.coinlore.net/api/ticker/');
    expect((firstCall[1]?.params as { id: string }).id.split(',')).toHaveLength(100);
    expect((secondCall[1]?.params as { id: string }).id.split(',')).toHaveLength(50);

    expect(Object.keys(rates)).toHaveLength(150);
    expect(rates['C0/USD']).toBe(2);
    expect(rates['C149/USD']).toBe(3);
  });

  it('should keep advertised coins in step with served coins when the directory fails', async () => {
    mockConfig['coinlore.ids'] = { ADM: 33250 };
    mockConfig['coinlore.coins'] = ['NEO'];

    mockedAxios.get.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    const degraded = createApi();
    await degraded.ready;

    // `enabledCoins` is what SourcesManager counts towards minSources. Leaving it empty while
    // fetch() still quoted ADM lowered the effective requirement for every pair ADM takes part in.
    expect(degraded.enabledCoins).toEqual(new Set(['ADM']));
    expect(mockNotifier.notify).toHaveBeenCalledWith('warn', expect.stringContaining('NEO'));

    mockedAxios.get.mockResolvedValueOnce({ data: [makeRow(33250, 'ADM', '0.5')] });

    const rates = await degraded.fetch('USD');

    expect(rates).toEqual({ 'ADM/USD': 0.5 });
    // Every quoted pair is advertised, and nothing is advertised that is not quoted.
    expect(new Set(Object.keys(rates).map((pair) => pair.split('/')[0]))).toEqual(
      degraded.enabledCoins,
    );
  });

  it('should fail discovery when the directory is the only way to resolve anything', async () => {
    mockConfig['coinlore.ids'] = {};
    mockConfig['coinlore.coins'] = ['NEO'];

    // Nothing resolves without the directory here, so the failure must propagate and let
    // CoinIdFetcher retry rather than advertising a half-initialized source.
    mockedAxios.get.mockRejectedValue(new Error('ETIMEDOUT'));

    jest.useFakeTimers();

    try {
      const failing = createApi();

      // Collapses the backoff between the three discovery attempts.
      await jest.advanceTimersByTimeAsync(60000);
      await failing.ready;

      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
      expect(failing.enabledCoins).toEqual(new Set());
      await expect(failing.fetch('USD')).resolves.toEqual({});
      expect(mockNotifier.notify).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('CoinLore'),
      );
    } finally {
      jest.useRealTimers();
      mockedAxios.get.mockReset();
    }
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;

    const rates = await api.fetch('USD');

    expect(rates).toEqual({});
  });
});
