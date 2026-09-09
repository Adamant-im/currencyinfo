import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { CoinIdFetcher } from './coin-id-fetcher';
import { Tickers } from './dto/tickers.dto';

export interface CoingeckoCoinDto {
  symbol: string;
  id: string;
}

export interface CoingeckoCoin {
  symbol: string;
  cg_id: string;
}

const coinsListUrl = 'https://api.coingecko.com/api/v3/coins/list';
const priceUrl = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * CoinGecko API provider connector.
 *
 * The keyless public plan is throttled to 5-15 calls per minute and rate limits
 * unpredictably, so the connector authenticates with a free Demo plan key sent as the
 * `x-cg-demo-api-key` header. One `/coins/list` call at startup plus one `/simple/price`
 * call per refresh cycle stays inside the 10,000 calls per month Demo quota.
 */
export class CoingeckoApi extends CoinIdFetcher {
  static resourceName = 'Coingecko';

  public ready: Promise<void>;

  public enabledCoins: Set<string> = new Set();
  private coins: CoingeckoCoin[] = [];

  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
    private notifier: Notifier,
  ) {
    super(logger, notifier);

    this.enabled =
      this.config.get('coingecko.enabled') !== false &&
      !!this.config.get<string>('coingecko.api_key') &&
      !!(
        this.config.get<string[]>('coingecko.coins')?.length ||
        this.config.get<string[]>('coingecko.ids')?.length
      );
    this.weight = this.config.get<number>('coingecko.weight') ?? 10;

    this.ready = this.fetchCoinIds();
  }

  /**
   * Builds the request headers, authenticating with the Demo plan key when configured.
   *
   * @returns Header record passed to every CoinGecko request
   */
  private getHeaders(): Record<string, string> {
    const apiKey = this.config.get<string>('coingecko.api_key');

    return apiKey ? { 'x-cg-demo-api-key': apiKey } : {};
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    await this.ready;

    const coinIds = this.coins.map(({ cg_id }) => cg_id);

    if (!coinIds.length) {
      return {};
    }

    const params = {
      ids: coinIds.join(','),
      vs_currencies: baseCurrency,
    };

    const decimals = this.config.get<number>('decimals') ?? 12;

    const { data } = await axios.get(priceUrl, {
      params,
      headers: this.getHeaders(),
      timeout: 10000,
    });

    const exchangeRates: Record<string, number> = {};
    const coingeckoBaseCoin = baseCurrency.toLowerCase();

    this.coins?.forEach(({ symbol, cg_id }) => {
      const rate = data[cg_id]?.[coingeckoBaseCoin];

      if (!rate) {
        return this.logger.warn(`Unable to get rates for ${this.resourceName} ID '${cg_id}'`);
      }

      exchangeRates[`${symbol}/${baseCurrency}`] = +rate.toFixed(decimals);
    });

    this.logger.info(`${this.resourceName} rates updated against ${baseCurrency} successfully.`);

    return exchangeRates;
  }

  async getCoinIds() {
    if (!this.enabled) {
      return;
    }

    this.coins = [];

    const { data } = await axios.get<CoingeckoCoinDto[]>(coinsListUrl, {
      headers: this.getHeaders(),
      timeout: 15000,
    });

    const resolvedIds = new Set<string>();
    const resolvedSymbols = new Set<string>();

    // Deduplicating on the id alone is not enough: two distinct ids carrying the same ticker
    // would both emit the same pair, and the later price would silently overwrite the earlier
    // one. The first resolution wins and the collision is reported.
    const addCoin = (rawSymbol: string, cgId: string) => {
      const symbol = rawSymbol.toUpperCase();

      if (resolvedIds.has(cgId)) {
        return;
      }

      if (resolvedSymbols.has(symbol)) {
        return this.logger.warn(
          `Skipping ${this.resourceName} id '${cgId}': symbol ${symbol} is already served by ` +
            `'${this.coins.find((coin) => coin.symbol === symbol)?.cg_id}'. ` +
            `Remove one of them from 'coingecko.ids'.`,
        );
      }

      resolvedIds.add(cgId);
      resolvedSymbols.add(symbol);
      this.coins.push({ symbol, cg_id: cgId });
    };

    // Explicit IDs are resolved first so they always win over symbol resolution, and so a
    // symbol that also appears in the deprecated `coins` list cannot be requested twice.
    const coinIds = this.config.get<string[]>('coingecko.ids');

    coinIds?.forEach((id) => {
      const coin = data.find((item) => item.id === id);

      if (!coin?.symbol) {
        return this.notifier.notify(
          'warn',
          `Unable to get ticker for ${this.resourceName} id '${id}'. Check if the coin exists: ${coinsListUrl}.`,
        );
      }

      addCoin(coin.symbol, id);
    });

    const coins = this.config.get<string[]>('coingecko.coins');

    coins?.forEach((symbol) => {
      const normalizedSymbol = symbol.toUpperCase();

      // Already pinned through `coingecko.ids`, which is the explicit and preferred path.
      if (resolvedSymbols.has(normalizedSymbol)) {
        return;
      }

      const candidates = data.filter((item) => item.symbol?.toUpperCase() === normalizedSymbol);

      if (!candidates.length) {
        return this.notifier.notify(
          'warn',
          `Unable to get ticker for ${this.resourceName} symbol '${symbol}'. Check if the coin exists: ${coinsListUrl}.`,
        );
      }

      // Symbols are not unique on CoinGecko, and unlike CoinPaprika the `/coins/list`
      // payload carries neither a rank nor an activity flag, so there is nothing to rank
      // the candidates by. The first entry in CoinGecko's own ordering is kept, which is
      // the historical behaviour, and the ambiguity is surfaced so an operator can pin the
      // intended asset through `coingecko.ids` instead of silently getting another coin.
      if (candidates.length > 1) {
        this.logger.warn(
          `${this.resourceName} symbol '${normalizedSymbol}' matches ${candidates.length} coins (${candidates
            .map(({ id }) => id)
            .join(', ')}). Using '${candidates[0].id}'. Set 'coingecko.ids' to select explicitly.`,
        );
      }

      addCoin(normalizedSymbol, candidates[0].id);
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
}
