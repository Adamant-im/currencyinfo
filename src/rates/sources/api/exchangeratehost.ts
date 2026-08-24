import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@nestjs/common';

import axios from 'axios';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface ExchangeRateHostQuotes {
  [symbol: string]: number;
}

export interface ExchangeRateHostDto {
  quotes: ExchangeRateHostQuotes;
}

const baseUrl = 'https://api.exchangerate.host/live';

/**
 * ExchangeRate.host API provider connector.
 */
export class ExchangeRateHost extends BaseApi {
  static resourceName = 'ExchangeRateHost';

  public enabled: boolean;
  public weight: number;
  public enabledCoins: Set<string>;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();

    this.enabledCoins = new Set(this.config.get<string[]>('exchange_rate_host.codes') || []);

    this.enabled =
      this.config.get('exchange_rate_host.enabled') !== false &&
      !!this.config.get<string>('exchange_rate_host.api_key') &&
      !!this.enabledCoins.size;

    this.weight = this.config.get<number>('exchange_rate_host.weight') || 10;
  }

  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const apiKey = this.config.get('exchange_rate_host.api_key') as string;
    const url = `${baseUrl}?access_key=${apiKey}`;

    const { data } = await axios.get<ExchangeRateHostDto>(url, { timeout: 10000 });

    try {
      const rates: Record<string, number> = {};
      const decimals = this.config.get<number>('decimals') || 12;

      this.enabledCoins.forEach((symbol) => {
        const coin = symbol.toUpperCase();
        const rate = data.quotes?.[`USD${coin}`];

        if (!rate) {
          return;
        }

        rates[`${coin}/USD`] = +(1 / +rate).toFixed(decimals);
      });

      this.logger.log(`${this.resourceName} rates updated successfully.`);

      return rates;
    } catch (error) {
      throw new Error(`Unable to process data from ${url}. Error: ${error}`, {
        cause: error,
      });
    }
  }
}
