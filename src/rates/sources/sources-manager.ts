import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { BaseApi } from './api/base';

import { CurrencyApi } from './api/currencyapi';
import { CoingeckoApi } from './api/coingecko';
import { CryptoCompareApi } from './api/cryptocompare';
import { MoexApi } from './api/moex';
import { CoinmarketcapApi } from './api/coinmarketcap';
import { ExchangeRateHost } from './api/exchangeratehost';

/**
 * Manages external rate provider connectors, lifecycle initialization,
 * enabled coin discovery, and minSources threshold verification.
 */
@Injectable()
export class SourcesManager {
  public sources: BaseApi[] = [];

  /**
   * List of all discovered coins available across enabled sources.
   */
  public allCoins: string[] = [];

  /**
   * Map of pair names to their effective source count bound to minSources.
   */
  public sourcePairRecord: Record<string, number> = {};

  /**
   * Count of active enabled sources.
   */
  public sourceCount = 0;

  private minSources: number;

  constructor(
    private config: ConfigService,
    private notifier: Notifier,
    public logger: Logger,
  ) {
    this.minSources = (config.get('minSources') as number) ?? 1;
  }

  /**
   * Boots up all source connectors, waits for coin discovery, and verifies base coin availability.
   */
  async initialize() {
    this.initializeSources();
    await this.getEnabledCoins();
    this.warnUnavailableBaseCoins();
  }

  /**
   * Instantiates all supported API provider connectors.
   */
  initializeSources() {
    this.sources = [
      new CurrencyApi(this.config, this.logger),
      new ExchangeRateHost(this.config, this.logger),
      new MoexApi(this.config, this.logger, this.notifier),
      new CoinmarketcapApi(this.config, this.logger, this.notifier),
      new CryptoCompareApi(this.config, this.logger),
      new CoingeckoApi(this.config, this.logger, this.notifier),
    ];

    this.sourceCount = this.getEnabledSources().length;
  }

  getSources() {
    return this.sources;
  }

  getEnabledSources() {
    return this.sources.filter((source) => source.enabled);
  }

  getSourceWeights() {
    const weights: Record<string, number> = {};

    for (const source of this.getEnabledSources()) {
      weights[source.resourceName] = source.weight;
    }

    return weights;
  }

  /**
   * Awaits completion of initialization for all enabled sources.
   */
  async prepareSources() {
    return Promise.all(this.getEnabledSources().map((source) => source.ready));
  }

  /**
   * Discovers enabled coins across all sources and tracks provider coverage per pair.
   *
   * Coverage is capped at `minSources`, which makes the recorded value the *effective*
   * threshold for the pair rather than the configured one: `min(minSources, coverage)`.
   * A pair advertised by a single source is therefore still served from that one quote,
   * and `warnInsufficiency` reports every pair that falls short of the configured value.
   */
  async getEnabledCoins() {
    await this.prepareSources();

    const enabledSources = this.getEnabledSources();
    const mappings = (this.config.get('mappings') as Record<string, string>) || {};

    const coins = new Set<string>();
    this.sourcePairRecord = {};

    for (const source of enabledSources) {
      const sourceCoins = new Set(
        [...source.enabledCoins].map((enabledCoin) =>
          Object.hasOwn(mappings, enabledCoin) ? mappings[enabledCoin] : enabledCoin,
        ),
      );

      sourceCoins.forEach((baseCoin) => {
        if (baseCoin !== 'USD') {
          const pairName = `${baseCoin}/USD`;
          this.sourcePairRecord[pairName] = Math.min(
            (this.sourcePairRecord[pairName] || 0) + 1,
            this.minSources,
          );

          coins.add(baseCoin);
        }
      });
    }

    this.warnInsufficiency();

    this.allCoins = [...coins];
  }

  /**
   * Logs a warning if any pairs have fewer enabled sources than the minSources threshold.
   */
  warnInsufficiency() {
    const pairsWithLowSourceCount: Array<[string, number]> = [];

    for (const [pairName, sourceCount] of Object.entries(this.sourcePairRecord)) {
      if (sourceCount < this.minSources) {
        pairsWithLowSourceCount.push([pairName, sourceCount]);
      }
    }
    if (pairsWithLowSourceCount.length) {
      this.logger.warn(
        `The following pairs have fewer enabled sources than the configured minimum (minSources=${
          this.minSources
        }), but they are going to be saved anyway: ${pairsWithLowSourceCount
          .map(([pairName, sourceCount]) => `${pairName} (${sourceCount})`)
          .join(', ')}`,
      );
    }
  }

  /**
   * Emits a warning when configured base coins are not provided by any active rate source.
   */
  warnUnavailableBaseCoins() {
    const mappings = (this.config.get('mappings') as Record<string, string>) || {};
    const baseCoins = ((this.config.get('base_coins') as string[]) || []).map((coin) =>
      Object.hasOwn(mappings, coin) ? mappings[coin] : coin,
    );

    const unavailableBaseCoins = baseCoins.filter(
      (coin) => coin !== 'USD' && !this.allCoins.includes(coin),
    );

    if (unavailableBaseCoins.length) {
      this.logger.warn(
        `No resources provide rates for the following base coins: ${unavailableBaseCoins.join(', ')}. As a result, the rates for these base coins will NOT be saved.`,
      );
    }
  }
}
