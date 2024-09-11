import { Schema } from 'src/global/config/schema';
import { RatesMerger } from '.';
import { TickerPrice } from '../sources/api/dto/tickers.dto';
import { SourcesManager } from '../sources/sources-manager';

describe('SourcesManager', () => {
  const rateLifetime = 30;
  const notifier = {
    warn: jest.fn(),
    error: jest.fn(),
  } as any;
  const config = {
    get: jest.fn().mockImplementation((key: string) => {
      const mockConfig = {
        rateDifferencePercentThreshold: 25,
        groupPercentage: 20,
        minSources: 2,
        priorities: [
          'sourceName1',
          'sourceName2',
          'sourceName3',
          'sourceName4',
          'sourceName5',
        ],
      } as Partial<Schema>;
      return mockConfig[key as keyof Schema];
    }),
  } as any;
  const sourcesManager = new SourcesManager(config, notifier);
  sourcesManager.allCoins = ['BTC', 'ETH', 'USD'];

  class RatesMergerMock extends RatesMerger {
    sourcesManager = sourcesManager;
    allCoins = ['BTC', 'ETH', 'USD'];
    rateLifetime = rateLifetime;
    pairSources = {
      'BTC/USD': 3,
      'ETH/USD': 2,
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

      const [tickers, errors] = ratesMerger.squishTickers(
        sourceTickers,
        ratesMerger.rateLifetime,
      );

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

      const [tickers, errors] = ratesMerger.squishTickers(
        sourceTickers,
        ratesMerger.rateLifetime,
      );

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
        prices: [
          { price: 500, priority: 0, source: 'sourceName5', weight: 2000 },
        ],
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
          prices: [
            { price: 500, priority: 0, source: 'sourceName5', weight: 2000 },
          ],
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
