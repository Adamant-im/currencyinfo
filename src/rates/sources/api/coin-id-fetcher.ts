import { LoggerService } from '@nestjs/common';
import { BaseApi } from './base';

const MAX_ATTEMPT_COUNT = 3;

/**
 * Base class for rate connectors that require an initial remote coin ID discovery step.
 */
export abstract class CoinIdFetcher extends BaseApi {
  constructor(private retryLogger: LoggerService) {
    super();
  }

  /**
   * Attempts to fetch coin IDs with exponential-like backoff retry logic up to MAX_ATTEMPT_COUNT.
   */
  fetchCoinIds(attempt = 0): Promise<void> {
    return new Promise((resolve) => {
      (async () => {
        try {
          if (attempt > MAX_ATTEMPT_COUNT) {
            this.retryLogger.error(
              `Could not fetch coin IDs for ${this.resourceName} after ${MAX_ATTEMPT_COUNT} attempts`,
            );
            return resolve();
          }

          await this.getCoinIds();
          resolve();
        } catch {
          this.retryLogger.warn(
            `Could not get coin IDs for ${this.resourceName}. Retrying attempt ${attempt}/${MAX_ATTEMPT_COUNT}…`,
          );

          setTimeout(() => resolve(this.fetchCoinIds(attempt + 1)), attempt * 10000);
        }
      })();
    });
  }

  abstract getCoinIds(): Promise<void>;
}
