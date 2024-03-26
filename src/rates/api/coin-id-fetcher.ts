import { LoggerService } from '@nestjs/common';
import { BaseApi } from './base';

const MAX_ATTEMPT_COUNT = 3;

export abstract class CoinIdFetcher extends BaseApi {
  constructor(private retryLogger: LoggerService) {
    super();
  }

  fetchCoinIds(attempt = 0): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        if (attempt > MAX_ATTEMPT_COUNT) {
          this.retryLogger.error(
            `Could not fetch coin IDs for ${this.resourceName}`,
          );
          process.exit(-1);
        }

        await this.getCoinIds();

        resolve();
      } catch (error) {
        this.retryLogger.warn(
          `Could not get coin IDs for ${this.resourceName}. Retrying ${attempt}/${MAX_ATTEMPT_COUNT}...`,
        );

        setTimeout(
          () => resolve(this.fetchCoinIds(attempt + 1)),
          attempt * 10000,
        );
      }
    });
  }

  abstract getCoinIds(): Promise<void>;
}
