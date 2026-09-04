import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import JSON5 from 'json5';

import { schema } from './schema';

/**
 * The configuration shipped by Currencyinfo v1
 * (https://github.com/Adamant-im/adamant-currencyinfo-services/blob/master/config.json),
 * trimmed to the fields `scripts/migrate.mjs` reads.
 *
 * Note `crypto_cmc_coinids: []`: v1 shipped an array as the default of a field whose real value
 * is a record, which is why the migration guards field types rather than copying them verbatim.
 */
const v1Config = {
  crypto_cmc: ['BTC', 'ETH', 'DASH', 'DOGE', 'USDT', 'LTC', 'TRX', 'ADM'],
  crypto_cmc_coinids: [],
  crypto_cc: ['BTC', 'ETH', 'DASH', 'DOGE', 'USDT', 'LTC', 'TRX', 'ADM'],
  crypto_cg: [],
  crypto_cg_coinids: ['bitcoin', 'ethereum', 'dash', 'dogecoin', 'adamant-messenger'],
  baseCoins: ['USD', 'RUB', 'EUR', 'CNY', 'JPY', 'BTC', 'ETH'],
  fiat: {
    'USD/RUB': 'USDRUB_TOM',
    'EUR/RUB': 'EURRUB_TOM',
    'CNY/RUB': 'CNYRUB_TOM',
  },
  decimals: 12,
  rateDifferencePercentThreshold: 25,
  cmcApiKey: 'Put yours Coinmarketcap API key',
  ccApiKey: 'Put yours CryptoCompare API key',
  cgApiKey: 'No need for Coingecko API key',
  port: 36668,
  refreshInterval: 10,
  slack: ['https://hooks.slack.com/services/..'],
  log_level: 'log',
};

/**
 * Runs the migration script over a v1 configuration in a temporary directory.
 *
 * @param config - v1 configuration object to migrate
 * @returns The parsed migrated configuration and the script's combined stdout and stderr; the
 *    upgrade guidance is emitted through `console.warn`, so stderr has to be captured too
 */
function migrate(config: Record<string, unknown>) {
  const directory = mkdtempSync(join(tmpdir(), 'currencyinfo-migrate-'));
  const configPath = join(directory, 'config.json');

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  try {
    const run = spawnSync('node', ['scripts/migrate.mjs', configPath], {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

    expect(run.status).toBe(0);

    return {
      migrated: JSON5.parse(readFileSync(`${configPath}c`, 'utf-8')),
      output: `${run.stdout}${run.stderr}`,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('scripts/migrate.mjs', () => {
  it('should migrate the stock v1 configuration into one the schema accepts', () => {
    const { migrated } = migrate(v1Config);
    const result = schema.safeParse(migrated);

    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('should carry the v1 MOEX securities over and keep the source enabled', () => {
    const { migrated } = migrate(v1Config);

    expect(migrated.moex.enabled).toBe(true);
    expect(migrated.moex.codes).toEqual(v1Config.fiat);
  });

  it('should adopt the new keyless sources and the reworked priorities', () => {
    const { migrated } = migrate(v1Config);

    expect({
      coinpaprika: migrated.coinpaprika.enabled,
      coinlore: migrated.coinlore.enabled,
      binance: migrated.binance.enabled,
      exchange_rate_api: migrated.exchange_rate_api.enabled,
    }).toEqual({ coinpaprika: true, coinlore: true, binance: true, exchange_rate_api: true });
    expect(migrated.priorities).not.toContain('CryptoCompare');
  });

  it('should not enable a source whose key the v1 configuration never held', () => {
    // v1 shipped placeholder strings for the keys, and `cgApiKey` explicitly meant "not needed".
    const { migrated, output } = migrate({ ...v1Config, cmcApiKey: '', ccApiKey: '' });

    expect(migrated.coinmarketcap.enabled).toBe(false);
    expect(migrated.cryptocompare.enabled).toBe(false);
    expect(migrated.coingecko.enabled).toBe(false);
    expect(schema.safeParse(migrated).success).toBe(true);
    expect(output).toContain('CryptoCompare');
    expect(output).toContain('CoinGecko');
    expect(output).toContain('CoinMarketCap');
  });

  it('should not treat the v1 placeholder keys as real credentials', () => {
    // The stock v1 template ships prose in these fields; copying it across would produce an
    // enabled source that answers 401 on every cycle, or a configuration that fails to start.
    const { migrated } = migrate(v1Config);

    expect(migrated.coinmarketcap.enabled).toBe(false);
    expect(migrated.cryptocompare.enabled).toBe(false);
    expect(schema.safeParse(migrated).success).toBe(true);
  });

  it('should keep a CryptoCompare subscriber running and point at the dropped priority', () => {
    const { migrated, output } = migrate({ ...v1Config, ccApiKey: 'coindesk-data-key' });

    expect(migrated.cryptocompare.enabled).toBe(true);
    expect(migrated.cryptocompare.api_key).toBe('coindesk-data-key');
    expect(schema.safeParse(migrated).success).toBe(true);
    expect(output).toContain('priorities');
  });

  it('should honour skipApi from the v1 configuration', () => {
    const { migrated } = migrate({
      ...v1Config,
      skipApi: { CryptoCompare: true, CoinMarketCap: true, CoinGecko: true, MOEX: true },
    });

    expect(migrated.moex.enabled).toBe(false);
    expect(migrated.cryptocompare.enabled).toBe(false);
    expect(migrated.coinmarketcap.enabled).toBe(false);
    expect(schema.safeParse(migrated).success).toBe(true);
  });

  it('should still produce a startable configuration when the v1 fiat field is unusable', () => {
    // `moex` is not a partial block, so copying a missing or wrongly typed `fiat` across would
    // yield a configuration that fails validation on the first start.
    for (const fiat of [undefined, [], 'USD/RUB']) {
      const { migrated, output } = migrate({ ...v1Config, fiat });

      expect(migrated.moex.enabled).toBe(false);
      expect(schema.safeParse(migrated).success).toBe(true);
      expect(output).toContain('moex.codes');
    }
  });
});
