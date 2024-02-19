import { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import axios from 'axios';

import { Notifier } from 'src/global/notifier/notifier.service';
import { BaseApi } from './base';
import { Tickers } from './dto/tickers.dto';

export interface CoinmarketcapCoin {
  symbol: string;
  cmc_id: string;
}

export interface CoinmarketcapQuote {
  [quote: string]: {
    price: number;
  };
}

export interface CoinmarketcapCoinDto {
  symbol: string;
  id: string;
  quote: CoinmarketcapQuote;
}

export interface CoinmarketcapResponseDto {
  data: CoinmarketcapCoinDto[];
}

/**
 * @docs https://coinmarketcap.com/api/documentation/v1/#operation/getV1CryptocurrencyQuotesLatest
 *
 * @param id One or more comma-separated cryptocurrency CoinMarketCap IDs. Example: 1,2
 *
 * @param slug Alternatively pass a comma-separated list of cryptocurrency slugs. Example: "bitcoin,ethereum"
 *
 * @param symbol Alternatively pass one or more comma-separated cryptocurrency symbols.
 *    Example: "BTC,ETH". At least one "id" or "slug" or "symbol" is required for this request.
 *
 * @param convert Optionally calculate market quotes in up to 120 currencies at once by passing a comma-separated
 *    list of cryptocurrency or fiat currency symbols. Each additional convert option beyond the first
 *    requires an additional call credit. A list of supported fiat options can be found here. Each
 *    conversion is returned in its own "quote" object.
 *
 * @param convert_id Optionally calculate market quotes by CoinMarketCap ID instead of symbol. This option is
 *    identical to convert outside of ID format. Ex: convert_id=1,2781 would replace convert=BTC,USD in
 *    your query. This parameter cannot be used when convert is used.
 *
 * Note: find id on a coin's webpage with "coinId":1027", "200x200/1027.png"
 * Note: find slug in a coin's URL like https://coinmarketcap.com/currencies/bitcoin/
 */
const baseUrl =
  'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

export class CoinmarketcapApi implements BaseApi {
  public name = 'Coinmarketcap';
  public coins: CoinmarketcapCoin[] = [];

  private ready: Promise<void>;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
    private notifier: Notifier,
  ) {
    this.ready = this.getCoinIds();
  }

  async fetch(baseCurrency: string): Promise<Tickers> {
    const enabled = this.config.get<boolean>('coinmarketcap.enabled');
    const apiKey = this.config.get<string>('coinmarketcap.api_key');

    if (enabled === false || !apiKey) {
      return {};
    }

    await this.ready;

    const coinIds = this.coins.map(({ cmc_id }) => cmc_id);

    const url = `${baseUrl}?id=${coinIds.join(',')}&convert=${baseCurrency}`;

    const coins = this.config.get<string[]>('coinmarketcap.coins');

    const { data } = await axios<CoinmarketcapResponseDto>({
      url,
      method: 'get',
      timeout: 10000,
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
      },
    });

    try {
      const decimals = this.config.get<number>('decimals');

      const rates = {};
      const unavailable: string[] = [];

      const coinmarketcapCoins = Object.values(data.data);

      coins?.forEach((symbol) => {
        const coin = coinmarketcapCoins.find(
          (coin) => coin.symbol === symbol.toUpperCase(),
        );

        const price = coin?.quote?.[baseCurrency]?.price;

        if (price) {
          rates[`${symbol}/${baseCurrency}`] = +price.toFixed(decimals);
        } else {
          unavailable.push(symbol);
        }
      });

      if (!unavailable.length) {
        this.logger.log(
          `Coinmarketcap rates updated against ${baseCurrency} successfully`,
        );
      } else if (unavailable.length === coins?.length) {
        this.notifier.notify(
          'error',
          `Unable to get all of ${coins?.length} coin rates from request to ${url}. Check Coinmarketcap service and config file.`,
        );
      } else {
        this.logger.warn(
          `Coinmarketcap rates updated against ${baseCurrency} successfully, except ${unavailable.join(
            ', ',
          )}`,
        );
      }

      return rates;
    } catch (error) {
      throw new Error(
        `Unable to process data ${JSON.stringify(data)} from request to ${url}. Wrong Coinmarketcap API key? Error: ${error}`,
      );
    }
  }

  async getCoinIds() {
    if (!this.config.get('coinmarketcap.enabled')) {
      return;
    }

    this.coins = [];

    const coins = this.config.get<string[]>('coinmarketcap.coins');
    const apiKey = this.config.get<string>('coinmarketcap.api_key');

    const url = `${baseUrl}?symbol=${coins?.join(',')}`;

    const { data } = await axios<CoinmarketcapResponseDto>({
      url,
      method: 'get',
      timeout: 10000,
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
      },
    });

    const coinmarketcapCoins = Object.values(data.data);

    try {
      coins?.forEach((symbol) => {
        const coin = coinmarketcapCoins.find(
          (coin) => coin.symbol === symbol.toUpperCase(),
        );

        if (!coin) {
          return this.notifier.notify(
            'warn',
            `Unable to get ticker for Coinmarketcap symbol '${symbol}'. Check if the coin exists: ${url}.`,
          );
        }

        this.coins.push({
          symbol: symbol.toUpperCase(),
          cmc_id: coin.id,
        });
      });

      const coinIds = this.config.get<string[]>('coinmarketcap.ids');

      if (coinIds) {
        for (const [symbol, id] of Object.entries(coinIds)) {
          this.coins.push({
            symbol: symbol.toUpperCase(),
            cmc_id: id,
          });
        }
      }

      this.logger.log('Coinmarketcap coin ids fetched successfully');
    } catch (error) {
      throw new Error(
        `Unable to process data ${JSON.stringify(
          data,
        )} from request to ${url}. Unable to get Coinmarketcap coin ids. Try to restart InfoService or there will be no rates from Coinmarketcap. Error: ${error}`,
      );
    }
  }
}
