import fs, { access, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

import JSON5 from 'json5';

run();

async function run() {
  const configFiles = await findConfigFiles();

  if (!configFiles.length) {
    console.error(
      'No config files were specified. Usage: pnpm run migrate ./path-to-your-config.json',
    );
    process.exit(-1);
  }

  let exchangeRateHostWasEnabled = false;
  let cryptoCompareLostItsKey = false;
  let cryptoCompareKeptItsKey = false;
  let coingeckoWasEnabled = false;
  let coinmarketcapLostItsKey = false;
  let moexLostItsCodes = false;

  for (const configFilePath of configFiles) {
    const configWithComments = `${configFilePath}c`;

    if (await fileExists(configWithComments)) {
      console.warn(`Unable to transform ${configFilePath}, ${configWithComments} already exists.`);
      continue;
    }

    const config = JSON5.parse(await readFile(configFilePath, 'utf-8'));
    const defaultConfig = JSON5.parse(await readFile('./config.default.jsonc', 'utf-8'));

    const transformed = transformConfig(config, defaultConfig);

    exchangeRateHostWasEnabled = wasEnabled(config, 'ExchangeRate');
    cryptoCompareLostItsKey = wasEnabled(config, 'CryptoCompare') && !hasKey(config.ccApiKey);
    cryptoCompareKeptItsKey = wasEnabled(config, 'CryptoCompare') && hasKey(config.ccApiKey);
    coingeckoWasEnabled = wasEnabled(config, 'CoinGecko');
    coinmarketcapLostItsKey = wasEnabled(config, 'CoinMarketCap') && !hasKey(config.cmcApiKey);
    moexLostItsCodes = wasEnabled(config, 'MOEX') && !isRecord(config.fiat);

    await writeFile(configWithComments, JSON.stringify(transformed, null, 2));
  }

  if (exchangeRateHostWasEnabled) {
    console.warn(
      'Warning: ExchangeRateHost now requires an API key. Please obtain an API key at https://exchangerate.host/product and update the configuration file to keep getting the rates from the API.',
    );
  }

  if (cryptoCompareLostItsKey) {
    console.warn(
      'Warning: CryptoCompare (now CoinDesk Data) retired its free API tier on 21 May 2026, and the migrated configuration carries no key, so the source has been disabled. The free CoinPaprika, CoinLore and Binance sources enabled by default cover the same coins. With a CoinDesk Data subscription, set cryptocompare.api_key, set cryptocompare.enabled to true, and add "CryptoCompare" back to priorities.',
    );
  }

  if (cryptoCompareKeptItsKey) {
    console.warn(
      'Warning: CryptoCompare (now CoinDesk Data) is still enabled because the migrated configuration carries an API key, but it has been dropped from the default priorities. Add "CryptoCompare" back to priorities to keep its previous rank under the priority strategy.',
    );
  }

  if (coingeckoWasEnabled) {
    console.warn(
      'Warning: CoinGecko now requires a free Demo API key and has been disabled in the migrated configuration. Obtain one at https://www.coingecko.com/en/developers/dashboard, set coingecko.api_key, and set coingecko.enabled to true.',
    );
  }

  if (coinmarketcapLostItsKey) {
    console.warn(
      'Warning: CoinMarketCap requires an API key and the migrated configuration carries none, so the source has been disabled. Obtain a key at https://coinmarketcap.com/api/, set coinmarketcap.api_key, and set coinmarketcap.enabled to true.',
    );
  }

  if (moexLostItsCodes) {
    console.warn(
      'Warning: the v1 "fiat" field is missing or is not a record of MOEX pairs to security codes, so MOEX has been disabled and moex.codes filled from the template. Restore the pairs in moex.codes and set moex.enabled to true to keep using MOEX.',
    );
  }
}

/**
 * Migrate the config object from old version.
 */
function transformConfig(config, defaultConfig) {
  // CoinMarketCap has always required a key, and the schema refuses to start with an enabled
  // source that carries none. A v1 config that never held a key must therefore migrate onto a
  // disabled source rather than onto one that fails validation on the first start.
  const coinmarketcap = {
    enabled: wasEnabled(config, 'CoinMarketCap') && hasKey(config.cmcApiKey),
    api_key: config.cmcApiKey,
    coins: config.crypto_cmc,
    // The CurrencyInfo v1 config had the wrong type of
    // the default value for `crypto_cmc_coinids`
    ids: Array.isArray(config.crypto_cmc_coinids) ? undefined : config.crypto_cmc_coinids,
  };

  // CryptoCompare retired its free tier on 21 May 2026, so a v1 config that relied on the
  // keyless endpoint must not migrate onto an enabled source that fails every cycle. It stays
  // enabled only for operators who already carry a CoinDesk Data subscription key.
  const cryptocompare = {
    enabled: wasEnabled(config, 'CryptoCompare') && hasKey(config.ccApiKey),
    api_key: config.ccApiKey,
    coins: config.crypto_cc,
  };

  // CoinGecko now needs a free Demo key that v1 configurations never carried, so the migrated
  // source is disabled until the operator adds one.
  const coingecko = {
    enabled: false,
    coins: config.crypto_cg,
    ids: config.crypto_cg_coinids,
  };

  // v1 stores MOEX securities in `fiat` as a record of pairs to security codes
  // ({ "USD/RUB": "USDRUB_TOM" }). The `moex` block is not partial in the v4 schema, so a config
  // that lost the field, or carries the wrong type for it the way v1 shipped `crypto_cmc_coinids`
  // as `[]`, would migrate into a configuration that refuses to start. Fall back to the template
  // codes and leave the source disabled in that case.
  const fiatCodes = isRecord(config.fiat) ? config.fiat : undefined;

  const moex = {
    enabled: wasEnabled(config, 'MOEX') && Boolean(fiatCodes),
    url: defaultConfig.moex.url,
    codes: fiatCodes ?? defaultConfig.moex.codes,
  };

  const notify = config.slack
    ? {
        slack: config.slack.filter(
          (slackWebhook) => slackWebhook !== 'https://hooks.slack.com/services/..',
        ),
      }
    : undefined;

  return {
    ...defaultConfig,
    decimals: config.decimals,
    rateDifferencePercentThreshold: config.rateDifferencePercentThreshold,
    refreshInterval: config.refreshInterval,

    notify,
    log_level: config.log_level,

    moex,
    base_coins: config.baseCoins,

    coinmarketcap,
    cryptocompare,
    coingecko,
  };
}

/**
 * Returns whether a value is a plain object usable as a configuration record.
 *
 * @param value Raw value of a v1 configuration field.
 * @returns Whether the value is a non-null, non-array object.
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Placeholder API keys shipped by the Currencyinfo v1 template.
 *
 * They are prose rather than credentials, so a source configured with one of them must migrate
 * onto a disabled block. Kept in step with `placeholderSecrets` in `src/global/config/schema.ts`,
 * which refuses them again at startup.
 */
const v1PlaceholderKeys = new Set([
  'put yours coinmarketcap api key',
  'put yours cryptocompare api key',
  'no need for coingecko api key',
]);

/**
 * Returns whether a v1 API key is actually usable.
 *
 * Currencyinfo v1 wrote `""` to mean "no key" and shipped descriptive placeholders in its
 * template, and the values are copied across verbatim.
 *
 * @param apiKey Raw value of a v1 API key field.
 * @returns Whether the key carries a real, non-placeholder value.
 */
function hasKey(apiKey) {
  return (
    typeof apiKey === 'string' &&
    apiKey.trim().length > 0 &&
    !v1PlaceholderKeys.has(apiKey.trim().toLowerCase())
  );
}

/**
 * Returns whenever the given API was enabled in old config.
 */
function wasEnabled(config, apiName) {
  if (config.skipApi?.[apiName] === true) {
    return false;
  }

  return true;
}

async function findConfigFiles() {
  const configPaths = process.argv.slice(2).map((path) => resolve(path));

  for (const path of configPaths) {
    if (!(await fileExists(path))) {
      console.error(`Configuration not found at: ${path}`);
      process.exit(-1);
    }
  }

  return configPaths;
}

async function fileExists(pathToFile) {
  try {
    await access(pathToFile, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
