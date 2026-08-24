import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';

import { Model, PipelineStage, Types } from 'mongoose';
import { AxiosError } from 'axios';

import { Notifier } from 'src/global/notifier/notifier.service';

import { SourceTickers, Tickers } from './sources/api/dto/tickers.dto';
import { BaseApi } from './sources/api/base';

import { Ticker } from './schemas/ticker.schema';
import { Timestamp } from './schemas/timestamp.schema';

import { GetHistoryDto } from './schemas/getHistory.schema';
import { RatesMerger, StrategyName } from './merger';
import { SourcesManager } from './sources/sources-manager';

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

/**
 * Core rates service managing periodic data fetching, merging, persistence in MongoDB,
 * and querying current and historical rates.
 */
@Injectable()
export class RatesService extends RatesMerger {
  lastUpdated = 0;
  refreshInterval: number;
  initializationTimestamp = Date.now();
  public rateLifetime: number;
  protected pairSources: Record<string, number> = {};

  private ready: Promise<void>;
  private readonly logger: Logger;

  constructor(
    @InjectModel(Ticker.name) private tickerModel: Model<Ticker>,
    @InjectModel(Timestamp.name) private timestampModel: Model<Timestamp>,
    private schedulerRegistry: SchedulerRegistry,
    protected config: ConfigService,
    protected sourcesManager: SourcesManager,
    public notifier: Notifier,
  ) {
    const refreshInterval = config.get<number>('refreshInterval');
    const logger = new Logger();

    const weights = sourcesManager.getSourceWeights();
    const strategyName = config.get('strategy') as StrategyName;

    super(strategyName, weights);

    this.logger = logger;
    this.rateLifetime = this.config.get<number>('rateLifetime') || 60;

    this.refreshInterval = refreshInterval
      ? refreshInterval * 60 * 1000
      : CronIntervals.EVERY_10_MINUTES;

    this.ready = sourcesManager.initialize();

    this.init();
  }

  /**
   * Initializes periodic rate fetching interval and triggers the first fetch.
   */
  init() {
    const interval = setInterval(this.updateTickers.bind(this), this.refreshInterval);
    this.schedulerRegistry.addInterval('tickers', interval);

    this.updateTickers();
  }

  /**
   * Fetches latest rate data from all enabled API sources, normalizes and persists to database.
   */
  async updateTickers() {
    this.logger.log('Updating exchange rates…');

    await this.ready;

    const sourceTickers: SourceTickers = {};
    let availableSources = 0;

    for (const source of this.sourcesManager.getEnabledSources()) {
      const tickers = await this.fetchTickers(source);

      if (!tickers) {
        this.notifier.notify(
          'warn',
          `Unable to fetch data from ${source.resourceName}. InfoService will provide previous rates; new rates won't be saved for this source.`,
        );

        continue;
      }

      this.mergeTickers(sourceTickers, this.applyMappings(tickers), {
        name: source.resourceName,
      });

      availableSources += 1;
    }

    this.setTickers(sourceTickers);

    if (availableSources <= 0) {
      return this.fail('Unable to get new rates from all sources. No data has been saved.');
    }

    const ratesWithFewerSources = this.getRatesWithFewerSources();

    if (ratesWithFewerSources.length) {
      this.notifier.notify(
        'warn',
        `The following rates have been fetched from fewer sources than expected and therefore won't be saved: ${ratesWithFewerSources
          .map(([pair, expected, got]) => `${pair} (expected ${expected}, but got ${got})`)
          .join('; ')}`,
      );
    }

    await this.saveTickers(availableSources);
  }

  /**
   * Persists merged rates and timestamp record in MongoDB.
   */
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
        `Rates from ${availableSources}/${this.sourcesManager.sourceCount} sources saved successfully.`,
      );
    } catch (error) {
      this.fail(
        `Error: Unable to save new rates in history database: ${String(error).replace(/(\.)+?$/, '')}. See logs for details.`,
      );
      this.logger.error(JSON.stringify(tickers));
    }
  }

  /**
   * Returns cached rates filtered by requested coins and lifetime constraints.
   *
   * @param coins - Optional list of coin symbols to filter
   * @param rateLifetime - Maximum allowed age of rates in minutes
   * @returns Filtered dictionary of pair-rate values
   */
  async getTickers(coins: string[] = [], rateLifetime = this.rateLifetime) {
    const requestedCoins = new Set(coins);

    const tickers: Tickers =
      rateLifetime === this.rateLifetime ? this.tickers : this.getTickersWithLifetime(rateLifetime);

    if (!requestedCoins.size) {
      return tickers;
    }

    const filteredCoins: Tickers = {};

    for (const [ticker, rate] of Object.entries(tickers)) {
      const tickerCoins = ticker.split('/');

      if (tickerCoins.some((coin) => requestedCoins.has(coin))) {
        filteredCoins[ticker] = rate;
      }
    }

    return filteredCoins;
  }

  /**
   * Retrieves historical rates from MongoDB based on time intervals, timestamps, and coin filters.
   *
   * @param options - Historical query parameters
   * @returns Array of historical ticker records
   */
  async getHistoryTickers(options: GetHistoryDto) {
    const { from, to, timestamp, coin } = options;

    const queries: PipelineStage[] = [];

    if (from !== undefined && to !== undefined) {
      if (from > to) {
        throw new HttpException(
          "Invalid time interval: 'to' timestamp must be greater than or equal to 'from'",
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

    const cursor = this.tickerModel.aggregate(queries).cursor({ batchSize: 200 });

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
   * Fetches rates from an individual external data source connector.
   *
   * @param source - Source API instance
   * @returns Tickers map or undefined on failure
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
          message.push(`Request to ${config.url} ${JSON.stringify(config.params)} failed`);

          if (error.response) {
            message.push(`with ${error.response.status} status code.`);
          }
        }
      }

      message.push(`Error: ${error}.`);

      this.fail(message.join(' '));
    }
  }

  /**
   * Associates tickers with their parent historical timestamp record ID.
   */
  async addTickerWithTimestamp(results: HistoricalResult[], tickers: Tickers, date: number) {
    const timestamp = await this.timestampModel.findOne({ date });

    if (timestamp) {
      results.push({
        _id: timestamp._id,
        date,
        tickers,
      });
    }
  }

  /**
   * Applies symbol renaming mappings from configuration to standard uniform symbols.
   */
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

  /**
   * Dispatches an error alert via Notifier.
   */
  fail(reason: string) {
    this.notifier.notify('error', reason);
  }
}
