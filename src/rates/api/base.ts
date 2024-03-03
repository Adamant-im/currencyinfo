import { Tickers } from './dto/tickers.dto';

export interface BaseCoin {
  symbol: string;
}

export abstract class BaseApi {
  static resourceName: string;

  abstract enabled: boolean;
  coins?: BaseCoin[];

  getResourceName() {
    return (this.constructor as typeof BaseApi).resourceName;
  }

  abstract fetch(baseCurrency: string): Promise<Tickers>;
}
