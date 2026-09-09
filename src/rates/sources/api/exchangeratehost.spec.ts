import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { ExchangeRateHost } from './exchangeratehost';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ExchangeRateHost Connector', () => {
  let api: ExchangeRateHost;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'exchange_rate_host.enabled': true,
      'exchange_rate_host.api_key': 'TEST_EXR_KEY',
      'exchange_rate_host.codes': ['EUR', 'JPY'],
      'exchange_rate_host.weight': 500,
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

    api = new ExchangeRateHost(configService, mockLogger as Logger);
  });

  it('should initialize enabledCoins correctly', () => {
    expect(api.enabledCoins).toEqual(new Set(['EUR', 'JPY']));
  });

  it('should fetch quotes and perform 1/rate inversion correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        quotes: {
          USDEUR: 0.90909091, // 1 / 0.90909091 = 1.10
          USDJPY: 150, // 1 / 150 = 0.00666667
        },
      },
    });

    const rates = await api.fetch();

    expect(rates['EUR/USD']).toBeCloseTo(1.1, 2);
    expect(rates['JPY/USD']).toBeCloseTo(0.00666667, 7);
    expect(mockLogger.info).toHaveBeenCalledWith('ExchangeRateHost rates updated successfully.');
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch();
    expect(rates).toEqual({});
  });
});
