import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Tickers } from './dto/tickers.dto';
import { BaseApi } from './base';

const url = 'https://min-api.cryptocompare.com/data/pricemulti';

export class CryptoCompareApi extends BaseApi {
  static resourceName = 'CryptoCompare';

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {
    super();
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    const enabled = this.config.get<boolean>('cryptocompare.enabled');
    const apiKey = this.config.get<string>('cryptocompare.api_key');

    if (enabled === false || !apiKey) {
      return {};
    }

    const coins = this.config.get<string[]>('cryptocompare.coins');

    const params = {
      fsyms: coins?.join(),
      tsyms: baseCurrency,
      api_key: apiKey,
    };

    const decimals = this.config.get('decimals');

    const { data } = await axios.get(url, {
      params,
    });

    const exchangeRates: Record<string, number> = {};

    coins?.forEach((coin) => {
      exchangeRates[`${coin}/${baseCurrency}`] =
        +data[coin][baseCurrency].toFixed(decimals);
    });

    this.logger.log(
      `CryptoCompare rates updated against ${baseCurrency} successfully`,
    );

    return exchangeRates;
  }
}
