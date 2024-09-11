import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { Notifier } from 'src/global/notifier/notifier.service';

import { BaseApi } from './api/base';

import { CurrencyApi } from './api/currencyapi';
import { CoingeckoApi } from './api/coingecko';
import { CryptoCompareApi } from './api/cryptocompare';
import { MoexApi } from './api/moex';
import { CoinmarketcapApi } from './api/coinmarketcap';
import { ExchangeRateHost } from './api/exchangeratehost';

@Injectable()
export class SourcesManager {
  public logger = new Logger();
  public sources: BaseApi[] = [];

  /**
   * List of all enabled coins
   */
  public allCoins: string[] = [];
  /**
   * Represents the amount of enabled sources for a pair name
   * bound to `config.minSources`
   */
  public sourcePairRecord: Record<string, number> = {};
  /**
   * Number of enabled sources
   */
  public sourceCount = 0;

  // parameters from the config
  private minSources: number;

  constructor(
    private config: ConfigService,
    private notifier: Notifier,
  ) {
    this.minSources = config.get('minSources') as number;
  }

  async initialize() {
    this.initializeSources();
    await this.getEnabledCoins();
    this.warnUnavailableBaseCoins();
  }

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
   * Waits for all enabled sources to be ready for getting rates
   */
  async prepareSources() {
    return Promise.all(this.getEnabledSources().map((source) => source.ready));
  }

  /**
   * Counts amount of enabled coins for each pair bound to
   * `config.minSources` and saves list of all coins
   *
   * Warns about coins with fewer enabled sources than the `config.minSources`
   */
  async getEnabledCoins() {
    await this.prepareSources();

    const enabledSources = this.getEnabledSources();

    const mappings = this.config.get('mappings') as Record<string, string>;

    const coins = new Set<string>();

    for (const source of enabledSources) {
      source.enabledCoins.forEach((enabledCoin) => {
        const baseCoin = mappings[enabledCoin] ?? enabledCoin;

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
   * Finds coins with fewer enabled coins than configured minimum and warns about it
   */
  warnInsufficiency() {
    const pairsWithLowSourceCount: Array<[string, number]> = [];

    for (const [pairName, sourceCount] of Object.entries(
      this.sourcePairRecord,
    )) {
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
   * Finds base coins that are not provided in any of the enabled sources
   */
  warnUnavailableBaseCoins() {
    const mappings = this.config.get('mappings') as Record<string, string>;
    const baseCoins = (this.config.get('base_coins') as string[]).map(
      (coin) => mappings[coin] ?? coin,
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
