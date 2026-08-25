import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { MoexApi } from './moex';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MoexApi Connector', () => {
  let api: MoexApi;
  let mockConfig: Record<string, any>;
  let mockLogger: Partial<Logger>;
  let mockNotifier: Partial<Notifier>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      'moex.enabled': true,
      'moex.url': 'https://iss.moex.com/iss/engines/currency/markets/selt/securities.jsonp',
      'moex.codes': {
        'USD/RUB': 'USD000UTSTOM',
        'EUR/RUB': 'EUR_TODTOM',
        'JPY/RUB': 'JPYRUB_TOM',
      },
      'moex.weight': 500,
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

    api = new MoexApi(configService, mockLogger as Logger, mockNotifier as Notifier);
  });

  it('should initialize enabledCoins correctly', () => {
    expect(api.enabledCoins).toEqual(new Set(['RUB', 'EUR', 'JPY']));
  });

  it('should fetch MOEX rates and calculate cross-rates and JPY division', async () => {
    // MoexData tuple: [..., [1]=secid, [2]=code, ..., [14]=price1, [15]=price2]
    const makeTicker = (code: string, price1: number, price2: number) => {
      const row = new Array(33).fill(null);
      row[1] = 'CETS';
      row[2] = code;
      row[14] = price1;
      row[15] = price2;
      return row;
    };

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        securities: {
          data: [
            makeTicker('USD000UTSTOM', 100, 100), // USD/RUB = 100
            makeTicker('EUR_TODTOM', 110, 110), // EUR/RUB = 110
            makeTicker('JPYRUB_TOM', 70, 70), // JPY/RUB = 70 / 100 = 0.70
          ],
        },
      },
    });

    const rates = await api.fetch();

    expect(rates).toEqual({
      'RUB/USD': 0.01, // 1 / 100
      'EUR/RUB': 110,
      'EUR/USD': 1.1, // 110 / 100
      'JPY/RUB': 0.7, // 70 / 100
      'JPY/USD': 0.007, // 0.7 / 100
    });
    expect(mockLogger.info).toHaveBeenCalledWith('MOEX rates updated successfully.');
  });

  it('should return empty object if disabled', async () => {
    api.enabled = false;
    const rates = await api.fetch();
    expect(rates).toEqual({});
  });
});
