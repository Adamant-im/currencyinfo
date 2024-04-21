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

  private baseCoins: string[];
  private decimals: number;

  private weights: ResourceWeights;
  private priorities: string[];

  private threshold: number;
  private groupPercentage: number;

  private minSources: number;

  private strategy: (prices: SourcePrice[]) => number;

  abstract notifier: Notifier;

  constructor(strategyName: StrategyName, options: RatesMergerOptions) {
    this.strategy = strategies[strategyName];

    this.baseCoins = options.baseCoins;
    this.decimals = options.decimals;

    this.weights = options.weights;
    this.priorities = options.priorities;

    this.threshold = options.threshold;
    this.groupPercentage = options.groupPercentage;

    this.minSources = options.minSources;

    this.tickers = {};
    this.sourceTickers = {};
  }

  abstract getAllCoins(): string[];

  /**
   * Updates the latest tickers from the given data,
   * avoiding significant changes.
   */
  mergeTickers(data: Tickers, options: { name: string }) {
    const sourceTickers: SourceTickers = {};

    for (const [rate, price] of Object.entries(data)) {
      const prices = this.sourceTickers[rate]?.prices || [];

      prices.push([options.name, price]);

      sourceTickers[rate] = {
        price,
        prices,
        source: options.name,
      };
    }

    this.setTickers(
      this.normalizeTickers({
        ...this.sourceTickers,
        ...sourceTickers,
      }),
    );

    return true;
  }

  /**
   * Adjusts the rates for each base coin using the USD rate.
   */
  normalizeTickers(tickers: SourceTickers) {
    const decimals = this.decimals;

    this.baseCoins?.forEach((baseCoin) => {
      const price =
        tickers[`USD/${baseCoin}`]?.price ||
        1 / tickers[`${baseCoin}/USD`]?.price;

      if (!price) {
        return;
      }

      this.getAllCoins().forEach((coin) => {
        const priceAlt = 1 / tickers[`${coin}/USD`]?.price;

        if (!priceAlt) {
          return;
        }

        tickers[`${coin}/${baseCoin}`] = {
          ...tickers[`${coin}/USD`],
          price: +(price / priceAlt).toFixed(decimals),
        };
      });
    });

    return tickers;
  }

  setTickers(tickers: SourceTickers) {
    this.sourceTickers = tickers;

    const [errors, squishedTickers] = this.squishTickers();

    if (errors.length) {
      this.notifier.notify(
        'error',
        `Error: rates from different sources significantly differs for pairs: ${errors.join(', ')}`,
      );
    }

    const minimizedTickers: Tickers = {};

    for (const [rate, ticker] of Object.entries(this.sourceTickers)) {
      if (ticker.prices.length >= this.minSources) {
        minimizedTickers[rate] = squishedTickers[rate];
      }
    }

    this.tickers = minimizedTickers;
  }

  /**
   * Uses the chosen strategy to squish the tickers from
   * different sources into one piece.
   */
  squishTickers() {
    const tickers: Tickers = {};
    const errors: string[] = [];

    for (const [pair, rate] of Object.entries(this.sourceTickers)) {
      const [success, group] = this.getBiggestGroupPrice(rate.prices);

      if (success) {
        tickers[pair] = this.strategy(group.prices);
      } else {
        errors.push(pair);
      }
    }

    return [errors, tickers] as const;
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
    const sorted = prices.sort(([, price1], [, price2]) => price1 - price2);
    const groups = [];

    let prevSeparator = -1;
    for (const [startIndex, startPrice] of sorted.entries()) {
      const [startSource, startNum] = startPrice;

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
        const [source, num] = price;

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
}
