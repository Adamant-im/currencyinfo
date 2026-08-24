import { Schema } from 'src/global/config/schema';
import { RatesMerger } from '.';
import { TickerPrice } from '../sources/api/dto/tickers.dto';
import { SourcesManager } from '../sources/sources-manager';

describe('RatesMerger', () => {
  const rateLifetime = 30;
  const notifier = {
    warn: jest.fn(),
    error: jest.fn(),
    notify: jest.fn(),
  } as any;
  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      const mockConfig: Partial<Schema> = {
        decimals: 8,
        rateDifferencePercentThreshold: 25,
        groupPercentage: 20,
        minSources: 2,
        priorities: ['sourceName1', 'sourceName2', 'sourceName3', 'sourceName4', 'sourceName5'],
        base_coins: ['USD', 'BTC', 'ETH'],
      };
      return mockConfig[key as keyof Schema];
    }),
  } as any;
  const sourcesManager = new SourcesManager(config, notifier);
  sourcesManager.allCoins = ['BTC', 'ETH', 'USD', 'ADM'];

  class RatesMergerMock extends RatesMerger {
    sourcesManager = sourcesManager;
    rateLifetime = rateLifetime;
    pairSources = {
      'BTC/USD': 3,
      'ETH/USD': 2,
      'ADM/USD': 1,
    };
    notifier = notifier;
    config = config;
  }

  const currentTime = new Date(Date.UTC(2025, 1, 1)).valueOf() / 1000 / 60;

  let ratesMerger: RatesMerger;

  beforeEach(async () => {
    const weights = {
      sourceName1: 100,
      sourceName2: 100,
      sourceName3: 50,
      sourceName4: 50,
      sourceName5: 2000,
    };

    ratesMerger = new RatesMergerMock('avg', weights);
    ratesMerger.getTimestamp = jest.fn(() => currentTime);
  });

  it('should be defined', () => {
    expect(ratesMerger).toBeDefined();
  });

  describe('normalizeTickers and mutual inverse triangulation', () => {
    it('should triangulate cross-rates and guarantee mutually inverse pairs', () => {
      const initialTickers = {
        'BTC/USD': 50000,
        'ETH/USD': 2500,
        'ADM/USD': 0.05,
        'USD/USD': 1,
      };

      const normalized = ratesMerger.normalizeTickers(initialTickers);

      // BTC/ETH rate: 1 BTC = 50000 / 2500 = 20 ETH
      expect(normalized['BTC/ETH']).toBe(20);
      // ETH/BTC rate: 1 ETH = 2500 / 50000 = 0.05 BTC
      expect(normalized['ETH/BTC']).toBe(0.05);

      // Verify mutual inverse relationship: (BTC/ETH) * (ETH/BTC) === 1
      expect(normalized['BTC/ETH'] * normalized['ETH/BTC']).toBeCloseTo(1, 6);

      // ADM/BTC rate: 0.05 / 50000 = 0.000001
      expect(normalized['ADM/BTC']).toBe(0.000001);
      // USD/BTC rate: 1 / 50000 = 0.00002
      expect(normalized['USD/BTC']).toBe(0.00002);
    });
  });

  describe('cutRatesBySourceCount', () => {
    it('should drop rates that do not meet minSources requirement', () => {
      ratesMerger.sourceTickers = {
        'BTC/USD': [{ price: 50000, source: 's1', timestamp: currentTime }], // requires 3, got 1
        'ETH/USD': [
          { price: 2500, source: 's1', timestamp: currentTime },
          { price: 2510, source: 's2', timestamp: currentTime },
        ], // requires 2, got 2
        'ADM/USD': [{ price: 0.05, source: 's1', timestamp: currentTime }], // requires 1, got 1
      };

      const squished = {
        'BTC/USD': 50000,
        'ETH/USD': 2505,
        'ADM/USD': 0.05,
      };

      const result = ratesMerger.cutRatesBySourceCount(squished);
      expect(result['BTC/USD']).toBeUndefined();
      expect(result['ETH/USD']).toBe(2505);
      expect(result['ADM/USD']).toBe(0.05);
    });
  });

  describe('squishTickers', () => {
    it('should calculate the average price across the available sources', () => {
      const outdatedTimestamp = currentTime - rateLifetime - 1;

      const sourceTickers = {
        'BTC/USD': [
          {
            source: 'sourceName1',
            price: 50_000,
            timestamp: outdatedTimestamp,
          },
          {
            source: 'sourceName2',
            price: 105_000,
            timestamp: currentTime,
          },
          {
            source: 'sourceName2',
            price: 110_000,
            timestamp: currentTime,
          },
        ],
        'ETH/USD': [
          {
            source: 'sourceName1',
            price: 2_300,
            timestamp: outdatedTimestamp,
          },
          {
            source: 'sourceName4',
            price: 4_600,
            timestamp: currentTime,
          },
        ],
      };

      const [tickers, errors] = ratesMerger.squishTickers(sourceTickers, ratesMerger.rateLifetime);

      expect(errors).toStrictEqual([]);
      expect(tickers).toStrictEqual({ 'BTC/USD': 107500, 'ETH/USD': 4600 });
    });

    it('should return an error for a significant difference between the actual tickers', () => {
      const outdatedTimestamp = currentTime - rateLifetime - 1;

      const sourceTickers = {
        'BTC/USD': [
          {
            source: 'sourceName1',
            price: 10_000,
            timestamp: currentTime,
          },
          {
            source: 'sourceName2',
            price: 105_000,
            timestamp: currentTime,
          },
        ],
        'ETH/USD': [
          {
            source: 'sourceName1',
            price: 2_300,
            timestamp: outdatedTimestamp,
          },
          {
            source: 'sourceName4',
            price: 4_600,
            timestamp: currentTime,
          },
        ],
      };

      const [tickers, errors] = ratesMerger.squishTickers(sourceTickers, ratesMerger.rateLifetime);

      expect(errors).toStrictEqual([
        [
          'BTC/USD',
          'The difference between sources is too big: 10000 (sourceName1) against 105000 (sourceName2)',
        ],
      ]);
      expect(tickers).toStrictEqual({ 'ETH/USD': 4600 });
    });
  });

  describe('getBiggestGroupPrice', () => {
    it('should return an error when no prices were provided', () => {
      const [error, group] = ratesMerger.getBiggestGroupPrice([]);

      expect(error).toBe('No prices for the pair available');
      expect(group).toBeNull();
    });

    it('should return the only group available', () => {
      const prices: TickerPrice[] = [
        { source: 'sourceName3', price: 0.8, timestamp: 1720000000000 },
        { source: 'sourceName4', price: 0.83, timestamp: 1720000000000 },
      ];

      const [error, group] = ratesMerger.getBiggestGroupPrice(prices);

      expect(error).toBeNull();
      expect(group).toStrictEqual({
        prices: [
          { price: 0.8, priority: 2, source: 'sourceName3', weight: 50 },
          { price: 0.83, priority: 1, source: 'sourceName4', weight: 50 },
        ],
        weight: 100,
      });
    });

    it('should return the biggest group by weight', () => {
      const prices: TickerPrice[] = [
        { source: 'sourceName1', price: 1.2, timestamp: 1720000000000 },
        { source: 'sourceName2', price: 1.25, timestamp: 1720000000000 },
        { source: 'sourceName3', price: 0.8, timestamp: 1720000000000 },
        { source: 'sourceName4', price: 0.83, timestamp: 1720000000000 },
        { source: 'sourceName5', price: 500, timestamp: 1720000000000 },
      ];

      const [error, group] = ratesMerger.getBiggestGroupPrice(prices);

      expect(error).toBeNull();
      expect(group).toStrictEqual({
        prices: [{ price: 500, priority: 0, source: 'sourceName5', weight: 2000 }],
        weight: 2000,
      });
    });
  });

  describe('splitIntoGroups', () => {
    it('should correctly split prices into groups', () => {
      const prices: TickerPrice[] = [
        { source: 'sourceName1', price: 1.2, timestamp: 1720000000000 },
        { source: 'sourceName2', price: 1.25, timestamp: 1720000000000 },
        { source: 'sourceName3', price: 0.8, timestamp: 1720000000000 },
        { source: 'sourceName4', price: 0.83, timestamp: 1720000000000 },
        { source: 'sourceName5', price: 500, timestamp: 1720000000000 },
      ];

      const groups = ratesMerger.splitIntoGroups(prices);

      expect(groups).toStrictEqual([
        {
          prices: [
            { price: 0.8, priority: 2, source: 'sourceName3', weight: 50 },
            { price: 0.83, priority: 1, source: 'sourceName4', weight: 50 },
          ],
          weight: 100,
        },
        {
          prices: [
            { price: 1.2, priority: 4, source: 'sourceName1', weight: 100 },
            { price: 1.25, priority: 3, source: 'sourceName2', weight: 100 },
          ],
          weight: 200,
        },
        {
          prices: [{ price: 500, priority: 0, source: 'sourceName5', weight: 2000 }],
          weight: 2000,
        },
      ]);
    });

    it('should return empty list when no prices have been provided', () => {
      const groups = ratesMerger.splitIntoGroups([]);

      expect(groups).toStrictEqual([]);
    });
  });
});
