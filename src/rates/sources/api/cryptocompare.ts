import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Tickers } from './dto/tickers.dto';
import { BaseApi } from './base';

const url = 'https://min-api.cryptocompare.com/data/pricemulti';

/**
 * CryptoCompare API rate provider connector.
 */
export class CryptoCompareApi extends BaseApi {
  static resourceName = 'CryptoCompare';

  public enabledCoins: Set<string>;
  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
  ) {
    super();

    this.enabledCoins = new Set(this.config.get<string[]>('cryptocompare.coins') || []);

    this.enabled = this.config.get('cryptocompare.enabled') !== false && !!this.enabledCoins.size;

    this.weight = this.config.get<number>('cryptocompare.weight') ?? 10;
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled || !this.enabledCoins.size) {
      return {};
    }

    const apiKey = this.config.get('cryptocompare.api_key') as string;

    const params = {
      fsyms: [...this.enabledCoins].join(),
      tsyms: baseCurrency,
      api_key: apiKey,
    };

    const decimals = this.config.get<number>('decimals') ?? 12;

    const { data } = await axios.get(url, {
      params,
      timeout: 10000,
    });

    const exchangeRates: Record<string, number> = {};

    this.enabledCoins.forEach((coin) => {
      if (data[coin]?.[baseCurrency]) {
        exchangeRates[`${coin}/${baseCurrency}`] = +data[coin][baseCurrency].toFixed(decimals);
      }
    });

    this.logger.info(`${this.resourceName} rates updated against ${baseCurrency} successfully.`);

    return exchangeRates;
  }
}
