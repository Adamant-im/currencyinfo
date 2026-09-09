import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { BinanceApi } from './binance';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';
const TICKER_PRICE_URL = 'https://api.binance.com/api/v3/ticker/price';

/**
 * Builds a rejection value that satisfies the mocked `axios.isAxiosError` predicate.
 */
const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  });

/**
 * Builds a single `exchangeInfo` market entry.
 */
const marketInfo = (baseAsset: string, quoteAsset: string, status = 'TRADING') => ({
  symbol: `${baseAsset}${quoteAsset}`,
  status,
  baseAsset,
  quoteAsset,
});

describe('BinanceApi Connector', () => {
  let api: BinanceApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;
  let mockNotifier: Partial<Notifier>;

  const createApi = () => {
    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    return new BinanceApi(configService, mockLogger as Logger, mockNotifier as Notifier);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'binance.enabled': true,
      'binance.coins': ['BTC', 'ETH'],
      'binance.quote_asset': 'USDT',
      'binance.weight': 300,
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

    // jest.mock('axios') replaces the real type guard, so give it a working implementation.
    mockedAxios.isAxiosError.mockImplementation((payload: any) => Boolean(payload?.isAxiosError));

    // Mock the market discovery performed in the constructor.
    mockedAxios.get.mockResolvedValueOnce({
      data: { symbols: [marketInfo('BTC', 'USDT'), marketInfo('ETH', 'USDT')] },
    });

    api = createApi();
  });

  it('should resolve markets from a single bulk exchangeInfo call', async () => {
    await api.ready;

    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(EXCHANGE_INFO_URL, {
      params: { symbols: JSON.stringify(['BTCUSDT', 'ETHUSDT']) },
      timeout: 15000,
    });
    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ETH']));
    expect(api.weight).toBe(300);
    expect(mockLogger.info).toHaveBeenCalledWith('Binance coin IDs fetched successfully.');
  });

  it('should emit <COIN>/USD pairs parsed from the string prices', async () => {
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { symbol: 'BTCUSDT', price: '81867.52000000' },
        { symbol: 'ETHUSDT', price: '2712.345678912' },
      ],
    });

    const rates = await api.fetch('USD');

    expect(mockedAxios.get).toHaveBeenLastCalledWith(TICKER_PRICE_URL, {
      params: { symbols: JSON.stringify(['BTCUSDT', 'ETHUSDT']) },
      timeout: 10000,
    });
    expect(rates).toEqual({
      'BTC/USD': 81867.52,
      'ETH/USD': 2712.34567891,
    });
    expect(mockLogger.info).toHaveBeenCalledWith('Binance rates updated against USD successfully.');
  });

  it('should request a configurable quote asset and still emit USD pairs', async () => {
    await api.ready;
    jest.clearAllMocks();

    mockConfig['binance.quote_asset'] = 'USDC';

    mockedAxios.get.mockResolvedValueOnce({
      data: { symbols: [marketInfo('BTC', 'USDC'), marketInfo('ETH', 'USDC')] },
    });

    const usdcApi = createApi();
    await usdcApi.ready;

    expect(mockedAxios.get).toHaveBeenCalledWith(EXCHANGE_INFO_URL, {
      params: { symbols: JSON.stringify(['BTCUSDC', 'ETHUSDC']) },
      timeout: 15000,
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { symbol: 'BTCUSDC', price: '81800.10000000' },
        { symbol: 'ETHUSDC', price: '2700.00000000' },
      ],
    });

    const rates = await usdcApi.fetch('USD');

    expect(mockedAxios.get).toHaveBeenLastCalledWith(TICKER_PRICE_URL, {
      params: { symbols: JSON.stringify(['BTCUSDC', 'ETHUSDC']) },
      timeout: 10000,
    });
    expect(rates).toEqual({
      'BTC/USD': 81800.1,
      'ETH/USD': 2700,
    });
  });

  it('should drop duplicates and a coin equal to the quote asset', async () => {
    await api.ready;
    jest.clearAllMocks();

    mockConfig['binance.coins'] = ['BTC', 'usdt', 'btc'];

    mockedAxios.get.mockResolvedValueOnce({
      data: { symbols: [marketInfo('BTC', 'USDT')] },
    });

    const normalized = createApi();
    await normalized.ready;

    expect(mockedAxios.get).toHaveBeenCalledWith(EXCHANGE_INFO_URL, {
      params: { symbols: JSON.stringify(['BTCUSDT']) },
      timeout: 15000,
    });
    expect(normalized.enabledCoins).toEqual(new Set(['BTC']));
  });

  it('should validate symbols one by one when the bulk call is rejected with HTTP 400', async () => {
    await api.ready;
    jest.clearAllMocks();

    mockConfig['binance.coins'] = ['BTC', 'ADM'];

    // One unlisted symbol fails the whole bulk request with -1121 Invalid symbol.
    mockedAxios.get.mockRejectedValueOnce(httpError(400));
    mockedAxios.get.mockResolvedValueOnce({ data: { symbols: [marketInfo('BTC', 'USDT')] } });
    mockedAxios.get.mockRejectedValueOnce(httpError(400));

    const partial = createApi();
    await partial.ready;

    expect(mockedAxios.get).toHaveBeenNthCalledWith(2, EXCHANGE_INFO_URL, {
      params: { symbol: 'BTCUSDT' },
      timeout: 15000,
    });
    expect(mockedAxios.get).toHaveBeenNthCalledWith(3, EXCHANGE_INFO_URL, {
      params: { symbol: 'ADMUSDT' },
      timeout: 15000,
    });
    expect(partial.enabledCoins).toEqual(new Set(['BTC']));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Market 'ADMUSDT' is not listed on Binance"),
    );

    mockedAxios.get.mockResolvedValueOnce({
      data: [{ symbol: 'BTCUSDT', price: '81867.52000000' }],
    });

    const rates = await partial.fetch('USD');

    expect(rates).toEqual({ 'BTC/USD': 81867.52 });
  });

  it('should filter out markets that are not trading', async () => {
    await api.ready;
    jest.clearAllMocks();

    mockedAxios.get.mockResolvedValueOnce({
      data: { symbols: [marketInfo('BTC', 'USDT'), marketInfo('ETH', 'USDT', 'BREAK')] },
    });

    const trading = createApi();
    await trading.ready;

    expect(trading.enabledCoins).toEqual(new Set(['BTC']));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not trading and will be skipped: ETHUSDT'),
    );
  });

  it('should disable the source without throwing when discovery is geo-blocked', async () => {
    await api.ready;
    jest.clearAllMocks();

    mockedAxios.get.mockRejectedValueOnce(httpError(451));

    const blocked = createApi();
    await expect(blocked.ready).resolves.toBeUndefined();

    expect(blocked.enabled).toBe(false);
    // A legal block is not transient, so it must not be retried.
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockNotifier.notify).toHaveBeenCalledTimes(1);
    expect(mockNotifier.notify).toHaveBeenCalledWith('error', expect.stringContaining('HTTP 451'));
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('HTTP 451'));
    await expect(blocked.fetch('USD')).resolves.toEqual({});
  });

  it('should disable the source and return no rates when fetching is geo-blocked', async () => {
    await api.ready;

    mockedAxios.get.mockRejectedValueOnce(httpError(451));

    const rates = await api.fetch('USD');

    expect(rates).toEqual({});
    expect(api.enabled).toBe(false);
    expect(mockNotifier.notify).toHaveBeenCalledWith('error', expect.stringContaining('HTTP 451'));
  });

  it('should return no rates for a base currency other than USD', async () => {
    await api.ready;

    const rates = await api.fetch('EUR');

    expect(rates).toEqual({});
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Binance provides rates against USD only'),
    );
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch('USD');
    expect(rates).toEqual({});
  });
});
