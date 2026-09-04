import { readFileSync } from 'fs';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import JSON5 from 'json5';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';
import { SourcesManager } from './sources-manager';
import { BaseApi } from './api/base';
import { Schema } from 'src/global/config/schema';

import { CurrencyApi } from './api/currencyapi';
import { CoingeckoApi } from './api/coingecko';
import { CryptoCompareApi } from './api/cryptocompare';
import { MoexApi } from './api/moex';
import { CoinmarketcapApi } from './api/coinmarketcap';
import { ExchangeRateHost } from './api/exchangeratehost';
import { ExchangeRateApi } from './api/exchangerateapi';
import { CoinPaprikaApi } from './api/coinpaprika';
import { CoinLoreApi } from './api/coinlore';
import { BinanceApi } from './api/binance';

/**
 * `RatesMerger.getPriority` resolves a source by its `resourceName`, so a name in `priorities`
 * that matches no connector silently ranks that source last instead of failing loudly.
 */
describe('config.default.jsonc priorities', () => {
  const registeredSources = [
    CurrencyApi,
    ExchangeRateApi,
    ExchangeRateHost,
    MoexApi,
    CoinmarketcapApi,
    CryptoCompareApi,
    CoingeckoApi,
    CoinPaprikaApi,
    CoinLoreApi,
    BinanceApi,
  ];

  it('should only reference registered connector resource names', () => {
    const template = JSON5.parse(readFileSync('./config.default.jsonc', 'utf-8'));
    const resourceNames = registeredSources.map(({ resourceName }) => resourceName);

    expect(template.priorities).not.toHaveLength(0);

    for (const name of template.priorities) {
      expect(resourceNames).toContain(name);
    }
  });

  it('should leave the deprecated CryptoCompare source out of the defaults', () => {
    const template = JSON5.parse(readFileSync('./config.default.jsonc', 'utf-8'));

    expect(template.priorities).not.toContain(CryptoCompareApi.resourceName);
    expect(template.cryptocompare.enabled).toBe(false);
  });

  it('should enable exactly the keyless sources by default', () => {
    const template = JSON5.parse(readFileSync('./config.default.jsonc', 'utf-8'));

    expect({
      coinpaprika: template.coinpaprika.enabled,
      coinlore: template.coinlore.enabled,
      binance: template.binance.enabled,
      currency_api: template.currency_api.enabled,
      exchange_rate_api: template.exchange_rate_api.enabled,
      coingecko: template.coingecko.enabled,
      coinmarketcap: template.coinmarketcap.enabled,
      exchange_rate_host: template.exchange_rate_host.enabled,
      moex: template.moex.enabled,
    }).toEqual({
      coinpaprika: true,
      coinlore: true,
      binance: true,
      currency_api: true,
      exchange_rate_api: true,
      coingecko: false,
      coinmarketcap: false,
      exchange_rate_host: false,
      moex: false,
    });
  });
});

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
