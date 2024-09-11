import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@nestjs/common';

import axios from 'axios';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface CurrencyApiRates {
  [symbol: string]: number;
}

export interface CurrencyApiDto {
  usd: CurrencyApiRates;
}

export class CurrencyApi extends BaseApi {
  static resourceName = 'CurrencyApi';

  public enabled: boolean;
  public weight = this.config.get<number>('currency_api.weight') || 10;

  public enabledCoins = new Set(
    this.config.get<string[]>('currency_api.codes'),
  );

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();

    this.enabled =
      this.config.get('currency_api.enabled') !== false &&
      this.config.get('currency_api.url') &&
      !!this.enabledCoins.size;
  }

  async fetch() {
    if (!this.enabled) {
      return {};
    }

    const url = this.config.get('currency_api.url') as string;

    const { data } = await axios.get<CurrencyApiDto>(url);

    try {
      const rates: Tickers = {};

      const decimals = this.config.get<number>('decimals');

      this.enabledCoins.forEach((symbol) => {
        const rate = data['usd'][symbol.toLowerCase()];

        if (!rate) {
          return;
        }

        const coin = symbol.toUpperCase();

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
