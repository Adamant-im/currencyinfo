import { calculatePercentageDifference } from 'src/shared/utils';
import { SourceTickers, TickerPrice, Tickers } from '../api/dto/tickers.dto';
import * as strategies from './strategy';
import { Notifier } from 'src/global/notifier/notifier.service';

export type StrategyName = keyof typeof strategies;

interface ResourceWeights {
  [resourceName: string]: number;
}

interface RatesMergerOptions {
  baseCoins: string[];
  decimals: number;
  weights: ResourceWeights;
  priorities: string[];
  threshold: number;
  groupPercentage: number;
  minSources: number;
  rateLifetime: number;
}

export interface SourcePrice {
  price: number;
  priority: number;
  weight: number;
}

interface PriceGroup {
  weight: number;
  prices: SourcePrice[];
}

export abstract class RatesMerger {
  tickers: Tickers;

  sourceTickers: SourceTickers;

  protected rateLifetime: number;

  private baseCoins: string[];
  private decimals: number;

  private weights: ResourceWeights;
  private priorities: string[];

  private threshold: number;
  private groupPercentage: number;

  private minSources: number;

  private strategy: (prices: SourcePrice[]) => number;

  abstract notifier: Notifier;

  protected abstract allCoins: string[];
  protected abstract pairSources: Record<string, number>;

  constructor(strategyName: StrategyName, options: RatesMergerOptions) {
    this.strategy = strategies[strategyName];

    this.baseCoins = options.baseCoins;
    this.decimals = options.decimals;

    this.weights = options.weights;
    this.priorities = options.priorities;

    this.threshold = options.threshold;
    this.groupPercentage = options.groupPercentage;

    this.minSources = options.minSources;
    this.rateLifetime = options.rateLifetime;

    this.tickers = {};
    this.sourceTickers = {};
  }

  /**
   * Updates the latest tickers from the given data,
   * avoiding significant changes.
   */
  mergeTickers(data: Tickers, options: { name: string }) {
    const sourceTickers: SourceTickers = {};

    const timestamp = this.getTimestamp();
    for (const [rate, price] of Object.entries(data)) {
      const prices = this.sourceTickers[rate] || [];

      prices.push({
        source: options.name,
        price,
        timestamp,
      });

      sourceTickers[rate] = prices;
    }

    this.setTickers(sourceTickers);
  }

  /**
   * Adjusts the rates for each base coin using the USD rate.
   */
  normalizeTickers(tickers: Tickers) {
    const decimals = this.decimals;

    const enabledCoins = this.allCoins;

    this.baseCoins?.forEach((baseCoin) => {
      const price =
        tickers[`USD/${baseCoin}`] || 1 / tickers[`${baseCoin}/USD`];

      if (!price) {
        return;
      }

      enabledCoins.forEach((coin) => {
        const priceAlt = 1 / tickers[`${coin}/USD`];

        if (!priceAlt) {
          return;
        }

        tickers[`${coin}/${baseCoin}`] = +(price / priceAlt).toFixed(decimals);
      });
    });

    return tickers;
  }

  setTickers(tickers: SourceTickers) {
    this.sourceTickers = {
      ...this.sourceTickers,
      ...tickers,
    };

    this.tickers = this.getTickersWithLifetime(this.rateLifetime, true);
  }

  getTickersWithLifetime(rateLifetime: number, isPlannedUpdate = false) {
    const [squishedTickers, rateDifferences] = this.squishTickers(rateLifetime);

    if (rateDifferences.length && isPlannedUpdate) {
      this.notifier.notify(
        'error',
        `Error: rates from different sources significantly differs for pairs: ${rateDifferences.join(', ')}`,
      );
    }

    const minimizedTickers = this.cutRatesBySourceCount(squishedTickers);

    return this.normalizeTickers(minimizedTickers);
  }

  cutRatesBySourceCount(squishedTickers: Tickers) {
    const minimizedTickers: Tickers = {};

    for (const [rate, prices] of Object.entries(this.sourceTickers)) {
      const minSourcesForPair = Math.min(
        this.pairSources[rate] || 1,
        this.minSources,
      );

      if (prices.length >= minSourcesForPair) {
        minimizedTickers[rate] = squishedTickers[rate];
      }
    }

    return minimizedTickers;
  }

  /**
   * Uses the chosen strategy to squish the tickers from
   * different sources into one piece.
   */
  squishTickers(lifetime: number) {
    const tickers: Tickers = {};
    const errors: string[] = [];

    const timestamp = this.getTimestamp();

    for (const [pair, prices] of Object.entries(this.sourceTickers)) {
      const [success, group] = this.getBiggestGroupPrice(
        prices.filter((price) => timestamp - price.timestamp < lifetime),
      );

      if (success) {
        tickers[pair] = this.strategy(group.prices);
      } else {
        errors.push(pair);
      }
    }

    return [tickers, errors] as const;
  }

  /**
   * Returns the biggest group of the group prices if the biggest
   * group is heavier than the second biggest group by `this.groupPercentage`%
   *
   * @see {@link splitIntoGroups} for more details on how the groups are made.
   */
  getBiggestGroupPrice(
    prices: TickerPrice[],
  ): [true, PriceGroup] | [false, null] {
    // no prices, no groups
    if (!prices.length) {
      return [false, null];
    }

    const groups = this.splitIntoGroups(prices);

    const [biggestGroup, secondBiggestGroup] = groups.sort(
      (a, b) => b.weight - a.weight,
    );

    // only one group
    if (!secondBiggestGroup) {
      return [true, biggestGroup];
    }

    const differenceBetweenBiggestGroups = calculatePercentageDifference(
      biggestGroup.weight,
      secondBiggestGroup.weight,
    );

    if (differenceBetweenBiggestGroups > this.groupPercentage) {
      return [true, biggestGroup];
    }

    return [false, null];
  }

  /**
   * Splits the prices into groups where the difference between
   * the lowest and the biggest price of the group is lower than `this.threshold`.
   *
   * Summarizes the weight of each group based on `this.weights`.
   *
   * @example
   * ```js
   * const res = this.splitIntoGroups(
   *   [
   *     { price: 0.1, source: '...' },
   *     { price: 0.12, source: '...' },
   *     { price: 20, source: '...' },
   *     { price: 1000, source: '...' },
   *     { price: 1050, source: '...' }
   *   ]
   * )
   *
   * expect(res).toBe([
   *   {
   *     weight: 20,
   *     prices: [0.1, 0.12]
   *   },
   *   {
   *     weight: 10,
   *     prices: [20]
   *   },
   *   {
   *     weight: 20,
   *     prices: [1000, 1050]
   *   }
   * ])
   * ```
   */
  splitIntoGroups(prices: TickerPrice[]) {
    const sorted = prices.sort(
      (ticker1, ticker2) => ticker1.price - ticker2.price,
    );
    const groups = [];

    let prevSeparator = -1;
    for (const [startIndex, startPrice] of sorted.entries()) {
      const { source: startSource, price: startNum } = startPrice;

      const group: PriceGroup = {
        weight: this.weights[startSource],
        prices: [
          {
            price: startNum,
            weight: this.weights[startSource],
            priority: this.getPriority(startSource),
          },
        ],
      };
      let separator = startIndex;

      for (let index = startIndex + 1; index < sorted.length; index++) {
        const price = sorted[index];
        const { source, price: num } = price;

        const diff = calculatePercentageDifference(startNum, num);

        if (diff > this.threshold) {
          break;
        }

        const weight = this.weights[source];

        group.weight += weight;
        group.prices.push({
          weight,
          price: num,
          priority: this.getPriority(source),
        });

        separator = index;
      }

      if (separator > prevSeparator) {
        groups.push(group);
        prevSeparator = separator;
      }
    }

    return groups;
  }

  getPriority(source: string) {
    const index = this.priorities.indexOf(source);

    return this.priorities.length - index - 1;
  }

  /**
   * Returns unix timestamp in minutes
   */
  getTimestamp() {
    return Math.floor(Date.now() / 1000 / 60);
  }
}
