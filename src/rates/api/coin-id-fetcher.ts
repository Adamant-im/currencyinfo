import { BaseApi } from './base';

const MAX_ATTEMPT_COUNT = 3;

export abstract class CoinIdFetcher extends BaseApi {
  fetchCoinIds(attempt = 1): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        if (attempt > MAX_ATTEMPT_COUNT) {
          console.error(`Could not fetch coin IDs for ${this.resourceName}`);
          process.exit(-1);
        }

        await this.getCoinIds();

        resolve();
      } catch (error) {
        setTimeout(
          () => resolve(this.fetchCoinIds(attempt + 1)),
          attempt * 1000,
        );
      }
    });
  }

  abstract getCoinIds(): Promise<void>;
}
