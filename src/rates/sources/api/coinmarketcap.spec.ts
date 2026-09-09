import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { CoinmarketcapApi } from './coinmarketcap';

jest.mock('axios');
const mockedAxios = axios as unknown as jest.Mock;

describe('CoinmarketcapApi Connector', () => {
  let api: CoinmarketcapApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;
  let mockNotifier: Partial<Notifier>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'coinmarketcap.enabled': true,
      'coinmarketcap.api_key': 'TEST_CMC_API_KEY',
      'coinmarketcap.coins': ['BTC', 'ETH'],
      'coinmarketcap.weight': 500,
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
    mockedAxios.mockResolvedValueOnce({
      data: {
        data: [
          { id: 1, symbol: 'BTC', name: 'Bitcoin' },
          { id: 1027, symbol: 'ETH', name: 'Ethereum' },
        ],
      },
    });

    api = new CoinmarketcapApi(configService, mockLogger as Logger, mockNotifier as Notifier);
  });

  it('should initialize and fetch remote coin IDs successfully', async () => {
    await api.ready;
    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ETH']));
    expect(mockLogger.info).toHaveBeenCalledWith('Coinmarketcap coin IDs fetched successfully.');
  });

  it('should fetch quotes against base currency', async () => {
    await api.ready;

    mockedAxios.mockResolvedValueOnce({
      data: {
        data: {
          '1': {
            symbol: 'BTC',
            id: '1',
            quote: { USD: { price: 65000.5 } },
          },
          '1027': {
            symbol: 'ETH',
            id: '1027',
            quote: { USD: { price: 3500.25 } },
          },
        },
      },
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 65000.5,
      'ETH/USD': 3500.25,
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Coinmarketcap rates updated against USD successfully.',
    );
  });

  it('should notify error if all coin rates are unavailable', async () => {
    await api.ready;

    mockedAxios.mockResolvedValueOnce({
      data: {
        data: {},
      },
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({});
    expect(mockNotifier.notify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Unable to get all of 2 coin rates'),
    );
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch('USD');
    expect(rates).toEqual({});
  });
});
