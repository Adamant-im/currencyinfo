import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { CoinIdFetcher } from './coin-id-fetcher';

class TestCoinIdFetcher extends CoinIdFetcher {
  static resourceName = 'TestResource';

  public enabled = true;
  public weight = 10;
  public enabledCoins = new Set<string>();

  public getCoinIdsMock = jest.fn();

  constructor(logger: Logger, notifier?: Notifier) {
    super(logger, notifier);
  }

  async fetch(): Promise<any> {
    return {};
  }

  async getCoinIds(): Promise<void> {
    return this.getCoinIdsMock();
  }
}

describe('CoinIdFetcher', () => {
  let logger: Partial<Logger>;
  let notifier: Partial<Notifier>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    logger = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    notifier = {
      notify: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve immediately when getCoinIds succeeds on the first attempt', async () => {
    const fetcher = new TestCoinIdFetcher(logger as Logger, notifier as Notifier);
    fetcher.getCoinIdsMock.mockResolvedValueOnce(undefined);

    const promise = fetcher.fetchCoinIds();
    await promise;

    expect(fetcher.getCoinIdsMock).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should retry with backoff and succeed on the second attempt', async () => {
    const fetcher = new TestCoinIdFetcher(logger as Logger, notifier as Notifier);
    fetcher.getCoinIdsMock
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(undefined);

    const promise = fetcher.fetchCoinIds();

    // Flush async catch block microtasks
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not get coin IDs for TestResource. Retrying attempt 1/3…',
    );

    // Advance 10s timer
    jest.advanceTimersByTime(10000);
    await promise;

    expect(fetcher.getCoinIdsMock).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should log error and notify when all 3 attempts fail', async () => {
    const fetcher = new TestCoinIdFetcher(logger as Logger, notifier as Notifier);
    fetcher.getCoinIdsMock.mockRejectedValue(new Error('Persistent API outage'));

    const promise = fetcher.fetchCoinIds();

    // Attempt 1 fails -> warns & schedules 10s
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not get coin IDs for TestResource. Retrying attempt 1/3…',
    );

    // Advance 10s for Attempt 2
    jest.advanceTimersByTime(10000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      'Could not get coin IDs for TestResource. Retrying attempt 2/3…',
    );

    // Advance 20s for Attempt 3
    jest.advanceTimersByTime(20000);
    await promise;

    expect(fetcher.getCoinIdsMock).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      'Could not fetch coin IDs for TestResource after 3 attempts',
    );
    expect(notifier.notify).toHaveBeenCalledWith(
      'error',
      'Could not fetch coin IDs for TestResource after 3 attempts. Rates from this source will be unavailable.',
    );
  });
});
