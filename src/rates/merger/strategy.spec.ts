import { avg, max, min, priority, weight } from './strategy';
import type { SourcePrice } from './index';

describe('Merger Strategies', () => {
  const prices: SourcePrice[] = [
    {
      price: 100,
      source: 'SourceA',
      priority: 1,
      weight: 10,
    },
    {
      price: 200,
      source: 'SourceB',
      priority: 3,
      weight: 50,
    },
    {
      price: 300,
      source: 'SourceC',
      priority: 2,
      weight: 20,
    },
  ];

  describe('avg', () => {
    it('should compute the arithmetic average of prices', () => {
      expect(avg(prices)).toBe(200);
    });

    it('should return 0 for empty prices array', () => {
      expect(avg([])).toBe(0);
    });
  });

  describe('min', () => {
    it('should return the minimum price', () => {
      expect(min(prices)).toBe(100);
    });
  });

  describe('max', () => {
    it('should return the maximum price', () => {
      expect(max(prices)).toBe(300);
    });
  });

  describe('priority', () => {
    it('should return the price from the source with highest priority', () => {
      expect(priority(prices)).toBe(200); // SourceB has priority 3
    });

    it('should prefer last listed source over unlisted source', () => {
      const competingPrices: SourcePrice[] = [
        {
          price: 50,
          source: 'UnlistedSource',
          priority: 0,
          weight: 10,
        },
        {
          price: 99,
          source: 'LastListedSource',
          priority: 1,
          weight: 10,
        },
      ];
      expect(priority(competingPrices)).toBe(99);
    });
  });

  describe('weight', () => {
    it('should return the price from the source with highest weight', () => {
      expect(weight(prices)).toBe(200); // SourceB has weight 50
    });
  });
});
