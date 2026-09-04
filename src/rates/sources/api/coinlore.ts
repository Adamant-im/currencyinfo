import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { CoinIdFetcher } from './coin-id-fetcher';
import { Tickers } from './dto/tickers.dto';

/**
 * Single row of a CoinLore ticker response.
 *
 * Note that CoinLore serializes every numeric field as a string, including `id` and `price_usd`.
 */
export interface CoinloreTickerDto {
  id: string;
  symbol: string;
  name: string;
  nameid: string;
  rank: number;
  price_usd: string;
}

/**
 * Single row of the `/api/assets/` directory: identity and rank only, without quotes.
 */
export interface CoinloreAssetDto {
  id: string;
  symbol: string;
  name: string;
  nameid: string;
  rank: number;
}

/**
 * Payload of the `/api/assets/` directory endpoint.
 */
export interface CoinloreAssetsDto {
  data: CoinloreAssetDto[];
}

/**
 * Resolved pair of a configured ticker symbol and its numeric CoinLore id.
 */
export interface CoinloreCoin {
  symbol: string;
  coinlore_id: string;
}

/**
 * Quotes for an explicit set of coin ids: `/api/ticker/?id=90,80,33250`.
 * Returns a bare array of rows (no envelope).
 */
const tickerUrl = 'https://api.coinlore.net/api/ticker/';

/**
 * Lightweight directory of every listed coin: `/api/assets/`.
 *
 * The quoted listing at `/api/tickers/` is hard-capped at 100 rows per page — `limit=500` and
 * `limit=1000` both answer with exactly 100 rows, silently ignoring the requested value — so
 * resolving a low-ranked symbol such as ADM (rank ~1066) from it would cost eleven paged
 * requests. This directory carries `id`, `symbol`, `name`, `nameid` and `rank` for all ~15k
 * coins in a single ~350 KB gzipped response instead.
 */
const assetsUrl = 'https://api.coinlore.net/api/assets/';

/**
 * Maximum number of comma-separated ids per `/api/ticker/` request. A single request with
 * 13 ids is confirmed to work; 100 keeps the query string well within safe limits while
 * covering any realistic configuration in one or two calls.
 */
const MAX_IDS_PER_REQUEST = 100;

/**
 * CoinLore API provider connector.
 *
 * CoinLore is keyless, needs no registration, and publishes a single USD quote per coin
 * (`price_usd`). Coins are addressed by an opaque numeric id, which is either configured
 * explicitly in `coinlore.ids` or resolved from ticker symbols against the `/api/assets/`
 * directory. Those ids are reassigned between listings, so a configured id is trusted only
 * as long as the quote it returns still carries the expected symbol.
 */
export class CoinLoreApi extends CoinIdFetcher {
  static resourceName = 'CoinLore';

  public ready: Promise<void>;

  public enabledCoins: Set<string> = new Set();
  private coins: CoinloreCoin[] = [];

  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
    private notifier: Notifier,
  ) {
    super(logger, notifier);

    this.enabled =
      this.config.get('coinlore.enabled') !== false &&
      !!(
        this.config.get<string[]>('coinlore.coins')?.length ||
        Object.keys(this.config.get<Record<string, number>>('coinlore.ids') || {})?.length
      );
    this.weight = this.config.get<number>('coinlore.weight') ?? 10;

    this.ready = this.fetchCoinIds();
  }

  /**
   * Fetches USD quotes for every resolved coin.
   *
   * @param baseCurrency - Requested quote currency. CoinLore only publishes USD prices,
   *    so any other value is refused instead of being derived from a conversion rate.
   * @returns Tickers keyed by `SYMBOL/USD`, or an empty object when the source is disabled,
   *    has no resolved coins, or was asked for a non-USD quote.
   */
  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    await this.ready;

    if (!this.coins.length) {
      return {};
    }

    // CoinLore exposes `price_usd` only and has no quote-currency parameter. Cross rates for
    // other base coins are triangulated downstream by the merger, never invented here.
    if (baseCurrency.toUpperCase() !== 'USD') {
      this.logger.warn(
        `${this.resourceName} quotes coins in USD only, skipping the request against ${baseCurrency}.`,
      );
      return {};
    }

    const decimals = this.config.get<number>('decimals') ?? 12;

    const rows = new Map<string, CoinloreTickerDto>();

    for (let offset = 0; offset < this.coins.length; offset += MAX_IDS_PER_REQUEST) {
      const chunk = this.coins
        .slice(offset, offset + MAX_IDS_PER_REQUEST)
        .map(({ coinlore_id }) => coinlore_id);

      const { data } = await axios.get<CoinloreTickerDto[]>(tickerUrl, {
        params: { id: chunk.join(',') },
        timeout: 10000,
      });

      if (!Array.isArray(data)) {
        this.logger.warn(
          `Unexpected ${this.resourceName} ticker response for ids ${chunk.join(', ')}.`,
        );
        continue;
      }

      for (const row of data) {
        if (row?.id !== undefined) {
          rows.set(String(row.id), row);
        }
      }
    }

    const rates: Tickers = {};
    const unavailable: string[] = [];

    for (const { symbol, coinlore_id } of this.coins) {
      const row = rows.get(coinlore_id);

      if (!row) {
        unavailable.push(symbol);
        continue;
      }

      // CoinLore reassigns numeric ids between listings, so a stale configured id can silently
      // point at a completely different asset. Trust a row only when its ticker still matches.
      if (row.symbol?.toUpperCase() !== symbol) {
        this.logger.warn(
          `${this.resourceName} id ${coinlore_id} returned symbol '${row.symbol}' instead of the configured '${symbol}'. Skipping the rate, check 'coinlore.ids'.`,
        );
        unavailable.push(symbol);
        continue;
      }

      const price = Number(row.price_usd);

      if (!Number.isFinite(price) || price <= 0) {
        unavailable.push(symbol);
        continue;
      }

      rates[`${symbol}/USD`] = +price.toFixed(decimals);
    }

    if (unavailable.length) {
      this.logger.warn(
        `Unable to get rates from ${this.resourceName} for ${unavailable.join(', ')}.`,
      );
    }

    // A cycle without a single rate is not a success; see the note in the CoinPaprika connector.
    if (Object.keys(rates).length) {
      this.logger.info(`${this.resourceName} rates updated against ${baseCurrency} successfully.`);
    }

    return rates;
  }

  /**
   * Resolves the numeric CoinLore id of every configured coin.
   *
   * Explicit `coinlore.ids` entries always win and cost no request, so a fully populated map
   * issues zero directory calls at startup. Only the `coinlore.coins` symbols left unresolved
   * are looked up, in one `/api/assets/` request.
   *
   * @returns Nothing. On a total failure the source is reported and left without coins,
   *    so it degrades to an empty result set instead of crashing the service.
   */
  async getCoinIds(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.coins = [];

    const configuredIds = this.config.get<Record<string, number>>('coinlore.ids') || {};
    const resolved = new Set<string>();

    for (const [symbol, id] of Object.entries(configuredIds)) {
      const coin = symbol.toUpperCase();

      if (resolved.has(coin)) {
        continue;
      }

      resolved.add(coin);
      this.coins.push({
        symbol: coin,
        coinlore_id: String(id),
      });
    }

    const configuredCoins = this.config.get<string[]>('coinlore.coins') || [];
    const pending = [
      ...new Set(
        configuredCoins
          .map((symbol) => symbol?.toUpperCase())
          .filter((symbol): symbol is string => Boolean(symbol) && !resolved.has(symbol)),
      ),
    ];

    if (pending.length) {
      const assets = await this.fetchAssets();

      if (!assets) {
        // The directory is only needed for symbols that `coinlore.ids` does not cover, so an
        // outage must not discard the ids that resolved without it. Falling through here keeps
        // `this.coins` and `enabledCoins` in step: leaving early would let `fetch()` keep serving
        // those coins while `SourcesManager` saw no CoinLore coverage for them, which silently
        // lowers the effective `minSources` requirement for every pair they take part in.
        this.notifier.notify(
          'warn',
          `Unable to resolve ${this.resourceName} ids for ${pending.join(', ')}: the coin directory at ${assetsUrl} is unavailable. The explicitly configured 'coinlore.ids' are served as usual.`,
        );

        this.publishCoins();
        return;
      }

      const unresolved: string[] = [];

      for (const symbol of pending) {
        const candidates = assets.filter((asset) => asset?.symbol?.toUpperCase() === symbol);

        if (!candidates.length) {
          unresolved.push(symbol);
          continue;
        }

        // Tickers are not unique on CoinLore either, so the best-ranked coin carrying the
        // symbol wins and the ambiguity is surfaced rather than silently resolved.
        if (candidates.length > 1) {
          const list = candidates
            .map(
              (asset) =>
                `${asset.id} (${asset.name}, rank ${this.isRanked(asset.rank) ? asset.rank : 'unranked'})`,
            )
            .join(', ');

          this.logger.warn(
            `Ambiguous ${this.resourceName} symbol '${symbol}' matches ${candidates.length} coins: ${list}. Picking the best ranked one. Use 'coinlore.ids' to choose explicitly.`,
          );
        }

        const [asset] = [...candidates].sort(
          (a, b) => this.rankOrder(a.rank) - this.rankOrder(b.rank) || a.id.localeCompare(b.id),
        );

        resolved.add(symbol);
        this.coins.push({
          symbol,
          coinlore_id: String(asset.id),
        });
      }

      if (unresolved.length) {
        this.notifier.notify(
          'warn',
          `Unable to resolve ${this.resourceName} ids for ${unresolved.join(', ')}. Check if the coins exist: ${assetsUrl}, or set explicit ids in 'coinlore.ids'.`,
        );
      }
    }

    this.publishCoins();
  }

  /**
   * Fetches the coin directory used to resolve symbols that `coinlore.ids` does not cover.
   *
   * @returns The directory rows, or `undefined` when it is unavailable and explicitly configured
   *    ids can carry the source on their own
   * @throws When nothing has been resolved yet, so `CoinIdFetcher` retries the whole discovery
   */
  private async fetchAssets(): Promise<CoinloreAssetDto[] | undefined> {
    try {
      const { data } = await axios.get<CoinloreAssetsDto>(assetsUrl, {
        // ~15k rows, so compression matters even though the payload is far smaller than
        // the quoted listing.
        headers: { 'Accept-Encoding': 'gzip' },
        timeout: 20000,
      });

      if (!Array.isArray(data?.data)) {
        throw new Error(`Unexpected response from ${assetsUrl}: an array of assets is expected.`);
      }

      return data.data;
    } catch (error) {
      if (!this.coins.length) {
        throw error;
      }

      this.logger.warn(
        `Unable to fetch the ${this.resourceName} coin directory. Error: ${error}. Continuing with the explicitly configured ids.`,
      );

      return undefined;
    }
  }

  /**
   * Advertises the resolved coins, or reports the source as unavailable when none resolved.
   *
   * `enabledCoins` is what `SourcesManager` counts towards `minSources`, so it must always end up
   * describing exactly the coins `fetch()` is going to quote.
   */
  private publishCoins(): void {
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
   * @param rank - Directory rank of a coin
   * @returns Whether the rank is a real ranking; unranked coins are reported as `0`
   */
  private isRanked(rank: number | undefined): boolean {
    return typeof rank === 'number' && Number.isFinite(rank) && rank > 0;
  }

  /**
   * @param rank - Directory rank of a coin
   * @returns Sort key placing unranked coins after every ranked one
   */
  private rankOrder(rank: number | undefined): number {
    return this.isRanked(rank) ? (rank as number) : Number.POSITIVE_INFINITY;
  }
}
