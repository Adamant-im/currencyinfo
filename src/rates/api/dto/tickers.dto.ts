export interface Tickers {
  [ticker: string]: number;
}

export interface SourceTickers {
  [ticker: string]: {
    /**
     * Ticker price.
     */
    price: number;
    /**
     * Priotirized source for the rate.
     */
    source: string;
    /**
     * List of all the prices from the available sources.
     */
    prices: TickerPrice[];
  };
}

export type TickerPrice = [source: string, price: number];
