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
});
