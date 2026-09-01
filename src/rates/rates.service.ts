import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';

import { Model, PipelineStage, Types } from 'mongoose';
import { AxiosError } from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { SourceTickers, Tickers } from './sources/api/dto/tickers.dto';
import { BaseApi } from './sources/api/base';

import { Ticker } from './schemas/ticker.schema';
import { Timestamp } from './schemas/timestamp.schema';

import { GetHistoryDto } from './schemas/getHistory.schema';
import { RatesMerger, StrategyName } from './merger';
import { SourcesManager } from './sources/sources-manager';
import {
  isNumber,
  sanitizeErrorMessage as sanitizeString,
  sanitizeParams as sanitizeObjectParams,
} from 'src/shared/utils';
import { completeCoinPair } from 'src/shared/schema-types';

/**
 * MongoDB match fragment restricting tickers to a requested coin or pair.
 */
type CoinMatch =
  { base?: string; quote?: string } | { $or: Array<{ base: string } | { quote: string }> };

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
 * Upper bound on ticker date groups examined by a single `/getHistory` request.
 *
 * Snapshots whose `timestamps` record is missing (a failed write between the two
 * non-transactional inserts in `saveTickers`) are skipped rather than returned, so
 * they must not consume the caller's result quota. The scan still has to terminate,
 * which this bound guarantees even if every group in range is orphaned.
 */
const MAX_HISTORY_GROUPS_SCANNED = 1000;

/**
 * Upper bound on candidate snapshots examined while resolving a `timestamp` request.
 *
 * The closest date carrying the requested pair may belong to an orphaned snapshot, so
 * resolution walks backwards until a date validates against the `timestamps` registry.
 * This bounds that walk when a run of consecutive snapshots is orphaned.
 */
const MAX_SNAPSHOT_CANDIDATES = 50;

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
  private updateInProgress = false;

  /**
   * Whether a rate refresh cycle is running right now.
   *
   * Backed by the same guard that prevents overlapping scheduled updates, so it is
   * the authoritative refresh state rather than a schedule-derived approximation.
   */
  get isUpdating(): boolean {
    return this.updateInProgress;
  }

  constructor(
    @InjectModel(Ticker.name) private tickerModel: Model<Ticker>,
    @InjectModel(Timestamp.name) private timestampModel: Model<Timestamp>,
    private schedulerRegistry: SchedulerRegistry,
    protected config: ConfigService,
    protected sourcesManager: SourcesManager,
    public notifier: Notifier,
    private readonly logger: Logger,
  ) {
    const refreshInterval = config.get<number>('refreshInterval');
    const weights = sourcesManager.getSourceWeights();
    const strategyName = config.get('strategy') as StrategyName;

    super(strategyName, weights);

    this.rateLifetime = this.config.get<number>('rateLifetime') ?? 60;

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
    const update = () => void this.updateTickers();
    const interval = setInterval(update, this.refreshInterval);
    this.schedulerRegistry.addInterval('tickers', interval);

    update();
  }

  /**
   * Fetches latest rate data from all enabled API sources, normalizes and persists to database.
   */
  async updateTickers() {
    if (this.updateInProgress) {
      this.logger.warn('Skipping rate update because the previous update is still in progress.');
      return;
    }

    this.updateInProgress = true;

    try {
      this.logger.log('Updating exchange rates…');

      await this.ready;
      this.pairSources = this.sourcesManager.sourcePairRecord;
      this.weights = this.sourcesManager.getSourceWeights();

      const sourceTickers: SourceTickers = {};
      let availableSources = 0;
      const unavailableSources: string[] = [];

      for (const source of this.sourcesManager.getEnabledSources()) {
        const tickers = await this.fetchTickers(source);

        if (!tickers) {
          unavailableSources.push(source.resourceName);
          continue;
        }

        this.mergeTickers(sourceTickers, this.applyMappings(tickers), {
          name: source.resourceName,
        });

        availableSources += 1;
      }

      this.setTickers(sourceTickers);

      if (availableSources <= 0) {
        this.fail(
          `Unable to get new rates from all sources (${unavailableSources.join(', ')}). No data has been saved.`,
        );
        return;
      }

      if (unavailableSources.length) {
        void this.notifier.notify(
          'warn',
          `Unable to fetch valid data from ${unavailableSources.join(', ')}. InfoService will provide previous rates for affected pairs when they are still fresh.`,
        );
      }

      const ratesWithFewerSources = this.getRatesWithFewerSources();

      if (ratesWithFewerSources.length) {
        void this.notifier.notify(
          'warn',
          `The following rates have been fetched from fewer sources than expected and therefore won't be saved: ${ratesWithFewerSources
            .map(([pair, expected, got]) => `${pair} (expected ${expected}, but got ${got})`)
            .join('; ')}`,
        );
      }

      if (!Object.keys(this.tickers).length) {
        this.fail('No valid rates remain after validation and merging. No data has been saved.');
        return;
      }

      await this.saveTickers(availableSources);
    } catch (error) {
      const message = this.sanitizeErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
      this.logger.error(`Rate update failed: ${message}`);
      this.fail(`Unable to update rates: ${message}`);
    } finally {
      this.updateInProgress = false;
    }
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

    if (from !== undefined && to !== undefined && from > to) {
      throw new HttpException(
        "Invalid time interval: 'to' timestamp must be greater than or equal to 'from'",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (from !== undefined || to !== undefined) {
      const dateRange: { $gte?: number; $lte?: number } = {};
      if (from !== undefined) {
        dateRange.$gte = from * 1000;
      }
      if (to !== undefined) {
        dateRange.$lte = to * 1000;
      }
      queries.push({
        $match: {
          date: dateRange,
        },
      });
    }

    const limit = Math.min(options.limit ?? 100, 100);
    const coinMatch = this.buildCoinMatch(coin);

    if (timestamp !== undefined) {
      const snapshotDate = await this.resolveSnapshotDate(timestamp, coinMatch);

      if (snapshotDate === undefined) {
        return [];
      }

      queries.push({
        $match: { date: snapshotDate },
      });
    }

    if (coinMatch) {
      queries.push({ $match: coinMatch });
    }

    queries.push({ $sort: { date: -1 } });

    const results: HistoricalResult[] = [];

    const cursor = this.tickerModel.aggregate(queries).cursor({ batchSize: 200 });

    try {
      let doc: Ticker | null = await cursor.next();
      let scannedGroups = 0;

      while (doc && results.length < limit && scannedGroups < MAX_HISTORY_GROUPS_SCANNED) {
        const date = doc.date;
        const tickers: Tickers = {};

        do {
          tickers[`${doc.base}/${doc.quote}`] = doc.rate;
          doc = await cursor.next();
        } while (doc && doc.date === date);

        scannedGroups += 1;
        await this.addTickerWithTimestamp(results, tickers, date);
      }
    } finally {
      await cursor.close();
    }

    return results;
  }

  /**
   * Builds the MongoDB match for a `coin` query filter.
   *
   * @param coin - Coin symbol, or a full or one-sided `BASE/QUOTE` pair
   * @returns Match fragment, or undefined when no coin filter was requested
   */
  buildCoinMatch(coin?: string): CoinMatch | undefined {
    if (!coin) {
      return undefined;
    }

    if (!coin.includes('/')) {
      return { $or: [{ base: coin }, { quote: coin }] };
    }

    const [baseCoin, quoteCoin] = coin.split('/');
    const match: { base?: string; quote?: string } = {};

    if (baseCoin) {
      match.base = baseCoin;
    }
    if (quoteCoin) {
      match.quote = quoteCoin;
    }

    return match;
  }

  /**
   * Resolves the newest snapshot date at or before the requested timestamp.
   *
   * When a coin filter is present the date is resolved from the stored rates rather
   * than from the global snapshot registry, so the closest snapshot that actually
   * contains the requested pair is returned instead of an empty result.
   *
   * @param timestamp - Requested Unix timestamp in seconds
   * @param coinMatch - Optional coin filter the snapshot must satisfy
   * @returns Snapshot date in milliseconds, or undefined when nothing matches
   */
  async resolveSnapshotDate(timestamp: number, coinMatch?: CoinMatch): Promise<number | undefined> {
    if (!coinMatch) {
      const lastTimestamp = await this.timestampModel.findOne(
        { date: { $lte: timestamp * 1000 } },
        null,
        { sort: { date: -1 } },
      );

      return lastTimestamp?.date;
    }

    // `saveTickers` writes tickers and their timestamp non-transactionally, so the newest
    // date carrying the pair can belong to an orphaned snapshot. Pinning the pipeline to it
    // would drop the group later and return nothing, hiding an older valid snapshot, so each
    // candidate is validated against the registry before it is accepted.
    let upperBound = timestamp * 1000;

    for (let candidate = 0; candidate < MAX_SNAPSHOT_CANDIDATES; candidate += 1) {
      const ticker = await this.tickerModel.findOne(
        { ...coinMatch, date: { $lte: upperBound } },
        null,
        { sort: { date: -1 } },
      );

      if (!ticker) {
        return undefined;
      }

      const snapshot = await this.timestampModel.findOne({ date: ticker.date });

      if (snapshot) {
        return ticker.date;
      }

      upperBound = ticker.date - 1;
    }

    return undefined;
  }

  /**
   * Sanitizes sensitive query parameters, JSON fields, and tokens from error messages.
   */
  public sanitizeErrorMessage(text: string): string {
    return sanitizeString(text);
  }

  /**
   * Deeply sanitizes sensitive properties from an object (e.g. Axios request params).
   */
  public sanitizeParams(params: unknown): unknown {
    return sanitizeObjectParams(params);
  }

  /**
   * Fetches rates from an individual external data source connector.
   *
   * @param source - Source API instance
   * @returns Tickers map or undefined on failure
   */
  async fetchTickers(source: BaseApi): Promise<Tickers | undefined> {
    try {
      const tickers: unknown = await source.fetch(BASE_CURRENCY);

      return this.validateSourceTickers(tickers, source.resourceName);
    } catch (error) {
      const message: string[] = [];

      if (error instanceof AxiosError) {
        const { config } = error;

        if (config) {
          const sanitizedUrl = this.sanitizeErrorMessage(config.url || '');
          const sanitizedParams = config.params
            ? this.sanitizeErrorMessage(JSON.stringify(this.sanitizeParams(config.params)))
            : '';
          message.push(`Request to ${sanitizedUrl} ${sanitizedParams}`.trim() + ' failed');

          if (error.response) {
            message.push(`with ${error.response.status} status code.`);
          }
        }
      }

      message.push(`Error: ${this.sanitizeErrorMessage(String(error))}.`);

      this.logger.warn(message.join(' '));
    }
  }

  /**
   * Removes malformed pairs and non-positive or non-finite prices from an external source response.
   *
   * @param value - Untrusted connector response
   * @param sourceName - Trusted source name used for operational logging
   * @returns Valid normalized tickers or undefined when no usable rate remains
   */
  validateSourceTickers(value: unknown, sourceName: string): Tickers | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      this.logger.warn(`Unable to process data from ${sourceName}: expected a ticker object.`);
      return;
    }

    const tickers: Tickers = {};
    let invalidEntryCount = 0;

    for (const [pair, price] of Object.entries(value)) {
      const parsedPair = completeCoinPair.safeParse(pair);

      if (!parsedPair.success || !isNumber(price) || price <= 0) {
        invalidEntryCount += 1;
        continue;
      }

      tickers[parsedPair.data] = price;
    }

    if (invalidEntryCount > 0) {
      this.logger.warn(
        `${sourceName} returned ${invalidEntryCount} malformed or non-positive rate entries; they were ignored.`,
      );
    }

    if (!Object.keys(tickers).length) {
      this.logger.warn(
        `Unable to process data from ${sourceName}: no valid positive rates were returned.`,
      );
      return;
    }

    return tickers;
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
      let [base, quote] = pair.split('/');

      base = Object.hasOwn(mappings, base) ? mappings[base] : base;
      quote = Object.hasOwn(mappings, quote) ? mappings[quote] : quote;

      delete tickers[pair];

      tickers[`${base}/${quote}`] = price;
    }

    return tickers;
  }

  /**
   * Dispatches an error alert via Notifier.
   */
  fail(reason: string) {
    void this.notifier.notify('error', reason);
  }
}
