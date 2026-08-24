import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Logger } from 'src/global/logger/logger.service';
import { Notifier } from 'src/global/notifier/notifier.service';

import { CoinIdFetcher } from './coin-id-fetcher';
import { Tickers } from './dto/tickers.dto';

export interface CoingeckoCoinDto {
  symbol: string;
  id: string;
}

export interface CoingeckoCoin {
  symbol: string;
  cg_id: string;
}

/**
 * CoinGecko API provider connector.
 */
export class CoingeckoApi extends CoinIdFetcher {
  static resourceName = 'Coingecko';

  public ready: Promise<void>;

  public enabledCoins: Set<string> = new Set();
  private coins: CoingeckoCoin[] = [];

  public enabled: boolean;
  public weight: number;

  constructor(
    private config: ConfigService,
    private logger: Logger,
    private notifier: Notifier,
  ) {
    super(logger, notifier);

    this.enabled =
      this.config.get('coingecko.enabled') !== false &&
      !!(
        this.config.get<string[]>('coingecko.coins')?.length ||
        this.config.get<string[]>('coingecko.ids')?.length
      );
    this.weight = this.config.get<number>('coingecko.weight') ?? 10;

    this.ready = this.fetchCoinIds();
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    await this.ready;

    const coinIds = this.coins.map(({ cg_id }) => cg_id);

    if (!coinIds.length) {
      return {};
    }

    const params = {
      ids: coinIds.join(','),
      vs_currencies: baseCurrency,
    };

    const url = 'https://api.coingecko.com/api/v3/simple/price';
    const decimals = this.config.get<number>('decimals') ?? 12;

    const { data } = await axios.get(url, {
      params,
      timeout: 10000,
    });

    const exchangeRates: Record<string, number> = {};
    const coingeckoBaseCoin = baseCurrency.toLowerCase();

    this.coins?.forEach(({ symbol, cg_id }) => {
      const rate = data[cg_id]?.[coingeckoBaseCoin];

      if (!rate) {
        return this.logger.warn(`Unable to get rates for ${this.resourceName} ID '${cg_id}'`);
      }

      exchangeRates[`${symbol}/${baseCurrency}`] = +rate.toFixed(decimals);
    });

    this.logger.info(`${this.resourceName} rates updated against ${baseCurrency} successfully.`);

    return exchangeRates;
  }

  async getCoinIds() {
    if (!this.enabled) {
      return;
    }

    this.coins = [];

    const coinsListUrl = 'https://api.coingecko.com/api/v3/coins/list';
    const { data } = await axios.get<CoingeckoCoinDto[]>(coinsListUrl, { timeout: 15000 });

    const coins = this.config.get<string[]>('coingecko.coins');

    coins?.forEach((symbol) => {
      const coin = data.find((item) => item.symbol === symbol.toLowerCase());

      if (!coin) {
        return this.notifier.notify(
          'warn',
          `Unable to get ticker for ${this.resourceName} symbol '${symbol}'. Check if the coin exists: ${coinsListUrl}.`,
        );
      }

      this.coins.push({
        symbol: symbol.toUpperCase(),
        cg_id: coin.id,
      });
    });

    const coinIds = this.config.get<string[]>('coingecko.ids');

    coinIds?.forEach((id) => {
      const coin = data.find((item) => item.id === id);

      if (!coin?.symbol) {
        return this.notifier.notify(
          'warn',
          `Unable to get ticker for ${this.resourceName} id '${id}'. Check if the coin exists: ${coinsListUrl}.`,
        );
      }

      this.coins.push({
        symbol: coin.symbol.toUpperCase(),
        cg_id: id,
      });
    });

    if (!this.coins.length) {
      this.logger.error(`Could not fetch coin list for ${this.resourceName}.`);
      this.notifier.notify(
        'error',
        `Could not fetch coin list for ${this.resourceName}. Rates from this source will be unavailable.`,
      );
      return;
    }

    this.enabledCoins = new Set(this.coins.map(({ symbol }) => symbol));
    this.logger.info(`${this.resourceName} coin IDs fetched successfully.`);
  }
}
