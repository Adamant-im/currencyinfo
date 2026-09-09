import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { CoingeckoApi } from './coingecko';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CoingeckoApi Connector', () => {
  let api: CoingeckoApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;
  let mockNotifier: Partial<Notifier>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'coingecko.enabled': true,
      'coingecko.api_key': 'CG-demo-key',
      'coingecko.coins': ['BTC', 'ETH'],
      'coingecko.ids': ['bitcoin', 'ethereum'],
      'coingecko.weight': 500,
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

    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    // Mock initial coin list fetch
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' },
        { id: 'ethereum', symbol: 'eth', name: 'Ethereum' },
      ],
    });

    api = new CoingeckoApi(configService, mockLogger as Logger, mockNotifier as Notifier);
  });

  it('should initialize and fetch remote coin IDs successfully', async () => {
    await api.ready;
    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ETH']));
    expect(mockLogger.info).toHaveBeenCalledWith('Coingecko coin IDs fetched successfully.');
  });

  it('should fetch exchange rates against base currency', async () => {
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        bitcoin: { usd: 60000.12345678 },
        ethereum: { usd: 3000.98765432 },
      },
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 60000.12345678,
      'ETH/USD': 3000.98765432,
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Coingecko rates updated against USD successfully.',
    );
  });

  it('should handle partial rate availability and log warnings', async () => {
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        bitcoin: { usd: 60000 },
        // ethereum rate is missing
      },
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 60000,
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Unable to get rates for Coingecko ID 'ethereum'"),
    );
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch('USD');
    expect(rates).toEqual({});
  });

  it('should authenticate every request with the Demo plan key header', async () => {
    await api.ready;

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.coingecko.com/api/v3/coins/list',
      expect.objectContaining({
        headers: { 'x-cg-demo-api-key': 'CG-demo-key' },
      }),
    );

    mockedAxios.get.mockResolvedValueOnce({
      data: { bitcoin: { usd: 60000 }, ethereum: { usd: 3000 } },
    });

    await api.fetch('USD');

    expect(mockedAxios.get).toHaveBeenLastCalledWith(
      'https://api.coingecko.com/api/v3/simple/price',
      expect.objectContaining({
        headers: { 'x-cg-demo-api-key': 'CG-demo-key' },
      }),
    );
  });

  it('should stay disabled without an API key', () => {
    const configService = {
      get: jest.fn((key: string) => ({ ...mockConfig, 'coingecko.api_key': undefined })[key]),
    } as unknown as ConfigService;

    const unauthenticated = new CoingeckoApi(
      configService,
      mockLogger as Logger,
      mockNotifier as Notifier,
    );

    expect(unauthenticated.enabled).toBe(false);
  });

  it('should request every resolved ID only once when coins and ids overlap', async () => {
    await api.ready;

    mockedAxios.get.mockResolvedValueOnce({
      data: { bitcoin: { usd: 60000 }, ethereum: { usd: 3000 } },
    });

    await api.fetch('USD');

    const [, options] = mockedAxios.get.mock.calls[mockedAxios.get.mock.calls.length - 1];
    expect((options as { params: { ids: string } }).params.ids).toBe('bitcoin,ethereum');
  });

  it('should keep the first id when two configured ids carry the same symbol', async () => {
    jest.clearAllMocks();

    mockConfig['coingecko.coins'] = [];
    mockConfig['coingecko.ids'] = ['tether', 'bridged-tether'];

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { id: 'tether', symbol: 'usdt', name: 'Tether' },
        { id: 'bridged-tether', symbol: 'usdt', name: 'Bridged Tether' },
      ],
    });

    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    const colliding = new CoingeckoApi(
      configService,
      mockLogger as Logger,
      mockNotifier as Notifier,
    );
    await colliding.ready;

    expect(colliding.enabledCoins).toEqual(new Set(['USDT']));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping Coingecko id 'bridged-tether'"),
    );

    mockedAxios.get.mockResolvedValueOnce({ data: { tether: { usd: 1.0001 } } });

    const rates = await colliding.fetch('USD');

    expect(rates).toEqual({ 'USDT/USD': 1.0001 });
  });

  it('should warn about ambiguous symbols instead of silently substituting a coin', async () => {
    jest.clearAllMocks();

    mockConfig['coingecko.coins'] = ['ADM'];
    mockConfig['coingecko.ids'] = [];

    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { id: 'adamant-messenger', symbol: 'adm', name: 'ADAMANT Messenger' },
        { id: 'adm-token', symbol: 'adm', name: 'Some Other ADM' },
      ],
    });

    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    const ambiguous = new CoingeckoApi(
      configService,
      mockLogger as Logger,
      mockNotifier as Notifier,
    );
    await ambiguous.ready;

    expect(ambiguous.enabledCoins).toEqual(new Set(['ADM']));
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('matches 2 coins (adamant-messenger, adm-token)'),
    );
  });
});
