import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { CoinIdFetcher } from './coin-id-fetcher';
import { Tickers } from './dto/tickers.dto';

const EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';
const TICKER_PRICE_URL = 'https://api.binance.com/api/v3/ticker/price';

const DEFAULT_QUOTE_ASSET = 'USDT';

/**
 * Single market entry of the `GET /api/v3/exchangeInfo` response.
 */
export interface BinanceSymbolDto {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
}

export interface BinanceExchangeInfoDto {
  symbols?: BinanceSymbolDto[];
}

/**
 * Single entry of the `GET /api/v3/ticker/price` response. Binance returns prices as strings.
 */
export interface BinanceTickerPriceDto {
  symbol: string;
  price: string;
}

/**
 * Resolved tradable market: `symbol` is the configured base coin (`BTC`),
 * `market` is the Binance market string (`BTCUSDT`).
 */
export interface BinanceMarket {
  symbol: string;
  market: string;
}

/**
 * Binance public market data connector.
 *
 * **USDT stands in for USD here, on purpose.** Binance quotes no direct fiat USD pairs, only
 * stablecoin ones, so this connector requests `<COIN><quote_asset>` markets (`BTCUSDT` by
 * default) and emits pairs already named `<COIN>/USD`.
 *
 * The substitution deliberately lives in this connector and must NOT be expressed through the
 * global `mappings` config option: a `"USDT": "USD"` entry there would apply to every source and
 * would rewrite the genuine `USDT/USD` quote returned by the aggregator sources into a degenerate
 * `USD/USD`, dropping exactly the quote that makes a depeg observable.
 *
 * During a depeg every Binance rate is off by the depeg magnitude. That case is covered by the
 * existing divergence machinery (`rateDifferencePercentThreshold` grouping, `groupPercentage`
 * alerting and the configured `strategy`), and the quote asset is configurable, so an operator can
 * switch to USDC without a code change.
 */
export class BinanceApi extends CoinIdFetcher {
  static resourceName = 'Binance';

  public ready: Promise<void>;

  public enabledCoins: Set<string> = new Set();
  private markets: BinanceMarket[] = [];

  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
    private notifier: Notifier,
  ) {
    super(logger, notifier);

    this.enabled =
      this.config.get('binance.enabled') !== false && !!this.getConfiguredCoins().length;
    this.weight = this.config.get<number>('binance.weight') ?? 10;

    this.ready = this.fetchCoinIds();
  }

  /**
   * Fetches the latest prices for every resolved market and emits them as `<COIN>/USD` pairs.
   *
   * @param baseCurrency - Requested base currency; only `USD` is served, because the configured
   *   quote asset (a USD stablecoin) stands in for USD. Any other value yields no rates.
   * @returns Map of `<COIN>/USD` pair strings to prices, or an empty object when the source is
   *   disabled, has no resolved markets, is geo-blocked, or cannot serve the requested currency
   */
  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    await this.ready;

    if (!this.markets.length) {
      return {};
    }

    if (baseCurrency.toUpperCase() !== 'USD') {
      this.logger.warn(
        `${this.resourceName} provides rates against USD only (quoted in ${this.getQuoteAsset()}), skipping ${baseCurrency}.`,
      );
      return {};
    }

    let data: BinanceTickerPriceDto[];

    try {
      const response = await axios.get<BinanceTickerPriceDto[]>(TICKER_PRICE_URL, {
        params: { symbols: JSON.stringify(this.markets.map(({ market }) => market)) },
        timeout: 10000,
      });

      data = response.data;
    } catch (error) {
      if (this.isHttpError(error, 451)) {
        // Returning no rates (instead of throwing) keeps RatesService from counting the source
        // as available while the region stays blocked.
        this.handleGeoBlock();
        return {};
      }

      throw error;
    }

    if (!Array.isArray(data)) {
      throw new Error(
        `Unable to process data from ${TICKER_PRICE_URL}: unexpected response shape.`,
      );
    }

    const prices = new Map<string, string>();

    for (const row of data) {
      if (row?.symbol) {
        prices.set(row.symbol, row.price);
      }
    }

    const decimals = this.config.get<number>('decimals') ?? 12;
    const rates: Tickers = {};
    const missing: string[] = [];

    for (const { symbol, market } of this.markets) {
      // Binance serializes prices as strings, e.g. "81867.52000000".
      const price = Number(prices.get(market));

      if (!Number.isFinite(price) || price <= 0) {
        missing.push(symbol);
        continue;
      }

      rates[`${symbol}/USD`] = +price.toFixed(decimals);
    }

    if (missing.length) {
      this.logger.warn(`Unable to get ${this.resourceName} rates for: ${missing.join(', ')}.`);
    }

    // A cycle without a single rate is not a success; see the note in the CoinPaprika connector.
    if (Object.keys(rates).length) {
      this.logger.info(`${this.resourceName} rates updated against ${baseCurrency} successfully.`);
    }

    return rates;
  }

  /**
   * Resolves the set of tradable Binance markets for the configured coins, once at startup.
   *
   * The resolution step exists because of an all-or-nothing quirk of the Binance API: a single
   * unlisted symbol fails the WHOLE request. `symbols=["ADMUSDT"]` answers HTTP 400 with
   * `{"code":-1121,"msg":"Invalid symbol."}`, and so does `symbols=["BTCUSDT","ADMUSDT"]`. Without
   * an upfront validation one misconfigured coin would take the entire source offline on every
   * refresh cycle. Note that ADM itself is not listed on Binance, so ADM coverage always comes
   * from the aggregator sources.
   */
  async getCoinIds(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.markets = [];

    const quoteAsset = this.getQuoteAsset();
    const candidates = this.getConfiguredCoins().map((coin) => `${coin}${quoteAsset}`);

    let listed: BinanceSymbolDto[] | null;

    try {
      // One bulk call covers the healthy case; `exchangeInfo` rejects the same all-or-nothing way.
      const { data } = await axios.get<BinanceExchangeInfoDto>(EXCHANGE_INFO_URL, {
        params: { symbols: JSON.stringify(candidates) },
        timeout: 15000,
      });

      listed = data?.symbols ?? [];
    } catch (error) {
      if (this.isHttpError(error, 451)) {
        // Retrying a legal block is pointless, so do not throw into the backoff retry.
        this.handleGeoBlock();
        return;
      }

      if (!this.isHttpError(error, 400)) {
        // Network errors and outages are transient: let CoinIdFetcher apply its backoff retry.
        throw error;
      }

      // HTTP 400 means at least one configured coin is not listed, but the response does not say
      // which one, so every candidate has to be validated on its own.
      listed = await this.validateCandidates(candidates);
    }

    if (!listed) {
      return;
    }

    const notTrading = listed
      .filter((entry) => entry?.status !== 'TRADING')
      .map((entry) => entry?.symbol)
      .filter(Boolean);

    if (notTrading.length) {
      this.logger.warn(
        `${this.resourceName} markets are not trading and will be skipped: ${notTrading.join(', ')}.`,
      );
    }

    this.markets = listed
      .filter((entry) => entry?.status === 'TRADING')
      .map((entry) => ({
        symbol: this.resolveBaseCoin(entry, quoteAsset),
        market: entry.symbol,
      }));

    if (!this.markets.length) {
      this.logger.error(`Could not fetch coin list for ${this.resourceName}.`);
      this.notifier.notify(
        'error',
        `Could not fetch coin list for ${this.resourceName}. Rates from this source will be unavailable.`,
      );
      return;
    }

    this.enabledCoins = new Set(this.markets.map(({ symbol }) => symbol));
    this.logger.info(`${this.resourceName} coin IDs fetched successfully.`);
  }

  /**
   * Validates candidate markets one by one after a bulk request has been rejected.
   *
   * `?symbol=<market>` (singular) validates a single market, so an unlisted coin can be pinpointed
   * and dropped instead of disabling the whole source.
   *
   * @param candidates - Market strings to validate, e.g. `['BTCUSDT', 'ADMUSDT']`
   * @returns Market entries known to Binance, or `null` when the API answered HTTP 451 and the
   *   source has been disabled
   */
  private async validateCandidates(candidates: string[]): Promise<BinanceSymbolDto[] | null> {
    const listed: BinanceSymbolDto[] = [];

    for (const candidate of candidates) {
      try {
        const { data } = await axios.get<BinanceExchangeInfoDto>(EXCHANGE_INFO_URL, {
          params: { symbol: candidate },
          timeout: 15000,
        });

        listed.push(...(data?.symbols ?? []));
      } catch (error) {
        if (this.isHttpError(error, 451)) {
          this.handleGeoBlock();
          return null;
        }

        if (this.isHttpError(error, 400)) {
          this.logger.warn(
            `Market '${candidate}' is not listed on ${this.resourceName}. Skipping the coin.`,
          );
          continue;
        }

        throw error;
      }
    }

    return listed;
  }

  /**
   * Disables the source after Binance answered HTTP 451 (unavailable for legal reasons).
   *
   * Binance geo-blocks some regions. The block is not transient, so the source is skipped from the
   * next refresh cycle onward instead of alerting on every `refreshInterval`. Restarting the
   * service re-probes availability.
   */
  private handleGeoBlock(): void {
    this.enabled = false;

    const message =
      `${this.resourceName} answered HTTP 451 (unavailable for legal reasons): the API is ` +
      `geo-restricted in this region. The source has been disabled for this run, restart the ` +
      `service to re-probe it.`;

    this.logger.error(message);
    this.notifier.notify('error', message);
  }

  /**
   * Resolves the configured base coin behind a Binance market entry.
   *
   * @param entry - Market entry returned by `exchangeInfo`
   * @param quoteAsset - Configured quote asset, used to strip the suffix of the requested market
   *   string when the entry carries no explicit `baseAsset`
   * @returns Upper-case base coin symbol, e.g. `BTC` for the `BTCUSDT` market
   */
  private resolveBaseCoin(entry: BinanceSymbolDto, quoteAsset: string): string {
    const baseAsset = entry.baseAsset?.toUpperCase();

    if (baseAsset) {
      return baseAsset;
    }

    const market = entry.symbol?.toUpperCase() ?? '';

    return market.endsWith(quoteAsset) ? market.slice(0, -quoteAsset.length) : market;
  }

  /**
   * @returns Configured quote asset in upper case, `USDT` when unset
   */
  private getQuoteAsset(): string {
    return (
      this.config.get<string>('binance.quote_asset')?.trim().toUpperCase() || DEFAULT_QUOTE_ASSET
    );
  }

  /**
   * Normalizes the configured coin list: upper case, without duplicates, and without the quote
   * asset itself, because a market such as `USDTUSDT` does not exist.
   *
   * @returns Configured base coin symbols in upper case
   */
  private getConfiguredCoins(): string[] {
    const quoteAsset = this.getQuoteAsset();
    const coins = this.config.get<string[]>('binance.coins') ?? [];
    const normalized = coins.map((coin) => coin?.trim().toUpperCase()).filter(Boolean);

    return [...new Set(normalized)].filter((coin) => coin !== quoteAsset);
  }

  /**
   * @param error - Rejection value of an axios request
   * @param status - HTTP status code to test for
   * @returns `true` when the rejection is an axios error carrying the given HTTP status
   */
  private isHttpError(error: unknown, status: number): boolean {
    return axios.isAxiosError(error) && error.response?.status === status;
  }
}
