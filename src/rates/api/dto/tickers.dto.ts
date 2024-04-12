export interface Tickers {
  [ticker: string]: number;
}

export interface SourceTickers {
  [ticker: string]: {
    price: number;
    source: string;
  };
}
