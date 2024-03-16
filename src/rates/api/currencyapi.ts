import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface CurrencyApiRates {
  [symbol: string]: number;
}

export interface CurrencyApiDto {
  rates: CurrencyApiRates;
}

const url =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';

export class CurrencyApi extends BaseApi {
  static resourceName = 'CurrencyApi';

  public enabled: boolean;

  private baseCoins: string[];

  constructor(private config: ConfigService) {
    super();

    const baseCoins = this.config.get('base_coins') as string[];
    const skipCoins = this.config.get('currency_api.skip') as string[];

    this.baseCoins = baseCoins.filter((coin) => !skipCoins.includes(coin));

    this.enabled =
      this.config.get('currency_api.enabled') !== false &&
      !!this.baseCoins.length;
  }

  async fetch() {
    if (!this.enabled) {
      return {};
    }

    const { data } = await axios.get<CurrencyApiDto>(url);

    try {
      const rates: Tickers = {};

      const decimals = this.config.get<number>('decimals');

      this.baseCoins.forEach((symbol) => {
        const coin = symbol.toUpperCase();

        const rate = data['usd'][symbol];

        if (!rate) {
          return;
        }

        rates[`USD/${coin}`] = +rate.toFixed(decimals);
        rates[`${coin}/USD`] = +(1 / +rate).toFixed(decimals);
      });

      return rates;
    } catch (error) {
      throw new Error(
        `Unable to process data ${JSON.stringify(data)} from request to ${url}. Error: ${error}`,
      );
    }
  }
}
