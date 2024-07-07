import type { SourcePrice } from '.';

export function avg(prices: SourcePrice[]) {
  return prices.reduce((a, b) => a + b.price, 0) / prices.length;
}

export function min(prices: SourcePrice[]) {
  return Math.min(...prices.map(({ price }) => price));
}

export function max(prices: SourcePrice[]) {
  return Math.max(...prices.map(({ price }) => price));
}

export function priority(prices: SourcePrice[]) {
  return biggestBy('priority', prices).price;
}

export function weight(prices: SourcePrice[]) {
  return biggestBy('weight', prices).price;
}

function biggestBy(key: keyof SourcePrice, prices: SourcePrice[]) {
  let [biggest] = prices;
  for (const price of prices) {
    if (price[key] > biggest[key]) {
      biggest = price;
    }
  }
  return biggest;
}
