import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { SourcesManager } from './sources-manager';
import { BaseApi } from './api/base';
import { Schema } from 'src/global/config/schema';

describe('SourcesManager', () => {
  let sourcesManager: SourcesManager;
  let logger: Partial<Logger>;

  const mockConfig = {
    minSources: 2,
    mappings: { BTC: 'Bitcoin' },
    base_coins: ['BTC', 'ETH', 'USD'],
  } as Partial<Schema>;

  beforeEach(async () => {
    const mockLogger = {
      warn: jest.fn(),
      log: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourcesManager,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => mockConfig[key as keyof Schema]),
          },
        },
        {
          provide: Logger,
          useValue: mockLogger,
        },
        {
          provide: Notifier,
          useValue: {},
        },
      ],
    }).compile();

    sourcesManager = module.get<SourcesManager>(SourcesManager);
    logger = mockLogger;

    sourcesManager.initializeSources = jest.fn(function () {
      this.sources = [
        {
          enabled: true,
          enabledCoins: new Set(['BTC', 'ETH']),
          ready: Promise.resolve(),
          weight: 500,
          resourceName: 'ASource',
          fetch: jest.fn(),
        },
        {
          enabled: true,
          enabledCoins: new Set(['ETH']),
          ready: Promise.resolve(),
          weight: 500,
          resourceName: 'AnotherSource',
          fetch: jest.fn(),
        },
      ] as BaseApi[];
    });
    sourcesManager.logger = logger as Logger;

    sourcesManager.initializeSources();
  });

  it('should be defined', () => {
    expect(sourcesManager).toBeDefined();
  });

  it('should initialize with the correct minSources from config', () => {
    expect(sourcesManager['minSources']).toBe(mockConfig.minSources);
  });

  describe('getSourceWeights', () => {
    it('should return weights for all enabled sources', () => {
      const weights = sourcesManager.getSourceWeights();
      expect(weights).toEqual({
        ASource: 500,
        AnotherSource: 500,
      });
    });
  });

  describe('getEnabledCoins', () => {
    it('should count enabled coins for each pair without duplicates and warn about insufficiency', async () => {
      await sourcesManager.getEnabledCoins();

      expect(sourcesManager.allCoins).toEqual(['Bitcoin', 'ETH']);
      expect(sourcesManager.sourcePairRecord['Bitcoin/USD']).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `(minSources=${mockConfig.minSources}), but they are going to be saved anyway: Bitcoin/USD (1)`,
        ),
      );
    });

    it('should count each mapped pair once per source and reset counts on reinitialization', async () => {
      const originalMappings = mockConfig.mappings;
      mockConfig.mappings = { BTC: 'Bitcoin', XBT: 'Bitcoin' };
      sourcesManager.sources = [
        {
          enabled: true,
          enabledCoins: new Set(['BTC', 'XBT']),
          ready: Promise.resolve(),
          weight: 500,
          resourceName: 'AliasedSource',
          fetch: jest.fn(),
        },
      ] as BaseApi[];

      try {
        await sourcesManager.getEnabledCoins();
        await sourcesManager.getEnabledCoins();

        expect(sourcesManager.sourcePairRecord).toEqual({ 'Bitcoin/USD': 1 });
      } finally {
        mockConfig.mappings = originalMappings;
      }
    });

    it('should cap per-pair coverage at the configured minSources', async () => {
      // minSources is an upper bound: a pair advertised by one source records 1,
      // so the merger accepts that single quote instead of requiring two.
      sourcesManager.sources = [
        {
          enabled: true,
          enabledCoins: new Set(['BTC', 'SOLO']),
          ready: Promise.resolve(),
          weight: 500,
          resourceName: 'FirstSource',
          fetch: jest.fn(),
        },
        {
          enabled: true,
          enabledCoins: new Set(['BTC']),
          ready: Promise.resolve(),
          weight: 500,
          resourceName: 'SecondSource',
          fetch: jest.fn(),
        },
      ] as BaseApi[];

      await sourcesManager.getEnabledCoins();

      // `BTC` is mapped to `Bitcoin` by the shared mock config.
      expect(sourcesManager.sourcePairRecord['SOLO/USD']).toBe(1);
      expect(sourcesManager.sourcePairRecord['Bitcoin/USD']).toBe(2);
    });
  });

  describe('warnInsufficiency', () => {
    it('should log warning if there are pairs with insufficient sources', () => {
      sourcesManager.sourcePairRecord = {
        'Bitcoin/USD': 1,
        'Ethereum/USD': 3,
      };
      sourcesManager.warnInsufficiency();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          `(minSources=${mockConfig.minSources}), but they are going to be saved anyway: Bitcoin/USD (1)`,
        ),
      );
    });

    it('should not log anything if all pairs have sufficient sources', () => {
      sourcesManager.sourcePairRecord = {
        'Bitcoin/USD': 2,
        'Ethereum/USD': 2,
      };
      sourcesManager.warnInsufficiency();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('warnUnavailableBaseCoins', () => {
    it('should log warning if there are unavailable base coins', () => {
      sourcesManager.allCoins = ['Bitcoin'];
      sourcesManager.warnUnavailableBaseCoins();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No resources provide rates for the following base coins: ETH.'),
      );
    });

    it('should not log anything if all base coins are available', () => {
      sourcesManager.allCoins = ['Bitcoin', 'ETH', 'USD'];
      sourcesManager.warnUnavailableBaseCoins();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
