import axios from 'axios';

import { ConfigService } from '@nestjs/config';
import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface ExchangeRateHostQuotes {
  [symbol: string]: number;
}

export interface ExchangeRateHostDto {
  quotes: ExchangeRateHostQuotes;
}

const baseUrl = `https://api.exchangerate.host/live`;
const skipCoins = ['USD', 'ETH'];

export class ExchangeRateHost implements BaseApi {
  public name = 'ExchangeRateHost';

  constructor(private config: ConfigService) {}

  async fetch(): Promise<Tickers> {
    if (!this.config.get<boolean>('exchange_rate_host.enabled')) {
      return {};
    }

    const apiKey = this.config.get<string>('exchange_rate_host.api_key');

    const url = `${baseUrl}?access_key=${apiKey}`;

    const { data } = await axios.get<ExchangeRateHostDto>(url);

    try {
      const rates = {};

      const baseCoins = this.config.get<string[]>('base_coins');
      const decimals = this.config.get<number>('decimals');

      baseCoins?.forEach((symbol) => {
        const coin = symbol.toUpperCase();

        if (skipCoins.includes(coin)) {
          return;
        }

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
