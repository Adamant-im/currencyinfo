import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { ExchangeRateApi } from './exchangerateapi';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ExchangeRateApi Connector', () => {
  let api: ExchangeRateApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;

  const createApi = (config: Record<string, any>) => {
    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    return new ExchangeRateApi(configService, mockLogger as Logger);
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'exchange_rate_api.enabled': true,
      'exchange_rate_api.url': 'https://open.er-api.com/v6/latest/USD',
      'exchange_rate_api.codes': ['EUR', 'RUB', 'USD'],
      'exchange_rate_api.weight': 500,
      decimals: 6,
    };

    mockLogger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    api = createApi(mockConfig);
  });

  it('should initialize enabledCoins from the configured codes', () => {
    expect(api.enabledCoins).toEqual(new Set(['EUR', 'RUB', 'USD']));
    expect(api.enabled).toBe(true);
    expect(api.weight).toBe(500);
  });

  it('should invert the USD-quoted rates and round them to decimals', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        result: 'success',
        provider: 'https://www.exchangerate-api.com',
        base_code: 'USD',
        rates: {
          USD: 1,
          RUB: 86.409515, // 1 / 86.409515 = 0.011572799…
          EUR: 0.861401, // 1 / 0.861401 = 1.160899…
        },
      },
    });

    const rates = await api.fetch();

    expect(mockedAxios.get).toHaveBeenCalledWith('https://open.er-api.com/v6/latest/USD', {
      timeout: 10000,
    });
    expect(rates['USD/USD']).toBe(1);
    expect(rates['RUB/USD']).toBe(0.011573);
    expect(rates['EUR/USD']).toBeCloseTo(1.1609, 5);
    expect(mockLogger.info).toHaveBeenCalledWith('ExchangeRateApi rates updated successfully.');
  });

  it('should throw when the response reports a failure', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        result: 'error',
        'error-type': 'unsupported-code',
      },
    });

    await expect(api.fetch()).rejects.toThrow('unsupported-code');
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('should throw when the successful response carries no rates map', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        result: 'success',
        base_code: 'USD',
      },
    });

    await expect(api.fetch()).rejects.toThrow('https://open.er-api.com/v6/latest/USD');
  });

  it('should skip missing, zero, negative and non-numeric rates', async () => {
    const skippingApi = createApi({
      ...mockConfig,
      'exchange_rate_api.codes': ['RUB', 'JPY', 'CNY', 'GBP', 'XXX'],
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        result: 'success',
        base_code: 'USD',
        rates: {
          RUB: 86.409515,
          JPY: 0,
          CNY: -6.736206,
          GBP: '0.74', // non-numeric type
          // XXX is missing entirely
        },
      },
    });

    const rates = await skippingApi.fetch();

    expect(rates).toEqual({ 'RUB/USD': 0.011573 });
    expect(mockLogger.info).toHaveBeenCalledWith('ExchangeRateApi rates updated successfully.');
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;

    const rates = await api.fetch();

    expect(rates).toEqual({});
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
