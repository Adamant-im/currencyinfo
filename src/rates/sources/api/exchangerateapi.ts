import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

/**
 * The only base currency this connector can serve.
 *
 * Rates are inverted into `CODE/USD` pairs, so a response quoted against anything else would be
 * mislabelled rather than converted.
 */
const BASE_CODE = 'USD';

export interface ExchangeRateApiRates {
  [code: string]: number;
}

export interface ExchangeRateApiDto {
  /**
   * Either `'success'` or `'error'`. The endpoint answers with HTTP 200 even on
   * failures, so this field is the only reliable success indicator.
   */
  result: string;

  /**
   * Currency the `rates` map is quoted against. Must be `USD`: the connector inverts the rates
   * into `CODE/USD` pairs and cannot convert another base.
   */
  base_code?: string;

  /**
   * Machine-readable failure reason, present only when `result` is `'error'`.
   */
  'error-type'?: string;

  /**
   * How many units of each currency equal 1 unit of `base_code`.
   */
  rates?: ExchangeRateApiRates;
}

/**
 * ExchangeRate-API (`open.er-api.com`) connector.
 *
 * Keyless, USD-based, fiat-only provider serving 166 currencies with a once-a-day
 * refresh cycle. Not to be confused with the separate `ExchangeRateHost` connector
 * in `exchangeratehost.ts`, which wraps the unrelated, key-requiring
 * `exchangerate.host` provider.
 *
 * The upstream `rates` map is quoted as "units of X per 1 USD", while the service
 * serves `BASE/QUOTE` pairs, so every emitted rate is the inverse: `X/USD = 1 / rates[X]`.
 *
 * Configure fiat codes only. `BTC`, `ETH` and other crypto assets are not covered by
 * this endpoint and must be taken from the crypto sources instead.
 */
export class ExchangeRateApi extends BaseApi {
  static resourceName = 'ExchangeRateApi';

  public enabled: boolean;
  public weight: number;
  public enabledCoins: Set<string>;

  constructor(
    private config: ConfigService,
    private logger: Logger,
  ) {
    super();

    this.enabledCoins = new Set(this.config.get<string[]>('exchange_rate_api.codes') || []);

    this.enabled =
      this.config.get('exchange_rate_api.enabled') !== false &&
      !!this.config.get('exchange_rate_api.url') &&
      !!this.enabledCoins.size;

    this.weight = this.config.get<number>('exchange_rate_api.weight') ?? 10;
  }

  /**
   * Fetches the USD-based fiat rates and converts them into `BASE/USD` pairs.
   *
   * The endpoint pins the base currency in its URL, so no `baseCurrency` argument is
   * accepted; triangulation against other base coins is done downstream by `RatesService`.
   *
   * @returns Map of `CODE/USD` pairs to prices rounded to `decimals`, or an empty object
   * when the source is disabled. Codes missing or malformed upstream are skipped instead
   * of failing the whole batch.
   * @throws When the source is unreachable or reports a failure, so that
   * `RatesService.fetchTickers` can mark it unavailable.
   */
  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const url = this.config.get('exchange_rate_api.url') as string;

    const { data } = await axios.get<ExchangeRateApiDto>(url, { timeout: 10000 });

    // The provider answers with HTTP 200 and `{ result: 'error', 'error-type': '...' }`
    // on failures, so the payload must be validated before the rates are trusted.
    // The endpoint is keyless and public, so the URL is safe to include in the message.
    if (data?.result !== 'success' || typeof data.rates !== 'object' || data.rates === null) {
      throw new Error(
        `Unable to get rates from ${url}. Result: ${data?.result}, error type: ${data?.['error-type']}`,
      );
    }

    // The base currency is part of the URL, which is operator-configurable, and the inversion
    // below is only correct against USD. A perfectly valid response from another base
    // (`/v6/latest/EUR`) would otherwise be relabelled as USD and served as a plausible but
    // wrong rate, so the response has to state the base this connector assumes.
    if (data.base_code?.toUpperCase() !== BASE_CODE) {
      throw new Error(
        `Unable to use rates from ${url}: expected them to be quoted against ${BASE_CODE}, ` +
          `but the response is quoted against '${data.base_code}'. ` +
          `Point 'exchange_rate_api.url' at the ${BASE_CODE} endpoint.`,
      );
    }

    try {
      const rates: Tickers = {};
      const decimals = this.config.get<number>('decimals') ?? 12;

      this.enabledCoins.forEach((symbol) => {
        const coin = symbol.toUpperCase();
        const rate = data.rates?.[coin];

        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
          return;
        }

        // Upstream quotes "units of coin per 1 USD"; the served pair is the inverse.
        rates[`${coin}/USD`] = +(1 / rate).toFixed(decimals);
      });

      // A cycle without a single rate is not a success; see the note in the CoinPaprika connector.
      if (Object.keys(rates).length) {
        this.logger.info(`${this.resourceName} rates updated successfully.`);
      }

      return rates;
    } catch (error) {
      throw new Error(`Unable to process data from ${url}. Error: ${error}`, {
        cause: error,
      });
    }
  }
}
