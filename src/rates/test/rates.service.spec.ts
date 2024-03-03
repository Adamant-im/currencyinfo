import { getModelToken } from '@nestjs/mongoose';
import { getRedisConnectionToken } from '@nestjs-modules/ioredis';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { Notifier } from 'src/global/notifier/notifier.service';
import { RatesService } from '../rates.service';

const mockConfig = {
  decimals: 12,
  rateDifferencePercentThreshold: 5,
  base_coins: ['BTC', 'RUB', 'JPY'],
};

const mockConfigService = {
  get: jest.fn().mockImplementation((propertyPath: string) => {
    if (mockConfig[propertyPath]) {
      return mockConfig[propertyPath];
    }

    if (propertyPath.includes('coins')) {
      return [];
    }

    if (propertyPath.includes('enabled')) {
      return false;
    }

    return '';
  }),
};

describe('RatesService', () => {
  let ratesService: RatesService;

  beforeEach(async () => {
    jest.spyOn(RatesService.prototype, 'init').mockImplementation(() => {
      // do nothing
    });

    jest.spyOn(RatesService.prototype, 'fail').mockImplementation((arg) => {
      return arg;
    });

    jest.spyOn(RatesService.prototype, 'getAllCoins').mockImplementation(() => {
      return ['BTC', 'ETH'];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatesService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SchedulerRegistry, useValue: {} },
        { provide: Notifier, useValue: {} },
        { provide: getRedisConnectionToken('default'), useValue: {} },
        { provide: getModelToken('Ticker'), useValue: {} },
      ],
    }).compile();

    ratesService = module.get<RatesService>(RatesService);
  });

  it('should notify about significant differs', () => {
    ratesService.tickers = {
      'USD/BTC': 0.00001,
    };

    const error = ratesService.mergeTickers(
      {
        'USD/BTC': 0.000016,
      },
      { name: 'Test' },
    );

    expect(error).toMatch(/46\%/);
  });

  it('should normalize and merge tickers', () => {
    ratesService.tickers = {
      'USD/RUB': 91,
      'JPY/USD': 0.0067,

      'USD/BTC': 0.000016,
      'ETH/USD': 3467,
    };

    const error = ratesService.mergeTickers(
      {
        'USD/BTC': 0.0000157,
      },
      { name: 'Test' },
    );

    expect(error).toBeUndefined();
    expect(ratesService.tickers).toEqual({
      'USD/RUB': 91,
      'JPY/USD': 0.0067,
      'USD/BTC': 0.0000157,
      'ETH/USD': 3467,
      'ETH/BTC': 0.0544319,
      'ETH/RUB': 315497,
      'ETH/JPY': 517462.68656716426,
    });
  });
});
