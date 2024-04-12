import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';

import { Model, PipelineStage } from 'mongoose';
import { AxiosError } from 'axios';

import { Notifier } from 'src/global/notifier/notifier.service';
import {
  calculatePercentageDifference,
  isPositiveOrZeroNumber,
} from 'src/shared/utils';

import { Tickers, SourceTickers } from './api/dto/tickers.dto';
import { Ticker } from './schemas/ticker.schema';

import { BaseApi } from './api/base';

import { CurrencyApi } from './api/currencyapi';
import { CoingeckoApi } from './api/coingecko';
import { CryptoCompareApi } from './api/cryptocompare';
import { MoexApi } from './api/moex';
import { CoinmarketcapApi } from './api/coinmarketcap';
import { ExchangeRateHost } from './api/exchangeratehost';
import { GetHistoryDto } from './schemas/getHistory.schema';

const CronIntervals = {
  EVERY_10_MINUTES: 10 * 60 * 1000,
  EVERY_SECOND: 1000, // For debugging
};

const BASE_CURRENCY = 'USD';

@Injectable()
export class RatesService {
  lastUpdated = 0;
  sourceTickers: SourceTickers = {};

  private sources: BaseApi[];
  private sourceCount: number;

  private readonly logger = new Logger();

  constructor(
    @InjectModel(Ticker.name) private tickerModel: Model<Ticker>,
    private schedulerRegistry: SchedulerRegistry,
    private config: ConfigService,
    private notifier: Notifier,
  ) {
    this.sources = [
      // Fiat tickers
      new CurrencyApi(this.config, this.logger),
      new ExchangeRateHost(this.config, this.logger),
      new MoexApi(this.config, this.logger),

      // Crypto tickers
      new CoinmarketcapApi(this.config, this.logger, this.notifier),
      new CryptoCompareApi(this.config, this.logger),
      new CoingeckoApi(this.config, this.logger, this.notifier),
    ];

    this.sourceCount = this.sources.filter((source) => source.enabled).length;

    this.init();
  }

  get tickers(): Tickers {
    const tickers: Tickers = {};

    for (const [rate, ticker] of Object.entries(this.sourceTickers)) {
      tickers[rate] = ticker.price;
    }

    return tickers;
  }

  /**
   * Initializes the process of updating tickers and schedules it.
   */
  init() {
    const refreshInterval = this.config.get<number>('refreshInterval');

    const interval = setInterval(
      this.updateTickers.bind(this),
      refreshInterval
        ? refreshInterval * 60 * 1000
        : CronIntervals.EVERY_10_MINUTES,
    );
    this.schedulerRegistry.addInterval('tickers', interval);

    this.updateTickers();
  }

  /**
   * Retrieves data from all enabled API sources and stores it in the
   * database if successful responses exceed the `config.minSources`.
   */
  async updateTickers() {
    this.logger.log('Updating rates…');

    const minSources = this.config.get('minSources') as number;

    let availableSources = 0;

    for (const source of this.sources) {
      if (!source.enabled) {
        continue;
      }

      const tickers = await this.fetchTickers(source);

      if (!tickers) {
        this.fail(
          `Error: Unable to get data from ${source.resourceName}. InfoService will provide previous rates; historical rates wouldn't be saved.`,
        );

        continue;
      }

      const success = this.mergeTickers(tickers, { name: source.resourceName });

      if (success) {
        availableSources += 1;
      }
    }

    if (availableSources < minSources) {
      return this.logger.warn(
        `Unable to get new rates from ${this.sources.length - availableSources} sources. No data has been saved`,
      );
    }

    try {
      const timestamp = Date.now();

      const createdTicker = new this.tickerModel({
        date: timestamp,
        tickers: this.tickers,
      });

      await createdTicker.save();

      this.lastUpdated = timestamp;

      this.logger.log(
        `Rates from ${availableSources}/${this.sourceCount} sources saved successfully`,
      );
    } catch (error) {
      this.notifier.notify(
        'error',
        `Error: Unable to save new rates in history database: ${error}`,
      );
    }
  }

  /**
   * Returns the latest cached tickers for specified coins.
   * To retrieve tickers for all available coins, pass an empty array.
   */
  async getTickers(coins: string[]) {
    const requestedCoins = new Set(coins);

    if (!requestedCoins.size) {
      return this.tickers;
    }

    const filteredCoins: Tickers = {};

    for (const [ticker, rate] of Object.entries(this.tickers)) {
      const tickerCoins = ticker.split('/');

      // Check if the ticker includes any of the requested coins
      if (tickerCoins.some((coin) => requestedCoins.has(coin))) {
        filteredCoins[ticker] = rate;
      }
    }

    return filteredCoins;
  }

  /**
   * Retrieves tickers from the database for a specified
   * time period and coin, limited to 100 entries.
   */
  async getHistoryTickers(options: GetHistoryDto) {
    const { from, to, timestamp, coin } = options;

    const queries: PipelineStage[] = [];

    if (from && to) {
      queries.push({
        $match: {
          date: {
            $gte: from,
            $lte: to,
          },
        },
      });
    }

    let limit = Math.min(options.limit || 100, 100);

    if (timestamp) {
      queries.push({ $match: { date: { $lte: timestamp } } });

      limit = 1;
    }

    if (coin) {
      queries.push(
        {
          $addFields: {
            tickersArray: { $objectToArray: '$tickers' },
          },
        },
        {
          $addFields: {
            tickersArray: {
              $filter: {
                input: '$tickersArray',
                as: 'item',
                cond: {
                  $regexMatch: { input: '$$item.k', regex: coin },
                },
              },
            },
          },
        },
        {
          $addFields: {
            tickers: { $arrayToObject: '$tickersArray' },
          },
        },
        {
          $match: {
            'tickersArray.0': { $exists: true },
          },
        },
        {
          $project: {
            tickersArray: 0,
          },
        },
      );
    }

    const result = await this.tickerModel.aggregate([
      ...queries,
      { $sort: { date: -1 } },
      { $limit: limit },
    ]);

    return result;
  }

  /**
   * Attempts to fetch ticker data from a specific API source.
   * Returns `undefined` upon failure.
   */
  async fetchTickers(source: BaseApi): Promise<Tickers | undefined> {
    try {
      const tickers = await source.fetch(BASE_CURRENCY);

      return tickers;
    } catch (error) {
      const message: string[] = [];

      if (error instanceof AxiosError) {
        const { config } = error;

        if (config) {
          message.push(
            `Request to ${config.url} ${JSON.stringify(config.params)} failed`,
          );

          if (error.response) {
            message.push(`with ${error.response.status} status code.`);
          }
        }
      }

      message.push(`Error: ${error}.`);

      this.notifier.notify('error', message.join(' '));
    }
  }

  /**
   * Checks incoming tickers for significant changes against saved ones
   */
  compareTickers(data: Tickers, options: { name: string }) {
    const acceptableDifference = this.config.get(
      'rateDifferencePercentThreshold',
    );
    const decimals = this.config.get<number>('decimals');

    const alerts: string[] = [];

    for (const [key, income] of Object.entries(data)) {
      const saved = this.sourceTickers[key];

      if (!saved) {
        continue;
      }

      if (
        isPositiveOrZeroNumber(income) &&
        isPositiveOrZeroNumber(saved.price)
      ) {
        const difference = calculatePercentageDifference(income, saved.price);

        if (difference > acceptableDifference) {
          alerts.push(
            `**${key}** ${difference.toFixed(0)}%: ${income.toFixed(decimals)} (${options.name}) — ${saved.price.toFixed(decimals)} (${saved.source})`,
          );
        }
      }
    }

    if (alerts.length) {
      const alertString = alerts.join(', ');

      return `Error: rates from different sources significantly differs: ${alertString}. InfoService will provide previous rates; historical rates wouldn't be saved.`;
    }
  }

  /**
   * Updates the latest tickers from the given data,
   * avoiding significant changes.
   */
  mergeTickers(data: Tickers, options: { name: string }) {
    const error = this.compareTickers(data, options);

    if (error) {
      this.fail(error);
      return false;
    }

    const sourceTickers: SourceTickers = {};

    for (const [rate, price] of Object.entries(data)) {
      sourceTickers[rate] = {
        price,
        source: options.name,
      };
    }

    this.sourceTickers = this.normalizeTickers({
      ...this.sourceTickers,
      ...sourceTickers,
    });

    return true;
  }

  /**
   * Adjusts the rates for each base coin using the USD rate.
   */
  normalizeTickers(tickers: SourceTickers) {
    const baseCoins = this.config.get<string[]>('base_coins');
    const decimals = this.config.get<number>('decimals');

    baseCoins?.forEach((baseCoin) => {
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
          price: +(price / priceAlt).toFixed(decimals),
          source: tickers[`${coin}/USD`].source,
        };
      });
    });

    return tickers;
  }

  /**
   * Returns list of all the coin IDs from crypto tickers.
   */
  getAllCoins() {
    const sources = this.sources.filter((source) =>
      [CoingeckoApi.resourceName, CoinmarketcapApi.resourceName].includes(
        source.resourceName,
      ),
    );

    const coins = new Set(
      sources.flatMap(
        (source) => source.coins?.map((coin) => coin.symbol) ?? [],
      ),
    );

    return [...coins];
  }

  fail(reason: string) {
    this.notifier.notify('error', reason);
  }
}
