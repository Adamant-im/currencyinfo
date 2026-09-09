import type { SourcePrice } from '.';

/**
 * Calculates arithmetic average across all source prices.
 */
export function avg(prices: SourcePrice[]): number {
  if (!prices.length) return 0;
  return prices.reduce((a, b) => a + b.price, 0) / prices.length;
}

/**
 * Returns minimum price among all sources.
 */
export function min(prices: SourcePrice[]): number {
  return Math.min(...prices.map(({ price }) => price));
}

/**
 * Returns maximum price among all sources.
 */
export function max(prices: SourcePrice[]): number {
  return Math.max(...prices.map(({ price }) => price));
}

/**
 * Returns price from the source with the highest configured priority.
 */
export function priority(prices: SourcePrice[]): number {
  return biggestBy('priority', prices).price;
}

/**
 * Returns price from the source with the highest configured weight.
 */
export function weight(prices: SourcePrice[]): number {
  return biggestBy('weight', prices).price;
}

/**
 * Helper to select the item with the highest numeric value for a given key.
 */
function biggestBy(key: keyof SourcePrice, prices: SourcePrice[]): SourcePrice {
  let [biggest] = prices;
  for (const price of prices) {
    if (price[key] > biggest[key]) {
      biggest = price;
    }
  }
  return biggest;
}
