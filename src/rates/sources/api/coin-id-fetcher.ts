import { LoggerService } from '@nestjs/common';
import { Notifier } from 'src/global/notifier/notifier.service';
import { BaseApi } from './base';

const MAX_ATTEMPT_COUNT = 3;

/**
 * Base class for rate connectors that require an initial remote coin ID discovery step.
 */
export abstract class CoinIdFetcher extends BaseApi {
  constructor(
    private retryLogger: LoggerService,
    private retryNotifier?: Notifier,
  ) {
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
            if (this.retryNotifier) {
              this.retryNotifier.notify(
                'error',
                `Could not fetch coin IDs for ${this.resourceName} after ${MAX_ATTEMPT_COUNT} attempts. Rates from this source will be unavailable.`,
              );
            }
            return resolve();
          }

          await this.getCoinIds();
          resolve();
        } catch {
          this.retryLogger.warn(
            `Could not get coin IDs for ${this.resourceName}. Retrying attempt ${attempt}/${MAX_ATTEMPT_COUNT}…`,
          );

          if (attempt >= MAX_ATTEMPT_COUNT) {
            this.retryLogger.error(
              `Could not fetch coin IDs for ${this.resourceName} after ${MAX_ATTEMPT_COUNT} attempts`,
            );
            if (this.retryNotifier) {
              this.retryNotifier.notify(
                'error',
                `Could not fetch coin IDs for ${this.resourceName} after ${MAX_ATTEMPT_COUNT} attempts. Rates from this source will be unavailable.`,
              );
            }
            return resolve();
          }

          setTimeout(() => resolve(this.fetchCoinIds(attempt + 1)), (attempt + 1) * 10000);
        }
      })();
    });
  }

  abstract getCoinIds(): Promise<void>;
}
