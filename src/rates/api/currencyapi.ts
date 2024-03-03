import axios from 'axios';

import { ConfigService } from '@nestjs/config';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface CurrencyApiRates {
  [symbol: string]: number;
}

export interface CurrencyApiDto {
  rates: CurrencyApiRates;
}

const url =
  'https://cdn.jsdelivr.net/gh/fawazahmed0/currency-api@1/latest/currencies/usd.json';

const skipCoins = ['USD', 'BTC', 'ETH'];

export class CurrencyApi extends BaseApi {
  static resourceName = 'CurrencyApi';

  constructor(private config: ConfigService) {
    super();
  }

  async fetch() {
    const baseCoins = this.config.get<string[]>('base_coins');

    if (!baseCoins?.length) {
      return {};
    }

    const { data } = await axios.get<CurrencyApiDto>(url);

    try {
      const rates: Tickers = {};

      const decimals = this.config.get<number>('decimals');

      baseCoins.forEach((symbol) => {
        const coin = symbol.toUpperCase();

        if (skipCoins.includes(coin)) {
          return;
        }

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
