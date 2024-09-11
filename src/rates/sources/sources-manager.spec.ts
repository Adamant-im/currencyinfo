import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Notifier } from 'src/global/notifier/notifier.service';
import { SourcesManager } from './sources-manager';
import { BaseApi } from './api/base';
import { Schema } from 'src/global/config/schema';

describe('SourcesManager', () => {
  let sourcesManager: SourcesManager;
  let logger: Logger;

  const mockConfig = {
    minSources: 2,
    mappings: { BTC: 'Bitcoin' },
    base_coins: ['BTC', 'ETH', 'USD'],
  } as Partial<Schema>;

  beforeEach(async () => {
    const mockLogger = {
      warn: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SourcesManager,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation(
                (key: string) => mockConfig[key as keyof Schema],
              ),
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
    logger = module.get<Logger>(Logger);

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
    sourcesManager.logger = logger;

    sourcesManager.initializeSources();
  });

  it('should be defined', () => {
    expect(sourcesManager).toBeDefined();
  });

  it('should initialize with the correct minSources from config', () => {
    expect(sourcesManager['minSources']).toBe(mockConfig.minSources);
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
        expect.stringContaining(
          'No resources provide rates for the following base coins: ETH.',
        ),
      );
    });

    it('should not log anything if all base coins are available', () => {
      sourcesManager.allCoins = ['Bitcoin', 'ETH', 'USD'];
      sourcesManager.warnUnavailableBaseCoins();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });
});
