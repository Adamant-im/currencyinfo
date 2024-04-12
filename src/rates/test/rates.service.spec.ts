import { getModelToken } from '@nestjs/mongoose';

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
    if (propertyPath in mockConfig) {
      return mockConfig[propertyPath as keyof typeof mockConfig];
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
        { provide: getModelToken('Ticker'), useValue: {} },
      ],
    }).compile();

    ratesService = module.get<RatesService>(RatesService);
  });

  it('should notify about significant differs', () => {
    ratesService.sourceTickers = {
      'USD/BTC': {
        source: 'Coingecko',
        price: 0.00001,
      },
    };

    const success = ratesService.mergeTickers(
      {
        'USD/BTC': 0.0000016,
      },
      { name: 'Test' },
    );

    expect(success).toBeFalsy();
  });

  it('should normalize and merge tickers', () => {
    ratesService.sourceTickers = {
      'USD/RUB': { source: 'MOEX', price: 91 },
      'JPY/USD': { source: 'MOEX', price: 0.0067 },

      'USD/BTC': { source: 'MOEX', price: 0.000016 },
      'ETH/USD': { source: 'MOEX', price: 3467 },
    };

    const success = ratesService.mergeTickers(
      {
        'USD/BTC': 0.0000157,
      },
      { name: 'Test' },
    );

    expect(success).toBeTruthy();
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
