import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import axios from 'axios';

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

export class CoingeckoApi extends CoinIdFetcher {
  static resourceName = 'Coingecko';

  public coins: CoingeckoCoin[] = [];
  public enabled =
    this.config.get('coingecko.enabled') !== false &&
    !!(
      this.config.get<string[]>('coingecko.coins')?.length ||
      this.config.get<string[]>('coingecko.ids')?.length
    );

  private ready: Promise<void>;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
    private notifier: Notifier,
  ) {
    super(logger);

    this.ready = this.fetchCoinIds();
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    if (!this.enabled) {
      return {};
    }

    await this.ready;

    const coinIds = this.coins.map(({ cg_id }) => cg_id);

    const params = {
      ids: coinIds.join(','),
      vs_currencies: baseCurrency,
    };

    const url = 'https://api.coingecko.com/api/v3/simple/price';

    const decimals = this.config.get('decimals');

    const { data } = await axios.get(url, {
      params,
    });

    const exchangeRates: Record<string, number> = {};

    const coingeckoBaseCoin = baseCurrency.toLowerCase();

    this.coins?.forEach(({ symbol, cg_id }) => {
      const rate = data[cg_id][coingeckoBaseCoin];

      if (!rate) {
        return this.logger.warn(
          `Unable to get rates for ${this.resourceName} id '${cg_id}'`,
        );
      }

      exchangeRates[`${symbol}/${baseCurrency}`] = +rate.toFixed(decimals);
    });

    this.logger.log(
      `${this.resourceName} rates updated against ${baseCurrency} successfully`,
    );

    return exchangeRates;
  }

  async getCoinIds() {
    if (!this.enabled) {
      return;
    }

    this.coins = [];

    const coinsListUrl = 'https://api.coingecko.com/api/v3/coins/list';

    const { data } = await axios.get<CoingeckoCoinDto[]>(coinsListUrl);

    const coins = this.config.get<string[]>('coingecko.coins');

    coins?.forEach((symbol) => {
      const coin = data.find((coin) => coin.symbol === symbol.toLowerCase());

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
      const coin = data.find((coin) => coin.id === id);

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
      this.logger.error(`Could not fetch coin list for ${this.resourceName}`);
      process.exit(-1);
    }

    this.logger.log(`${this.resourceName} coin ids fetched successfully`);
  }
}
