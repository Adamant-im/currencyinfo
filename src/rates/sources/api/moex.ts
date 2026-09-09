import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

type MoexData = [
  string,
  string, // "CETS"
  string, // "EUR_TODTOM"
  number,
  string,
  number,
  number,
  string,
  number,
  string,
  string,
  null,
  string,
  string,
  number | null, // 63
  number | null, // 61.5155
  string,
  string,
  number,
  number,
];

export interface MoexResponseDto {
  securities: {
    data: MoexData[];
  };
}

/**
 * Moscow Exchange (MOEX) fiat rates provider connector.
 */
export class MoexApi extends BaseApi {
  static resourceName = 'MOEX';

  private codes: Record<string, string>;
  private pairs: string[];
  public enabledCoins: Set<string>;
  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
    private notifier: Notifier,
  ) {
    super();

    this.codes = this.config.get<Record<string, string>>('moex.codes') || {};
    this.pairs = Object.keys(this.codes);

    this.enabledCoins = new Set(
      this.pairs.map((pair) => (pair === 'USD/RUB' ? 'RUB' : pair.replace('/RUB', ''))),
    );

    this.enabled = this.config.get<boolean>('moex.enabled') !== false && !!this.pairs.length;

    this.weight = this.config.get<number>('moex.weight') ?? 10;
  }

  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const url = this.config.get('moex.url') as string;
    const rates: Record<string, number> = {};

    const response = await axios.get<MoexResponseDto>(url, { timeout: 10000 });

    const data = response.data?.securities?.data?.filter((ticker) => ticker[1] === 'CETS') || [];

    const decimals = this.config.get<number>('decimals') ?? 12;
    const basePrice = this.getPrice('USD/RUB', data);

    for (const pair of Object.keys(this.codes)) {
      let price = this.getPrice(pair, data);

      if (!price) {
        continue;
      }

      if (pair === 'JPY/RUB') {
        price /= 100;
      }

      if (pair === 'USD/RUB') {
        rates['RUB/USD'] = Number((1 / price).toFixed(decimals));
      } else {
        rates[pair] = Number(price.toFixed(decimals));

        if (basePrice) {
          const market = `${pair.replace('/RUB', '')}/USD`;
          const altPrice = rates[pair] / basePrice;

          rates[market] = Number(altPrice.toFixed(decimals));
        }
      }
    }

    this.logger.info(`${this.resourceName} rates updated successfully.`);

    return rates;
  }

  getPrice(pair: string, data: MoexData[]): number | undefined {
    const code = this.codes[pair];
    const ticker = data.find((item) => item[2] === code);

    if (!ticker) {
      return;
    }

    const price1 = ticker[14];
    const price2 = ticker[15];

    if (!price1 || !price2) {
      return;
    }

    return (price1 + price2) / 2;
  }
}
