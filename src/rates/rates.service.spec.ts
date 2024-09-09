import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Notifier } from 'src/global/notifier/notifier.service';
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
    public enabledCoins = new Set(
      Object.keys(response).map((pair) => pair.split('/')[0]),
    ),
  ) {}

  fetch() {
    return Promise.resolve(this.response);
  }
}

describe('RatesService', () => {
  let service: RatesService;
  let tickerModel: any;
  let timestampModel: any;
  let notifier: any;
  let configService: ConfigService;
  let sourceManager: SourcesManager;
  let schedulerRegistry: SchedulerRegistry;

  const setupMocks = () => {
    tickerModel = {
      create: jest.fn(),
      aggregate: jest.fn(() => ({
        cursor: jest.fn().mockReturnThis(),
        next: jest.fn(),
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
            decimals: 2,
            strategy: 'avg',
            rateDifferencePercentThreshold: 0.1,
            groupPercentage: 10,
            minSources: 3,
            rateLifetime: 60,
            priorities: ['ASource', 'BSource'],
            base_coins: ['BTC', 'ETH', 'USD'],
            refreshInterval: 10,
            mappings: { BTC: 'Bitcoin', ETH: 'Ethereum' },
          })[key],
      ),
    } as any;

    sourceManager = new SourcesManager(configService, notifier);
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
      ],
    }).compile();

    service = module.get<RatesService>(RatesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      expect.stringContaining('previously stored rates will be saved'),
    );

    expect(service.tickers).toStrictEqual({ 'Bitcoin/USD': 100 });
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
      expect.stringContaining(
        'these errors have persisted for more than 60 min',
      ),
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

    expect(failSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save'),
    );
  });

  it('should handle fetch tickers errors', async () => {
    const failSpy = jest.spyOn(service, 'fail');
    const mockSource = new MockedApi('Mock API', {}, true);

    jest.spyOn(mockSource, 'fetch').mockRejectedValue(new Error('API error'));

    await service.fetchTickers(mockSource);

    expect(failSpy).toHaveBeenCalledWith(expect.stringContaining('API error'));
  });
});
