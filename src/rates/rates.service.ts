import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';

import { Model, PipelineStage, Types } from 'mongoose';
import { AxiosError } from 'axios';

import { Notifier } from 'src/global/notifier/notifier.service';

import { Tickers } from './api/dto/tickers.dto';
import { Ticker } from './schemas/ticker.schema';
import { Timestamp } from './schemas/timestamp.schema';

import { BaseApi } from './api/base';

import { CurrencyApi } from './api/currencyapi';
import { CoingeckoApi } from './api/coingecko';
import { CryptoCompareApi } from './api/cryptocompare';
import { MoexApi } from './api/moex';
import { CoinmarketcapApi } from './api/coinmarketcap';
import { ExchangeRateHost } from './api/exchangeratehost';
import { GetHistoryDto } from './schemas/getHistory.schema';
import { RatesMerger, StrategyName } from './merger';

export interface HistoricalResult {
  _id: Types.ObjectId;
  date: number;
  tickers: Tickers;
}

const CronIntervals = {
  EVERY_10_MINUTES: 10 * 60 * 1000,
  EVERY_SECOND: 1000, // For debugging
};

const BASE_CURRENCY = 'USD';

@Injectable()
export class RatesService extends RatesMerger {
  lastUpdated = 0;
  refreshInterval: number;
  initializationTimestamp = Date.now();

  protected allCoins: string[] = [];
  protected pairSources: Record<string, number> = {};

  private ready: Promise<void>;

  private sources: BaseApi[];
  private sourceCount: number;

  private readonly logger;

  constructor(
    @InjectModel(Ticker.name) private tickerModel: Model<Ticker>,
    @InjectModel(Timestamp.name) private timestampModel: Model<Timestamp>,
    private schedulerRegistry: SchedulerRegistry,
    private config: ConfigService,
    public notifier: Notifier,
  ) {
    const decimals = config.get('decimals') as number;
    const strategyName = config.get('strategy') as StrategyName;

    const threshold = config.get('rateDifferencePercentThreshold') as number;
    const groupPercentage = config.get('groupPercentage') as number;

    const minSources = config.get('minSources') as number;
    const rateLifetime = config.get('rateLifetime') as number;

    const priorities = config.get('priorities') as string[];
    const baseCoins = config.get('base_coins') as string[];

    const refreshInterval = config.get<number>('refreshInterval');

    const logger = new Logger();

    const sources = [
      // Fiat tickers
      new CurrencyApi(config, logger),
      new ExchangeRateHost(config, logger),
      new MoexApi(config, logger, notifier),

      // Crypto tickers
      new CoinmarketcapApi(config, logger, notifier),
      new CryptoCompareApi(config, logger),
      new CoingeckoApi(config, logger, notifier),
    ];

    const weights = sources.reduce((obj: Record<string, number>, source) => {
      obj[source.resourceName] = source.weight;
      return obj;
    }, {});

    const enabledCoinsSet = new Set<string>();
    sources.forEach((source) => {
      source.enabledCoins?.forEach((coin) => enabledCoinsSet.add(coin));
    });

    const unavailableBaseCoins = baseCoins.filter(
      (coin) => !enabledCoinsSet.has(coin),
    );

    if (unavailableBaseCoins.length) {
      logger.warn(
        `No resources provide rates for the following base coins: ${unavailableBaseCoins.join(', ')}. As a result, the rates for these base coins will NOT be saved.`,
      );
    }

    super(strategyName, {
      baseCoins,
      weights,
      decimals,
      priorities,
      threshold,
      groupPercentage,
      minSources,
      rateLifetime,
    });

    this.logger = logger;
    this.sources = sources;

    this.refreshInterval = refreshInterval
      ? refreshInterval * 60 * 1000
      : CronIntervals.EVERY_10_MINUTES;

    this.sourceCount = this.sources.filter((source) => source.enabled).length;

    this.ready = this.getEnabledCoins();

    this.init();
  }

  /**
   * Initializes the process of updating tickers and schedules it.
   */
  init() {
    const interval = setInterval(
      this.updateTickers.bind(this),
      this.refreshInterval,
    );
    this.schedulerRegistry.addInterval('tickers', interval);

    this.updateTickers();
  }

  async getEnabledCoins() {
    const enabledSources = this.sources.filter((source) => source.enabled);

    await Promise.all(enabledSources.map((source) => source.ready));

    const mappings = this.config.get<Record<string, string>>('mappings');

    const coins = new Set<string>();

    for (const source of enabledSources) {
      source.enabledCoins.forEach((enabledCoin) => {
        const baseCoin = mappings?.[enabledCoin] ?? enabledCoin;

        if (baseCoin !== 'USD') {
          const pairName = `${baseCoin}/USD`;
          this.pairSources[pairName] = Math.min(
            (this.pairSources[pairName] || 0) + 1,
            this.minSources,
          );

          coins.add(baseCoin);
        }
      });
    }

    const pairsWithLowSourceCount: Array<[string, number]> = [];

    for (const [pairName, sourceCount] of Object.entries(this.pairSources)) {
      if (sourceCount < this.minSources) {
        pairsWithLowSourceCount.push([pairName, sourceCount]);
      }
    }

    if (pairsWithLowSourceCount.length) {
      this.logger.warn(
        `The following pairs have fewer enabled sources than the configured minimum (minSources=${this.minSources}), but they are going to be saved anyway: ${pairsWithLowSourceCount
          .map(([pairName, sourceCount]) => `${pairName} (${sourceCount})`)
          .join(', ')}`,
      );
    }

    this.allCoins = [...coins];
  }

  /**
   * Retrieves data from all enabled API sources and stores it in the
   * database if successful responses exceed the `config.minSources`.
   */
  async updateTickers() {
    this.logger.log('Updating rates…');

    await this.ready;

    let availableSources = 0;

    for (const source of this.sources) {
      if (!source.enabled) {
        continue;
      }

      const tickers = await this.fetchTickers(source);

      if (!tickers) {
        this.notifier.notify(
          'warn',
          `Unable to get data from ${source.resourceName}. InfoService will provide previous rates; historical rates wouldn't be saved for the source.`,
        );

        continue;
      }

      this.mergeTickers(this.applyMappings(tickers), {
        name: source.resourceName,
      });

      availableSources += 1;
    }

    if (availableSources <= 0) {
      return this.fail(
        `Unable to get new rates from all sources. No data has been saved`,
      );
    }

    const ratesWithFewerSources = this.getRatesWithFewerSources();

    if (ratesWithFewerSources.length) {
      this.notifier.notify(
        'warn',
        `The following rates have been fetched from fewer sources than expected and therefore won't be saved: ${ratesWithFewerSources
          .map(
            ([pair, expected, got]) =>
              `${pair} (expected ${expected}, but got ${got})`,
          )
          .join('; ')}`,
      );
    }

    if (this.rateDifferences.length) {
      const error = this.rateDifferences
        .map(([pair, error]) => `${pair} ${error}`)
        .join('\n');

      this.fail(`The rates won't be saved for the following pairs:\n${error}`);
    }

    await this.saveTickers(availableSources);
  }

  async saveTickers(availableSources: number) {
    const date = Date.now();

    const tickers = [];

    for (const [pair, rate] of Object.entries(this.tickers)) {
      const [base, quote] = pair.split('/');

      tickers.push({
        base,
        quote,
        rate,
        date,
      });
    }

    try {
      await this.tickerModel.create(tickers);
      await this.timestampModel.create({
        date,
      });

      this.lastUpdated = date;

      this.logger.log(
        `Rates from ${availableSources}/${this.sourceCount} sources saved successfully`,
      );
    } catch (error) {
      this.fail(
        `Error: Unable to save new rates in history database: ${String(error).replace(/(\.)+?$/, '')}. See logs for details`,
      );
      this.logger.error(JSON.stringify(tickers));
    }
  }

  /**
   * Returns the latest cached tickers for specified coins.
   * To retrieve tickers for all available coins, pass an empty array.
   */
  async getTickers(coins: string[] = [], rateLifetime = this.rateLifetime) {
    const requestedCoins = new Set(coins);

    const tickers =
      rateLifetime === this.rateLifetime
        ? this.tickers
        : this.getTickersWithLifetime(rateLifetime);

    if (!requestedCoins.size) {
      return tickers;
    }

    const filteredCoins: Tickers = {};

    for (const [ticker, rate] of Object.entries(tickers)) {
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

    if (from !== undefined && to !== undefined) {
      if (from > to) {
        throw new HttpException(
          "Wrong time interval: 'to' should be more, than 'from'",
          HttpStatus.BAD_REQUEST,
        );
      }

      queries.push({
        $match: {
          date: {
            $gte: from * 1000,
            $lte: to * 1000,
          },
        },
      });
    }

    let limit = Math.min(options.limit || 100, 100);

    if (timestamp) {
      const lastTimestamp = await this.timestampModel.findOne(
        {
          date: { $lte: timestamp * 1000 },
        },
        null,
        { sort: { date: -1 } },
      );

      if (!lastTimestamp) {
        return [];
      }

      queries.push({
        $match: { date: lastTimestamp.date },
      });
    }

    if (coin) {
      if (coin.includes('/')) {
        const [quoteCoin, baseCoin] = coin.split('/');

        const match: { quote?: string; base?: string } = {};
        if (quoteCoin) {
          match.quote = quoteCoin;
        }
        if (baseCoin) {
          match.base = baseCoin;
        }

        queries.push({ $match: match });
      } else {
        queries.push({
          $match: {
            $or: [{ base: coin }, { quote: coin }],
          },
        });
      }
    }

    queries.push({ $sort: { _id: -1 } });

    const results: HistoricalResult[] = [];

    const cursor = this.tickerModel
      .aggregate(queries)
      .cursor({ batchSize: 200 });

    let doc: Ticker | null = await cursor.next();

    if (!doc) {
      return [];
    }

    let lastDate = doc?.date;
    let tickers: Tickers = {};

    while (limit > 0) {
      if (!doc) {
        await this.addTickerWithTimestamp(results, tickers, lastDate);
        break;
      }

      if (doc.date !== lastDate) {
        await this.addTickerWithTimestamp(results, tickers, lastDate);
        lastDate = doc.date;
        tickers = {};
        limit -= 1;
      }

      tickers[`${doc.base}/${doc.quote}`] = doc.rate;

      doc = await cursor.next();
    }

    return results;
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

      this.fail(message.join(' '));
    }
  }

  async addTickerWithTimestamp(
    results: HistoricalResult[],
    tickers: Tickers,
    date: number,
  ) {
    const timestamp = await this.timestampModel.findOne({ date });

    if (timestamp) {
      results.push({
        _id: timestamp._id,
        date,
        tickers,
      });
    }
  }

  applyMappings(tickers: Tickers) {
    const mappings = this.config.get<Record<string, string>>('mappings');

    if (!mappings) {
      return tickers;
    }

    for (const [pair, price] of Object.entries(tickers)) {
      let [quote, base] = pair.split('/');

      quote = mappings[quote] || quote;
      base = mappings[base] || base;

      delete tickers[pair];

      tickers[`${quote}/${base}`] = price;
    }

    return tickers;
  }

  fail(reason: string) {
    this.notifier.notify('error', reason);
  }
}
