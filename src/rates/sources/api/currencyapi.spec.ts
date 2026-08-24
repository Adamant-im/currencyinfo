import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { CurrencyApi } from './currencyapi';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CurrencyApi Connector', () => {
  let api: CurrencyApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'currency_api.enabled': true,
      'currency_api.url':
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
      'currency_api.codes': ['EUR', 'RUB'],
      'currency_api.weight': 500,
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

    api = new CurrencyApi(configService, mockLogger as Logger);
  });

  it('should initialize enabledCoins correctly', () => {
    expect(api.enabledCoins).toEqual(new Set(['EUR', 'RUB']));
  });

  it('should fetch fiat rates and perform 1/rate inversion correctly', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        usd: {
          eur: 0.90909091, // 1 / 0.90909091 = 1.10
          rub: 0.01, // 1 / 0.01 = 100
        },
      },
    });

    const rates = await api.fetch();

    expect(rates['EUR/USD']).toBeCloseTo(1.1, 2);
    expect(rates['RUB/USD']).toBe(100);
    expect(mockLogger.info).toHaveBeenCalledWith('CurrencyApi rates updated successfully.');
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch();
    expect(rates).toEqual({});
  });
});
