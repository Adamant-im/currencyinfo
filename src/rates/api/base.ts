import { Tickers } from './dto/tickers.dto';

export interface BaseCoin {
  symbol: string;
}

export abstract class BaseApi {
  /**
   * Readable API's name.
   */
  static resourceName: string;

  /**
   * Whenever the app should fetch data from the API,
   * the value is taken from the config file.
   */
  abstract enabled: boolean;

  /**
   * List of coin symbols with ID within corresponding API.
   */
  coins?: BaseCoin[];

  /**
   * Returns readable name of the API.
   */
  getResourceName() {
    return (this.constructor as typeof BaseApi).resourceName;
  }

  /**
   * Retrieves tickers from the API.
   */
  abstract fetch(baseCurrency: string): Promise<Tickers>;
}
