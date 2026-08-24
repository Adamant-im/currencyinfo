import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { CryptoCompareApi } from './cryptocompare';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CryptoCompareApi Connector', () => {
  let api: CryptoCompareApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'cryptocompare.enabled': true,
      'cryptocompare.api_key': 'TEST_CC_KEY',
      'cryptocompare.coins': ['BTC', 'ETH'],
      'cryptocompare.weight': 500,
      decimals: 8,
    };

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const configService = {
      get: jest.fn((key: string) => mockConfig[key]),
    } as unknown as ConfigService;

    api = new CryptoCompareApi(configService, mockLogger as Logger);
  });

  it('should initialize enabledCoins correctly', () => {
    expect(api.enabledCoins).toEqual(new Set(['BTC', 'ETH']));
  });

  it('should fetch exchange rates against base currency', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        BTC: { USD: 65000.12345678 },
        ETH: { USD: 3500.87654321 },
      },
    });

    const rates = await api.fetch('USD');

    expect(rates).toEqual({
      'BTC/USD': 65000.12345678,
      'ETH/USD': 3500.87654321,
    });
    expect(mockLogger.info).toHaveBeenCalledWith(
      'CryptoCompare rates updated against USD successfully.',
    );
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch('USD');
    expect(rates).toEqual({});
  });
});
