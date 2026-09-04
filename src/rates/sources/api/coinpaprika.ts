import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { CoinIdFetcher } from './coin-id-fetcher';
import { Tickers } from './dto/tickers.dto';

const COINS_LIST_URL = 'https://api.coinpaprika.com/v1/coins';
const TICKERS_URL = 'https://api.coinpaprika.com/v1/tickers';

/**
 * Default number of top-ranked rows requested in the single bulk ticker call.
 * CoinPaprika caps the `limit` parameter at 2000 rows.
 */
const DEFAULT_BULK_LIMIT = 200;

/**
 * Default cap on single-coin ticker calls per fetch cycle. The keyless tier allows
 * 20,000 calls per month, so an unbounded fan-out would exhaust the quota.
 */
const DEFAULT_MAX_INDIVIDUAL_REQUESTS = 5;

/**
 * Entry of the `/v1/coins` directory.
 */
export interface CoinpaprikaCoinDto {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  is_new: boolean;
  is_active: boolean;
  type: string;
}

/**
 * Ticker row of `/v1/tickers` (array) and `/v1/tickers/{coin_id}` (single object).
 */
export interface CoinpaprikaTickerDto {
  id: string;
  name?: string;
  symbol: string;
  rank?: number;
  quotes?: Record<string, { price?: number } | undefined>;
}

/**
 * Resolved coin: the configured symbol, the CoinPaprika id serving it, and its directory rank.
 */
export interface CoinpaprikaCoin {
  symbol: string;
  paprika_id: string;
  rank: number;
}

/**
 * CoinPaprika API provider connector. All endpoints used here are keyless.
 *
 * Two upstream quirks shape the whole design:
 *
 * 1. There is no batch-by-ids ticker endpoint. `?ids=`, `?coin_ids=` and `?id=` are silently
 *    ignored — the request fails open and returns the full payload instead of an error — and
 *    `/v1/tickers/a,b` answers 404. Coverage is therefore assembled from one ranked bulk call
 *    plus one single-coin call for every coin outside that rank window.
 * 2. Symbols are not unique. `ADM` matches both `adm-adamant-messenger` (rank 1510, type coin)
 *    and `adm-voice-of-the-gods-by-virtuals` (rank 5688, type token), so a first-match lookup
 *    would silently substitute one coin for another. Symbols are resolved among active
 *    candidates by best rank, and every returned ticker symbol is verified before its price
 *    is emitted.
 */
export class CoinPaprikaApi extends CoinIdFetcher {
  static resourceName = 'CoinPaprika';

  public ready: Promise<void>;

  public enabledCoins: Set<string> = new Set();
  private coins: CoinpaprikaCoin[] = [];

  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
    private notifier: Notifier,
  ) {
    super(logger, notifier);

    this.enabled =
      this.config.get('coinpaprika.enabled') !== false &&
      !!(
        this.config.get<string[]>('coinpaprika.coins')?.length ||
        this.config.get<string[]>('coinpaprika.ids')?.length
      );
    this.weight = this.config.get<number>('coinpaprika.weight') ?? 10;

    this.ready = this.fetchCoinIds();
  }

  /**
   * Fetches rates for every resolved coin against the given base currency.
   *
   * The requests are split at runtime from the ranks stored during coin discovery: coins inside
   * the bulk rank window are covered by one `/v1/tickers?limit=N` call, the rest get one
   * `/v1/tickers/{coin_id}` call each, capped by `coinpaprika.max_individual_requests`.
   *
   * @param baseCurrency Quote currency of the returned pairs, for example `USD`.
   * @returns Map of `BASE/QUOTE` pair strings to prices; empty when the source is disabled,
   *   has no resolved coins, or returned nothing usable.
   */
  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    await this.ready;

    if (!this.coins.length) {
      return {};
    }

    const quote = baseCurrency.toUpperCase();
    const decimals = this.config.get<number>('decimals') ?? 12;
    const bulkLimit = this.config.get<number>('coinpaprika.bulk_limit') ?? DEFAULT_BULK_LIMIT;
    const maxIndividualRequests =
      this.config.get<number>('coinpaprika.max_individual_requests') ??
      DEFAULT_MAX_INDIVIDUAL_REQUESTS;

    // Prices keyed by CoinPaprika id, filled by the bulk call first and the fan-out second.
    const prices = new Map<string, number>();

    // Skip the bulk call when no configured coin can be inside the ranked window: an operator
    // tracking only low-ranked coins must not pay for a payload they cannot use.
    const hasBulkCoins = this.coins.some(({ rank }) => rank > 0 && rank <= bulkLimit);

    if (hasBulkCoins) {
      const { data } = await axios.get<CoinpaprikaTickerDto[]>(TICKERS_URL, {
        params: { quotes: quote, limit: bulkLimit },
        // The bulk payload is large; ask for gzip explicitly.
        headers: { 'Accept-Encoding': 'gzip' },
        timeout: 15000,
      });

      const rows = Array.isArray(data) ? data : [];
      const rowsById = new Map(rows.map((row) => [row.id, row]));

      // Look up every configured coin, not only the rank-derived subset: a stored rank may have
      // drifted since discovery, and the coin may still be present in the response.
      for (const coin of this.coins) {
        const price = this.extractPrice(rowsById.get(coin.paprika_id), coin, quote);

        if (price !== undefined) {
          prices.set(coin.paprika_id, price);
        }
      }
    }

    const missing = this.coins.filter(({ paprika_id }) => !prices.has(paprika_id));
    let individual = missing;

    if (missing.length > maxIndividualRequests) {
      individual = missing.slice(0, maxIndividualRequests);

      const dropped = missing.slice(maxIndividualRequests).map(({ symbol }) => symbol);

      this.logger.warn(
        `${this.resourceName} needs ${missing.length} individual ticker requests, ` +
          `which exceeds the 'coinpaprika.max_individual_requests' limit of ` +
          `${maxIndividualRequests}. Skipping: ${dropped.join(', ')}.`,
      );
    }

    for (const coin of individual) {
      // Each call is isolated: a single dead or renamed id must not take the whole source down.
      try {
        const { data } = await axios.get<CoinpaprikaTickerDto>(
          `${TICKERS_URL}/${encodeURIComponent(coin.paprika_id)}`,
          {
            params: { quotes: quote },
            timeout: 10000,
          },
        );

        const price = this.extractPrice(data, coin, quote);

        if (price !== undefined) {
          prices.set(coin.paprika_id, price);
        }
      } catch (error) {
        this.logger.warn(
          `Unable to get ${this.resourceName} ticker for id '${coin.paprika_id}'. Error: ${error}.`,
        );
      }
    }

    const exchangeRates: Tickers = {};
    const unresolved: string[] = [];

    for (const { symbol, paprika_id } of this.coins) {
      const price = prices.get(paprika_id);

      if (price === undefined) {
        unresolved.push(symbol);
        continue;
      }

      exchangeRates[`${symbol}/${quote}`] = +price.toFixed(decimals);
    }

    if (unresolved.length) {
      this.logger.warn(
        `Unable to get ${this.resourceName} rates against ${quote} for: ${unresolved.join(', ')}.`,
      );
    }

    // Only a cycle that produced at least one rate is a success. Reporting one unconditionally
    // would contradict the `no valid positive rates` warning RatesService raises for the same
    // cycle and would hide a provider outage in the logs.
    if (Object.keys(exchangeRates).length) {
      this.logger.info(`${this.resourceName} rates updated against ${baseCurrency} successfully.`);
    }

    return exchangeRates;
  }

  /**
   * Discovers CoinPaprika ids for the configured coins from the `/v1/coins` directory.
   *
   * Explicit `coinpaprika.ids` are resolved first and win over `coinpaprika.coins`, because
   * symbol resolution is ambiguous by nature (see the class-level note on duplicate symbols).
   *
   * @returns Nothing. Populates `enabledCoins` on success; on a total failure it reports the
   *   problem and leaves `enabledCoins` untouched so the source stays unavailable.
   */
  async getCoinIds() {
    if (!this.enabled) {
      return;
    }

    this.coins = [];

    const { data } = await axios.get<CoinpaprikaCoinDto[]>(COINS_LIST_URL, {
      timeout: 20000,
      // The directory holds ~61k entries: ~7 MB uncompressed against ~1.4 MB gzipped, and it
      // is requested once per start, so compression is mandatory here.
      headers: { 'Accept-Encoding': 'gzip' },
    });

    if (!Array.isArray(data)) {
      throw new Error(`Unexpected response from ${COINS_LIST_URL}: an array of coins is expected.`);
    }

    const resolvedIds = new Set<string>();
    const resolvedSymbols = new Set<string>();

    const configuredIds = this.config.get<string[]>('coinpaprika.ids');

    configuredIds?.forEach((id) => {
      const coin = data.find((item) => item.id === id);

      if (!coin?.symbol) {
        return this.notifier.notify(
          'warn',
          `Unable to get ticker for ${this.resourceName} id '${id}'. Check if the coin exists: ${COINS_LIST_URL}.`,
        );
      }

      if (resolvedIds.has(coin.id)) {
        return;
      }

      const symbol = coin.symbol.toUpperCase();

      // Two ids carrying the same ticker (`usdt-tether` and `usdt-bridged-usdt-sonic-labs`, say)
      // would both emit `USDT/USD` and the later one would silently overwrite the earlier price.
      // Keep the first and make the collision visible instead.
      if (resolvedSymbols.has(symbol)) {
        return this.logger.warn(
          `Skipping ${this.resourceName} id '${coin.id}': symbol ${symbol} is already served by ` +
            `'${this.coins.find((resolved) => resolved.symbol === symbol)?.paprika_id}'. ` +
            `Remove one of them from 'coinpaprika.ids'.`,
        );
      }

      resolvedIds.add(coin.id);
      resolvedSymbols.add(symbol);

      this.coins.push({
        symbol,
        paprika_id: coin.id,
        rank: coin.rank,
      });
    });

    const configuredSymbols = this.config.get<string[]>('coinpaprika.coins');

    configuredSymbols?.forEach((configuredSymbol) => {
      const symbol = configuredSymbol.toUpperCase();

      // An explicit id for the same symbol has already been resolved above.
      if (resolvedSymbols.has(symbol)) {
        return;
      }

      // Delisted entries keep their symbol forever, so inactive rows are never candidates.
      const candidates = data.filter(
        (item) => item.symbol?.toUpperCase() === symbol && item.is_active === true,
      );

      if (!candidates.length) {
        return this.notifier.notify(
          'warn',
          `Unable to get ticker for ${this.resourceName} symbol '${symbol}'. Check if the coin exists: ${COINS_LIST_URL}.`,
        );
      }

      if (candidates.length > 1) {
        const list = candidates
          .map((item) => `${item.id} (rank ${this.isRanked(item.rank) ? item.rank : 'unranked'})`)
          .join(', ');

        this.logger.warn(
          `Ambiguous ${this.resourceName} symbol '${symbol}' matches ${candidates.length} active ` +
            `coins: ${list}. Picking the best ranked one. Use 'coinpaprika.ids' to choose explicitly.`,
        );
      }

      // Best rank wins; ties and unranked entries are ordered by id so the choice is deterministic.
      const [coin] = [...candidates].sort(
        (a, b) => this.rankOrder(a.rank) - this.rankOrder(b.rank) || a.id.localeCompare(b.id),
      );

      if (resolvedIds.has(coin.id)) {
        return;
      }

      resolvedIds.add(coin.id);
      resolvedSymbols.add(symbol);

      this.coins.push({
        symbol,
        paprika_id: coin.id,
        rank: coin.rank,
      });
    });

    if (!this.coins.length) {
      this.logger.error(`Could not fetch coin list for ${this.resourceName}.`);
      this.notifier.notify(
        'error',
        `Could not fetch coin list for ${this.resourceName}. Rates from this source will be unavailable.`,
      );
      return;
    }

    this.enabledCoins = new Set(this.coins.map(({ symbol }) => symbol));
    this.logger.info(`${this.resourceName} coin IDs fetched successfully.`);
  }

  /**
   * Reads a usable price out of a ticker row.
   *
   * @param ticker Ticker row returned by the bulk or the single-coin endpoint, if any.
   * @param coin Coin the row is expected to describe.
   * @param quote Upper-cased quote currency key inside `quotes`.
   * @returns The finite positive price, or `undefined` when the row is absent, describes another
   *   coin (duplicate symbols make this check mandatory), or carries an unusable price.
   */
  private extractPrice(
    ticker: CoinpaprikaTickerDto | undefined,
    coin: CoinpaprikaCoin,
    quote: string,
  ): number | undefined {
    if (!ticker) {
      return undefined;
    }

    if (ticker.symbol?.toUpperCase() !== coin.symbol) {
      this.logger.warn(
        `Skipping ${this.resourceName} ticker '${ticker.id}': expected symbol ${coin.symbol}, ` +
          `got '${ticker.symbol}'.`,
      );
      return undefined;
    }

    const price = ticker.quotes?.[quote]?.price;

    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      return undefined;
    }

    return price;
  }

  /**
   * @param rank Directory rank of a coin.
   * @returns Whether the rank is a real ranking; CoinPaprika reports unranked coins as `0`.
   */
  private isRanked(rank: number | undefined): boolean {
    return typeof rank === 'number' && Number.isFinite(rank) && rank > 0;
  }

  /**
   * @param rank Directory rank of a coin.
   * @returns Sort key placing unranked coins after every ranked one.
   */
  private rankOrder(rank: number | undefined): number {
    return this.isRanked(rank) ? (rank as number) : Number.POSITIVE_INFINITY;
  }
}
