import { Tickers } from './dto/tickers.dto';

export interface BaseCoin {
  symbol: string;
}

export interface BaseApi {
  name: string;
  coins?: BaseCoin[];

  fetch(baseCurrency: string): Promise<Tickers>;
}
