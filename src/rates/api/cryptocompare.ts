import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Tickers } from './dto/tickers.dto';
import { BaseApi } from './base';

const url = 'https://min-api.cryptocompare.com/data/pricemulti';

export class CryptoCompareApi extends BaseApi {
  static resourceName = 'CryptoCompare';

  public enabled =
    this.config.get('cryptocompare.enabled') !== false &&
    !!this.config.get<string>('cryptocompare.api_key') &&
    !!this.config.get<string[]>('cryptocompare.coins')?.length;

  public weight = this.config.get<number>('cryptocompare.weight') || 10;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const apiKey = this.config.get('cryptocompare.api_key') as string;
    const coins = this.config.get('cryptocompare.coins') as string[];

    const params = {
      fsyms: coins.join(),
      tsyms: baseCurrency,
      api_key: apiKey,
    };

    const decimals = this.config.get('decimals');

    const { data } = await axios.get(url, {
      params,
    });

    const exchangeRates: Record<string, number> = {};

    coins.forEach((coin) => {
      exchangeRates[`${coin}/${baseCurrency}`] =
        +data[coin][baseCurrency].toFixed(decimals);
    });

    this.logger.log(
      `${this.resourceName} rates updated against ${baseCurrency} successfully`,
    );

    return exchangeRates;
  }
}
