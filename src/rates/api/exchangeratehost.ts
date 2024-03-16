import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface ExchangeRateHostQuotes {
  [symbol: string]: number;
}

export interface ExchangeRateHostDto {
  quotes: ExchangeRateHostQuotes;
}

const baseUrl = `https://api.exchangerate.host/live`;

export class ExchangeRateHost extends BaseApi {
  static resourceName = 'ExchangeRateHost';

  public enabled: boolean;

  private baseCoins: string[];

  constructor(private config: ConfigService) {
    super();

    const baseCoins = this.config.get('base_coins') as string[];
    const skipCoins = this.config.get('exchange_rate_host.skip') as string[];

    this.baseCoins = baseCoins.filter((coin) => !skipCoins.includes(coin));

    this.enabled =
      this.config.get('exchange_rate_host.enabled') !== false &&
      !!this.config.get<string>('exchange_rate_host.api_key') &&
      !!this.baseCoins.length;
  }

  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const apiKey = this.config.get('exchange_rate_host.api_key') as string;

    const url = `${baseUrl}?access_key=${apiKey}`;

    const { data } = await axios.get<ExchangeRateHostDto>(url);

    try {
      const rates = {};

      const decimals = this.config.get<number>('decimals');

      this.baseCoins.forEach((symbol) => {
        const coin = symbol.toUpperCase();

        const rate = data.quotes[`USD${coin}`];

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
