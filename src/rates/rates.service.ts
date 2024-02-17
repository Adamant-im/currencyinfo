import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';

import Redis from 'ioredis';
import { Model, PipelineStage } from 'mongoose';
import { AxiosError } from 'axios';

import { Notifier } from 'src/global/notifier/notifier.service';
import {
  calculatePercentageDifference,
  getTimestamp,
  isPositiveOrZeroNumber,
} from 'src/shared/utils';

import { Tickers } from './api/dto/tickers.dto';
import { Ticker } from './schemas/ticker.schema';

import { BaseApi } from './api/base';

import { CurrencyApi } from './api/currencyapi';
import { CoingeckoApi } from './api/coingecko';
import { CryptoCompareApi } from './api/cryptocompare';
import { MoexApi } from './api/moex';
import { CoinmarketcapApi } from './api/coinmarketcap';
import { GetHistoryDto } from './schemas/getHistory.schema';
import { InjectRedis } from '@nestjs-modules/ioredis';

const CronIntervals = {
  EVERY_10_MINUTES: 10 * 60 * 1000,
  EVERY_SECOND: 1000, // For debugging
};

interface ApiSource {
  source: BaseApi;
  merge: boolean;
}

@Injectable()
export class RatesService {
  private tickers: Tickers = {};
  private sources: ApiSource[];

  private readonly logger = new Logger();

  constructor(
    @InjectRedis() private readonly redis: Redis,
    @InjectModel(Ticker.name) private tickerModel: Model<Ticker>,
    private schedulerRegistry: SchedulerRegistry,
    private config: ConfigService,
    private notifier: Notifier,
  ) {
    this.sources = [
      { source: new CurrencyApi(this.config), merge: true },
      {
        source: new CoinmarketcapApi(this.config, this.logger, this.notifier),
        merge: true,
      },
      { source: new MoexApi(this.config), merge: true },
      { source: new CryptoCompareApi(this.config, this.logger), merge: true },
      {
        source: new CoingeckoApi(this.config, this.logger, this.notifier),
        merge: true,
      },
    ];

    this.init();
  }

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

  async updateTickers() {
    this.logger.log('Updating rates…');

    const minSources = this.config.get<number>('minSources') ?? 1;

    let availableSources = 0;

    for (const { source, merge } of this.sources) {
      const tickers = await this.fetchTickers(source);

      if (!tickers) {
        this.fail(
          `Error: Unable to get data from ${source.name}. InfoService will provide previous rates; historical rates wouldn't be saved.`,
        );

        continue;
      }

      this.mergeTickers(tickers, { merge, name: source.name });

      availableSources += 1;
    }

    if (availableSources < minSources) {
      return this.logger.warn(
        `Unable to get new rates from ${this.sources.length - availableSources} sources. No data has been saved`,
      );
    }

    try {
      const timestamp = getTimestamp();

      const createdTicker = new this.tickerModel({
        timestamp,
        tickers: this.tickers,
      });

      await createdTicker.save();

      await this.redis.set('last_updated', timestamp);

      this.logger.log(
        `Rates from ${availableSources}/${this.sources.length} sources saved successfully`,
      );
    } catch (error) {
      this.notifier.notify(
        'error',
        `Error: Unable to save new rates in history database: ${error}`,
      );
    }
  }

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

  async getHistoryTickers(options: GetHistoryDto) {
    const { from, to, timestamp, coin } = options;

    const queries: PipelineStage[] = [];

    if (from && to) {
      queries.push({
        $match: {
          timestamp: {
            $gte: from,
            $lte: to,
          },
        },
      });
    }

    let limit = Math.min(options.limit || 100, 100);

    if (timestamp) {
      queries.push({ $match: { timestamp: { $lte: timestamp } } });

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
      { $sort: { timestamp: -1 } },
      { $limit: limit },
    ]);

    return result;
  }

  async fetchTickers(source: BaseApi): Promise<Tickers | undefined> {
    try {
      const tickers = await source.fetch('USD');

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

  private mergeTickers(
    data: Tickers,
    options: { name: string; merge: boolean },
  ) {
    if (!options.merge) {
      this.tickers = this.normalizeTickers(data);
    }

    const acceptableDifference = this.config.get(
      'rateDifferencePercentThreshold',
    );
    const decimals = this.config.get<number>('decimals');

    const alerts: string[] = [];

    for (const [key, income] of Object.entries(data)) {
      const saved = this.tickers[key];

      if (isPositiveOrZeroNumber(income) && isPositiveOrZeroNumber(saved)) {
        const difference = calculatePercentageDifference(income, saved);

        if (difference > acceptableDifference) {
          alerts.push(
            `**${key}** ${difference.toFixed(0)}%: ${income.toFixed(decimals)} (${options.name}) — ${saved.toFixed(decimals)}`,
          );
        }
      }
    }

    if (alerts.length) {
      const alertString = alerts.join(', ');

      return this.fail(
        `Error: rates from different sources significantly differs: ${alertString}. InfoService will provide previous rates; historical rates wouldn't be saved.`,
      );
    }

    this.tickers = this.normalizeTickers({ ...this.tickers, ...data });
  }

  /**
   * Calculates rates for each base coin using USD rate
   */
  private normalizeTickers(tickers: Tickers) {
    const baseCoins = this.config.get<string[]>('base_coins');
    const decimals = this.config.get<number>('decimals');

    baseCoins?.forEach((baseCoin) => {
      const price =
        tickers[`USD/${baseCoin}`] || 1 / tickers[`${baseCoin}/USD`];

      if (!price) {
        return;
      }

      this.getAllCoins().forEach((coin) => {
        const priceAlt = 1 / tickers[`${coin}/USD`];

        tickers[`${coin}/${baseCoin}`] = +(price / priceAlt).toFixed(decimals);
      });
    });

    return tickers;
  }

  private getAllCoins() {
    const sources = this.sources.filter(({ source }) =>
      ['Coingecko', 'Coinmarketcap'].includes(source.name),
    );

    const coins = new Set(
      sources.flatMap(
        ({ source }) => source.coins?.map((coin) => coin.symbol) ?? [],
      ),
    );

    return [...coins];
  }

  private fail(reason: string) {
    this.notifier.notify('error', reason);
  }
}
