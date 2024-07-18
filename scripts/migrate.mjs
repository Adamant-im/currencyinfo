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

  for (const configFilePath of configFiles) {
    const configWithComments = `${configFilePath}c`;

    if (await fileExists(configWithComments)) {
      console.warn(
        `Unable to transform ${configFilePath}, ${configWithComments} already exists.`,
      );
      continue;
    }

    const config = JSON5.parse(await readFile(configFilePath, 'utf-8'));
    const defaultConfig = JSON5.parse(
      await readFile('./config.default.jsonc', 'utf-8'),
    );

    const transformed = transformConfig(config, defaultConfig);

    exchangeRateHostWasEnabled = wasEnabled(config, 'ExchangeRate');

    await writeFile(configWithComments, JSON.stringify(transformed, null, 2));
  }

  if (exchangeRateHostWasEnabled) {
    console.warn(
      'Warning: ExchangeRateHost now requires an API key. Please obtain an API key at https://exchangerate.host/product and update the configuration file to keep getting the rates from the API.',
    );
  }
}

/**
 * Migrate the config object from old version.
 */
function transformConfig(config, defaultConfig) {
  const coinmarketcap = {
    enabled: wasEnabled(config, 'CoinMarketCap'),
    api_key: config.cmcApiKey,
    coins: config.crypto_cmc,
    // The CurrencyInfo v1 config had the wrong type of
    // the default value for `crypto_cmc_coinids`
    ids: Array.isArray(config.crypto_cmc_coinids)
      ? undefined
      : config.crypto_cmc_coinids,
  };

  const cryptocompare = {
    enabled: wasEnabled(config, 'CryptoCompare'),
    api_key: config.ccApiKey,
    coins: config.crypto_cc,
  };

  const coingecko = {
    enabled: wasEnabled(config, 'CoinGecko'),
    coins: config.crypto_cg,
    ids: config.crypto_cg_coinids,
  };

  const moex = {
    enabled: wasEnabled(config, 'MOEX'),
    url: defaultConfig.moex.url,
    codes: config.fiat,
  };

  const notify = config.slack
    ? {
        slack: config.slack.filter(
          (slackWebhook) =>
            slackWebhook !== 'https://hooks.slack.com/services/..',
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
  } catch (error) {
    return false;
  }
}
