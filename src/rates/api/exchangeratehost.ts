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

const baseUrl = `https://api.exchangerate.host/live`;

export class ExchangeRateHost extends BaseApi {
  static resourceName = 'ExchangeRateHost';

  public enabled: boolean;
  public weight = this.config.get<number>('exchange_rate_host.weight') || 10;

  public enabledCoins = new Set(
    this.config.get<string[]>('exchange_rate_host.codes'),
  );

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();

    this.enabled =
      this.config.get('exchange_rate_host.enabled') !== false &&
      !!this.config.get<string>('exchange_rate_host.api_key') &&
      !!this.enabledCoins.size;
  }

  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const apiKey = this.config.get('exchange_rate_host.api_key') as string;

    const url = `${baseUrl}?access_key=${apiKey}`;

    const { data } = await axios.get<ExchangeRateHostDto>(url);

    try {
      const rates: Record<string, number> = {};

      const decimals = this.config.get<number>('decimals');

      this.enabledCoins.forEach((symbol) => {
        const coin = symbol.toUpperCase();

        const rate = data.quotes[`USD${coin}`];

        if (!rate) {
          return;
        }

        rates[`${coin}/USD`] = +(1 / +rate).toFixed(decimals);
      });

      this.logger.log(`${this.resourceName} rates updated successfully`);

      return rates;
    } catch (error) {
      throw new Error(
        `Unable to process data ${JSON.stringify(data)} from request to ${url}. Error: ${error}`,
      );
    }
  }
}
