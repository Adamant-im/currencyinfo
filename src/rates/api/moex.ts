import { ConfigService } from '@nestjs/config';
import { LoggerService } from '@nestjs/common';

import axios from 'axios';

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
];

export interface MoexResponseDto {
  securities: {
    data: MoexData[];
  };
}

export class MoexApi extends BaseApi {
  static resourceName = 'MOEX';

  private codes = this.config.get<Record<string, string>>('moex.codes') || {};
  private pairs: string[] = Object.keys(this.codes);

  public enabledCoins = new Set(
    this.pairs.map((pair) =>
      pair === 'USD/RUB' ? 'RUB' : pair.replace('/RUB', ''),
    ),
  );

  public enabled =
    this.config.get<boolean>('moex.enabled') !== false && !!this.pairs.length;

  public weight = this.config.get<number>('moex.weight') || 10;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
    private notifier: Notifier,
  ) {
    super();
  }

  async fetch(): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    const url = this.config.get('moex.url') as string;

    const rates: Record<string, number> = {};

    const response = await axios.get<MoexResponseDto>(url);

    const data = response.data.securities.data.filter(
      (ticker) => ticker[1] === 'CETS',
    );

    const decimals = this.config.get<number>('decimals');

    const basePrice = this.getPrice('USD/RUB', data)!;

    if (!basePrice) {
      this.notifier.notify(
        'error',
        `Unable to get all of MOEX rates: No base price for USD/RUB has been found. Ensure config has the code for the pair.`,
      );
    }

    for (const pair of Object.keys(this.codes)) {
      let price = this.getPrice(pair, data);

      if (!price) {
        continue;
      }

      if (pair === 'JPY/RUB') {
        price /= 100;
      }

      if (pair === 'USD/RUB') {
        rates['RUB/USD'] = Number((1 / basePrice).toFixed(decimals));
      } else {
        rates[pair] = Number(price.toFixed(decimals));

        const market = `${pair.replace('/RUB', '')}/USD`;
        const altPrice = rates[pair] / basePrice;

        rates[market] = Number(altPrice.toFixed(decimals));
      }
    }

    this.logger.log(`${this.resourceName} rates updated successfully`);

    return rates;
  }

  getPrice(pair: string, data: MoexData[]) {
    const code = this.codes[pair];
    const ticker = data.find((ticker) => ticker[2] === code);

    if (!ticker) {
      return;
    }

    const price1 = ticker[14];
    const price2 = ticker[15];

    if (!price1 || !price2) {
      return;
    }

    const price = (price1 + price2) / 2;

    return price;
  }
}
