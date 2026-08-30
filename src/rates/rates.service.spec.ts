import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AxiosError } from 'axios';
import { Notifier } from 'src/global/notifier/notifier.service';
import { Logger } from 'src/global/logger/logger.service';
import { RatesService } from './rates.service';
import { Ticker } from './schemas/ticker.schema';
import { Timestamp } from './schemas/timestamp.schema';
import { SourcesManager } from './sources/sources-manager';
import { Tickers } from './sources/api/dto/tickers.dto';
import { BaseApi } from './sources/api/base';

class MockedApi implements BaseApi {
  constructor(
    public resourceName: string,
    public response: Tickers,
    public enabled = true,
    public weight = 100,
    public enabledCoins = new Set(Object.keys(response).map((pair) => pair.split('/')[0])),
  ) {}

  fetch() {
    return Promise.resolve(this.response);
  }
}

describe('RatesService', () => {
  let service: RatesService;
  let tickerModel: any;
  let timestampModel: any;
  let aggregateCursor: any;
  let notifier: any;
  let configService: ConfigService;
  let sourceManager: SourcesManager;
  let schedulerRegistry: SchedulerRegistry;
  let mockLogger: any;

  const setupMocks = () => {
    aggregateCursor = {
      next: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    };
    tickerModel = {
      create: jest.fn(),
      aggregate: jest.fn(() => ({
        cursor: jest.fn(() => aggregateCursor),
      })),
    };
    timestampModel = {
      create: jest.fn(),
      findOne: jest.fn(),
    };
    notifier = { notify: jest.fn() };
    configService = {
      get: jest.fn(
        (key: string) =>
          ({
            decimals: 8,
            strategy: 'avg',
            rateDifferencePercentThreshold: 0.1,
            groupPercentage: 10,
            minSources: 3,
            rateLifetime: 60,
            priorities: ['ASource', 'BSource'],
            base_coins: ['Bitcoin', 'Ethereum', 'USD'],
            refreshInterval: 10,
            mappings: { BTC: 'Bitcoin', ETH: 'Ethereum' },
          })[key],
      ),
    } as any;

    schedulerRegistry = {
      addInterval: jest.fn(),
      deleteInterval: jest.fn(),
      getInterval: jest.fn(),
    } as any;
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
    };
    sourceManager = new SourcesManager(configService, notifier, mockLogger as any);
    sourceManager.initialize = jest.fn(async function () {
      this.sources = [
        new MockedApi('ASource', { 'BTC/USD': 100 }),
        new MockedApi('BSource', { 'BTC/USD': 500 }),
      ];
      this.sourceCount = this.sources.length;
    });
  };

  beforeEach(async () => {
    setupMocks();

    RatesService.prototype.init = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatesService,
        { provide: SchedulerRegistry, useValue: schedulerRegistry },
        { provide: ConfigService, useValue: configService },
        { provide: getModelToken(Ticker.name), useValue: tickerModel },
        { provide: getModelToken(Timestamp.name), useValue: timestampModel },
        { provide: Notifier, useValue: notifier },
        { provide: SourcesManager, useValue: sourceManager },
        { provide: Logger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<RatesService>(RatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should sanitize API keys from error strings and query parameters', () => {
    const rawUrl = 'https://api.exchangerate.host/live?access_key=SECRET_EXR_KEY&format=1';
    const sanitized = service.sanitizeErrorMessage(rawUrl);
    expect(sanitized).toBe('https://api.exchangerate.host/live?access_key=***&format=1');
    expect(sanitized).not.toContain('SECRET_EXR_KEY');
  });

  it('should deeply sanitize API keys and sensitive tokens from request params objects', () => {
    const rawParams = {
      fsyms: 'BTC,ETH',
      tsyms: 'USD',
      api_key: 'SECRET_CRYPTOCOMPARE_KEY',
      nested: {
        access_key: 'ANOTHER_SECRET',
      },
    };

    const sanitized = service.sanitizeParams(rawParams);
    expect(sanitized).toEqual({
      fsyms: 'BTC,ETH',
      tsyms: 'USD',
      api_key: '***',
      nested: {
        access_key: '***',
      },
    });
  });

  it('should sanitize secrets when fetchTickers fails with an AxiosError', async () => {
    const failSpy = jest.spyOn(service, 'fail').mockImplementation();
    const mockSource = new MockedApi('CryptoCompare', {}, true);

    const axiosError = new AxiosError('Request failed with status code 401');
    axiosError.config = {
      url: 'https://min-api.cryptocompare.com/data/pricemulti',
      params: {
        fsyms: 'BTC,ETH',
        tsyms: 'USD',
        api_key: 'SECRET_CC_KEY',
      },
    } as any;
    axiosError.response = { status: 401 } as any;

    jest.spyOn(mockSource, 'fetch').mockRejectedValue(axiosError);

    await service.fetchTickers(mockSource);

    expect(failSpy).toHaveBeenCalledWith(expect.not.stringContaining('SECRET_CC_KEY'));
    expect(failSpy).toHaveBeenCalledWith(expect.stringContaining('api_key":"***"'));
  });

  it('should initialize properly', async () => {
    const initSpy = jest.spyOn(service, 'init');
    service.init();
    expect(initSpy).toHaveBeenCalled();
  });

  it('should warn about a significant difference with no previous rates', async () => {
    jest.spyOn(service, 'saveTickers').mockResolvedValue();

    service.sourceTickers = {};

    await service.updateTickers();

    expect(notifier.notify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('difference between sources is too big'),
    );

    expect(notifier.notify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('no previous rates'),
    );

    expect(service.tickers).toStrictEqual({});
  });

  it('should warn about a significant difference and save previous rates', async () => {
    jest.spyOn(service, 'saveTickers').mockResolvedValue();

    service.sourceTickers = {
      'Bitcoin/USD': [{ source: 'ASource', price: 100, timestamp: Date.now() }],
    };

    await service.updateTickers();

    expect(notifier.notify).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('difference between sources is too big'),
    );

    expect(notifier.notify).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('previously stored rates will be served'),
    );

    expect(service.tickers).toStrictEqual({
      'Bitcoin/Bitcoin': 1,
      'Bitcoin/USD': 100,
    });
  });

  it('should notify the persistent error for long-standing differences', async () => {
    jest.spyOn(service, 'saveTickers').mockResolvedValue();

    service.sourceTickers = {
      'Bitcoin/USD': [{ source: 'ASource', price: 100, timestamp: 0 }],
    };

    await service.updateTickers();

    expect(notifier.notify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('difference between sources is too big'),
    );

    expect(notifier.notify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('these errors have persisted for more than 60 min'),
    );

    expect(service.tickers).toStrictEqual({});
  });

  it('should save tickers to the database', async () => {
    await service.saveTickers(2);

    expect(tickerModel.create).toHaveBeenCalled();
    expect(timestampModel.create).toHaveBeenCalled();
  });

  it('should handle error when saving tickers fails', async () => {
    const failSpy = jest.spyOn(service, 'fail');
    tickerModel.create.mockRejectedValue(new Error('Failed to save'));

    await service.saveTickers(2);

    expect(failSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save'));
  });

  it('should handle fetch tickers errors', async () => {
    const failSpy = jest.spyOn(service, 'fail');
    const mockSource = new MockedApi('Mock API', {}, true);

    jest.spyOn(mockSource, 'fetch').mockRejectedValue(new Error('API error'));

    await service.fetchTickers(mockSource);

    expect(failSpy).toHaveBeenCalledWith(expect.stringContaining('API error'));
  });

  it('should reject empty and malformed source responses without marking them available', async () => {
    const failSpy = jest.spyOn(service, 'fail');
    const invalidSource = new MockedApi('Invalid API', {}, true);

    jest.spyOn(invalidSource, 'fetch').mockResolvedValue({
      'BTC/USD': 50_000,
      'ETH/USD': -1,
      'ADM/USD': Number.POSITIVE_INFINITY,
      BROKEN: 1,
    });

    await expect(service.fetchTickers(invalidSource)).resolves.toEqual({ 'BTC/USD': 50_000 });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('returned 3 malformed or non-positive rate entries'),
    );

    jest.spyOn(invalidSource, 'fetch').mockResolvedValue({});
    await expect(service.fetchTickers(invalidSource)).resolves.toBeUndefined();
    expect(failSpy).toHaveBeenCalledWith(expect.stringContaining('no valid positive rates'));
  });

  it('should not save a snapshot when all enabled sources return no valid rates', async () => {
    await service['ready'];
    sourceManager.sources = [new MockedApi('Empty API', {}, true)];
    sourceManager.sourceCount = 1;
    const saveSpy = jest.spyOn(service, 'saveTickers').mockResolvedValue();

    await service.updateTickers();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(notifier.notify).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('No data has been saved'),
    );
  });

  it('should skip overlapping scheduled updates', async () => {
    await service['ready'];

    let resolveFetch!: (tickers: Tickers) => void;
    const pendingFetch = new Promise<Tickers>((resolve) => {
      resolveFetch = resolve;
    });
    const source = new MockedApi('Slow API', { 'BTC/USD': 50_000 }, true);
    const fetchSpy = jest.spyOn(source, 'fetch').mockReturnValue(pendingFetch);
    sourceManager.sources = [source];
    sourceManager.sourceCount = 1;
    sourceManager.sourcePairRecord = { 'BTC/USD': 1 };
    jest.spyOn(service, 'saveTickers').mockResolvedValue();

    const firstUpdate = service.updateTickers();
    await Promise.resolve();
    await service.updateTickers();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Skipping rate update because the previous update is still in progress.',
    );

    resolveFetch({ 'BTC/USD': 50_000 });
    await firstUpdate;
  });

  describe('getHistoryTickers', () => {
    it('should query one-sided time ranges and sort by rate timestamp', async () => {
      aggregateCursor.next.mockResolvedValue(null);

      await service.getHistoryTickers({ from: 100 });

      expect(tickerModel.aggregate).toHaveBeenCalledWith([
        { $match: { date: { $gte: 100_000 } } },
        { $sort: { date: -1, _id: -1 } },
      ]);
      expect(aggregateCursor.close).toHaveBeenCalled();
    });

    it('should preserve BASE/QUOTE order in exact and partial pair filters', async () => {
      aggregateCursor.next.mockResolvedValue(null);

      await service.getHistoryTickers({ coin: 'ADM/USD' });
      expect(tickerModel.aggregate).toHaveBeenLastCalledWith([
        { $match: { base: 'ADM', quote: 'USD' } },
        { $sort: { date: -1, _id: -1 } },
      ]);

      await service.getHistoryTickers({ coin: 'ADM/' });
      expect(tickerModel.aggregate).toHaveBeenLastCalledWith([
        { $match: { base: 'ADM' } },
        { $sort: { date: -1, _id: -1 } },
      ]);
    });

    it('should process timestamp zero instead of silently ignoring it', async () => {
      timestampModel.findOne.mockResolvedValue(null);

      await expect(service.getHistoryTickers({ timestamp: 0 })).resolves.toEqual([]);
      expect(timestampModel.findOne).toHaveBeenCalledWith({ date: { $lte: 0 } }, null, {
        sort: { date: -1 },
      });
      expect(tickerModel.aggregate).not.toHaveBeenCalled();
    });

    it('should close the database cursor after reaching the requested snapshot limit', async () => {
      aggregateCursor.next
        .mockResolvedValueOnce({ date: 2000, base: 'BTC', quote: 'USD', rate: 50_000 })
        .mockResolvedValueOnce({ date: 2000, base: 'ETH', quote: 'USD', rate: 2500 })
        .mockResolvedValueOnce({ date: 1000, base: 'BTC', quote: 'USD', rate: 49_000 });
      timestampModel.findOne.mockResolvedValue({ _id: 'timestamp-id' });

      const result = await service.getHistoryTickers({ limit: 1 });

      expect(result).toEqual([
        {
          _id: 'timestamp-id',
          date: 2000,
          tickers: { 'BTC/USD': 50_000, 'ETH/USD': 2500 },
        },
      ]);
      expect(aggregateCursor.close).toHaveBeenCalled();
    });
  });

  it('should use all base coins from the config', async () => {
    jest.spyOn(service, 'saveTickers').mockResolvedValue();

    sourceManager.sources = [
      new MockedApi('ASource', {
        'BTC/USD': 100,
        'ETH/USD': 0.1,
        'ADM/USD': 10000,
        'USD/USD': 1,
      }),
    ];
    await sourceManager.getEnabledCoins();

    await service.updateTickers();

    expect(service.tickers).toStrictEqual({
      'Bitcoin/USD': 100,
      'Ethereum/USD': 0.1,
      'ADM/USD': 10000,
      'USD/USD': 1,
      'Bitcoin/Bitcoin': 1,
      'Ethereum/Bitcoin': 0.001,
      'USD/Bitcoin': 0.01,
      'ADM/Bitcoin': 100,
      'Bitcoin/Ethereum': 1000,
      'Ethereum/Ethereum': 1,
      'USD/Ethereum': 10,
      'ADM/Ethereum': 100000,
    });
  });

  it('should synchronize pairSources and weights from SourcesManager during updateTickers', async () => {
    jest.spyOn(service, 'saveTickers').mockResolvedValue();

    sourceManager.sources = [
      new MockedApi('ASource', { 'BTC/USD': 100 }, true, 300),
      new MockedApi('BSource', { 'BTC/USD': 100, 'ETH/USD': 10 }, true, 700),
    ];
    await sourceManager.getEnabledCoins();

    await service.updateTickers();

    expect(service['pairSources']).toEqual(sourceManager.sourcePairRecord);
    expect(service['weights']).toEqual(sourceManager.getSourceWeights());
    expect(service['weights']).toEqual({
      ASource: 300,
      BSource: 700,
    });
  });
});
