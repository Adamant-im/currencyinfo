export interface Tickers {
  [ticker: string]: number;
}

export interface SourceTickers {
  [ticker: string]: TickerPrice[];
}

export type TickerPrice = {
  source: string;
  price: number;
  timestamp: number;
};
