import { z } from 'zod';
import { coinName } from 'src/shared/schema-types';

const percentage = z.number().min(0).max(200);

/**
 * Readable placeholders that ship in `config.default.jsonc` and in the Currencyinfo v1 template.
 *
 * The template has to show operators where each credential goes, so it ships a descriptive
 * placeholder rather than an empty string. Copying the template to `config.jsonc` and switching a
 * source to `"enabled": true` without replacing that placeholder would otherwise pass validation,
 * and the source would fail on every request with `401` instead of failing loudly at startup.
 * Legacy spellings are kept because operators carry them across upgrades and `scripts/migrate.mjs`
 * copies the v1 values over verbatim.
 *
 * Compared case-insensitively against the trimmed value.
 */
const placeholderSecrets = new Set([
  // config.default.jsonc
  'api key for exchangerate',
  'api key for coinmarketcap',
  'api key for coindesk data (cryptocompare)',
  'demo api key for coingecko',
  'apple banana...',
  // Superseded config.default.jsonc spellings
  'api key for cryptocompare',
  // Currencyinfo v1 (Adamant-im/adamant-currencyinfo-services)
  'put yours coinmarketcap api key',
  'put yours cryptocompare api key',
  'no need for coingecko api key',
]);

/**
 * Reports whether a configured secret is one of the shipped placeholders rather than a real one.
 *
 * @param value - Raw configured secret
 * @returns Whether the value is a known placeholder and must be treated as no secret at all
 */
export function isPlaceholderSecret(value: string): boolean {
  return placeholderSecrets.has(value.trim().toLowerCase());
}

/**
 * Optional secret that treats an empty, whitespace-only or placeholder value as omitted.
 *
 * Currencyinfo v1 used `""` to mean "no key", and `scripts/migrate.mjs` copies
 * `cmcApiKey` / `ccApiKey` across verbatim, so rejecting the empty string here
 * would fail closed on upgrade before `superRefine` can decide whether the
 * source actually needs a key.
 */
const optionalSecret = z
  .string()
  .trim()
  .transform((value) => (value.length && !isPlaceholderSecret(value) ? value : undefined));
const httpUrl = z
  .string()
  .url()
  .refine(
    (value) => {
      const url = URL.parse(value);

      return url !== null && ['http:', 'https:'].includes(url.protocol);
    },
    { message: 'Only HTTP and HTTPS URLs are supported' },
  );

/**
 * Zod validation schema for Slack incoming webhook URLs.
 */
export const slackWebhookUrl = z.custom<string>(
  (value: unknown) =>
    /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(
      value as string,
    ),
  'Invalid Slack webhook url. The format is `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`. Read more at https://api.slack.com/messaging/webhooks',
);

/**
 * Zod validation schema for ADAMANT addresses (starts with 'U' followed by 6-21 digits).
 */
export const adamantAddress = z.custom<string>(
  (val) => /^U([0-9]{6,21})$/.test(val as string),
  'Invalid ADAMANT address',
);

/**
 * Zod validation schema for Discord incoming webhook URLs.
 */
export const discordWebhookUrl = z.custom<string>(
  (val) => /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(val as string),
  'Invalid Discord webhook url. The format is `https://discord.com/api/webhooks/123456789012345678/aBCdeFg9h0iJKl1-_mNoPqRST2uvwXYZ3ab4cDefgH5ijklmnOPQrsTuvWxYZaBC-de_`. Read more at https://discord.com/developers/docs/resources/webhook',
);

/**
 * Assets the Binance connector may quote against.
 *
 * The connector serves `<COIN><quote_asset>` markets as `<COIN>/USD` without converting anything,
 * which is only defensible while the quote asset tracks the US dollar. Any other asset turns the
 * substitution into a unit error rather than an approximation: `quote_asset: "BTC"` would serve
 * the real `ETHBTC` price of ~0.03 as `ETH/USD`. Extend this list only with assets pegged to USD.
 */
const binanceUsdQuoteAssets = [
  'USD',
  'USDT',
  'USDC',
  'FDUSD',
  'USD1',
  'USDS',
  'TUSD',
  'USDP',
  'PYUSD',
  'RLUSD',
  'DAI',
  'BUSD',
] as const;

/**
 * Zod validation schema for `binance.quote_asset`, restricted to USD-pegged assets.
 */
const binanceQuoteAsset = coinName.refine(
  (value) => (binanceUsdQuoteAssets as readonly string[]).includes(value),
  {
    message: `Binance rates are served as USD without conversion, so 'quote_asset' must be a USD-pegged asset: ${binanceUsdQuoteAssets.join(', ')}`,
  },
);

/**
 * Common configuration schema for external API rate sources.
 */
const apiSourceSchema = z
  .object({
    enabled: z.boolean(),
    weight: z.number().nonnegative().optional(),
  })
  .strict();

/**
 * Strict Zod schema for Currencyinfo runtime configuration validation.
 */
export const schema = z
  .object({
    name: z.string().default('Currencyinfo'),

    decimals: z.number().int().min(0).max(100).default(12),

    strategy: z.enum(['avg', 'min', 'max', 'priority', 'weight']),

    rateDifferencePercentThreshold: percentage.default(25),
    groupPercentage: percentage,

    minSources: z.number().int().positive().default(1),
    priorities: z.array(z.string()),

    refreshInterval: z.number().positive().optional(),
    rateLifetime: z.number().positive(),

    // Server
    server: z
      .object({
        port: z.number().int().min(0).max(65535).default(36661),
        mongodb: z
          .object({
            port: z.number().int().min(1).max(65535).default(27017),
            host: z.string().trim().min(1).default('127.0.0.1'),
            db: z.string().trim().min(1).default('tickersdb'),
          })
          .strict()
          .default({
            port: 27017,
            host: '127.0.0.1',
            db: 'tickersdb',
          }),
      })
      .strict()
      .default({
        port: 36661,
        mongodb: {
          port: 27017,
          host: '127.0.0.1',
          db: 'tickersdb',
        },
      }),

    // Logging & Notifications
    notify: z
      .object({
        slack: slackWebhookUrl.array(),
        discord: discordWebhookUrl.array(),
        adamant: adamantAddress.array(),
        adamantPassphrase: optionalSecret.optional(),
      })
      .partial()
      .strict()
      .optional(),
    log_level: z.enum(['none', 'error', 'warn', 'log', 'info']).default('log'),

    base_coins: z.array(coinName).min(1),
    // Values are normalized to upper case by `coinName`, and every lookup site matches
    // against already-uppercased symbols, so keys are normalized too. Without this a key
    // differing only in case is a silent no-op that yields entirely different pair names.
    mappings: z
      .record(z.string(), coinName)
      .default({})
      .transform((mappings) =>
        Object.fromEntries(
          Object.entries(mappings).map(([symbol, canonical]) => [symbol.toUpperCase(), canonical]),
        ),
      ),

    // Sources API
    moex: apiSourceSchema
      .extend({
        url: httpUrl,
        codes: z.record(z.string(), z.string()),
      })
      .strict()
      .optional(),

    currency_api: apiSourceSchema
      .extend({
        url: httpUrl,
        codes: z.array(coinName).default([]),
      })
      .strict()
      .optional(),

    // Keyless ExchangeRate-API endpoint (open.er-api.com). Fiat only: crypto codes
    // belong to the crypto sources, which quote them far more frequently.
    exchange_rate_api: apiSourceSchema
      .extend({
        url: httpUrl,
        codes: z.array(coinName).default([]),
      })
      .strict()
      .optional(),

    exchange_rate_host: apiSourceSchema
      .extend({
        api_key: optionalSecret,
        codes: z.array(coinName).default([]),
      })
      .partial()
      .strict()
      .optional(),

    coinmarketcap: apiSourceSchema
      .extend({
        api_key: optionalSecret,
        coins: z.array(coinName),
        ids: z.record(z.string(), z.number().int().positive()),
      })
      .partial()
      .strict()
      .optional(),
    cryptocompare: apiSourceSchema
      .extend({
        api_key: optionalSecret,
        coins: z.array(coinName),
      })
      .partial()
      .strict()
      .optional(),
    coingecko: apiSourceSchema
      .extend({
        api_key: optionalSecret,
        coins: z.array(coinName),
        ids: z.array(z.string().trim().min(1)),
      })
      .partial()
      .strict()
      .optional(),

    coinpaprika: apiSourceSchema
      .extend({
        coins: z.array(coinName),
        ids: z.array(z.string().trim().min(1)),
        // `limit` of the single ranked bulk call. CoinPaprika caps the response at 2000 rows
        // regardless of a higher value, so the schema caps it there too.
        bulk_limit: z.number().int().positive().max(2000),
        // Upper bound on the per-coin fan-out for ids outside the ranked bulk range.
        // The free tier allows 20,000 calls/month, so an unbounded `ids` list would burn it.
        max_individual_requests: z.number().int().nonnegative().max(100),
      })
      .partial()
      .strict()
      .optional(),

    coinlore: apiSourceSchema
      .extend({
        coins: z.array(coinName),
        // Numeric CoinLore ids are reassigned across listings, so they are verified against the
        // symbol the quote carries at runtime rather than trusted outright.
        ids: z.record(z.string(), z.number().int().positive()),
      })
      .partial()
      .strict()
      .optional(),

    binance: apiSourceSchema
      .extend({
        // Binance quotes no direct USD pairs. Rates are requested against this asset and
        // served as USD; see the Binance connector for the depeg trade-off.
        quote_asset: binanceQuoteAsset,
        coins: z.array(coinName),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (schema) =>
      !(
        schema.notify?.adamant &&
        schema.notify.adamant.length > 0 &&
        !schema.notify?.adamantPassphrase?.trim()
      ),
    'Provide passphrase to use ADAMANT notifier',
  )
  .superRefine((config, ctx) => {
    const exchangeRateHostEnabled = config.exchange_rate_host?.enabled !== false;
    if (exchangeRateHostEnabled && config.exchange_rate_host?.codes?.length) {
      if (!config.exchange_rate_host.api_key) {
        ctx.addIssue({
          code: 'custom',
          path: ['exchange_rate_host', 'api_key'],
          message: 'Provide an API key when ExchangeRateHost is enabled',
        });
      }
    } else if (config.exchange_rate_host?.enabled === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['exchange_rate_host', 'codes'],
        message: 'Provide at least one currency code when ExchangeRateHost is enabled',
      });
    }

    const coinmarketcapEnabled = config.coinmarketcap?.enabled !== false;
    const coinmarketcapHasCoins = Boolean(
      config.coinmarketcap?.coins?.length || Object.keys(config.coinmarketcap?.ids || {}).length,
    );
    if (coinmarketcapEnabled && coinmarketcapHasCoins) {
      if (!config.coinmarketcap?.api_key) {
        ctx.addIssue({
          code: 'custom',
          path: ['coinmarketcap', 'api_key'],
          message: 'Provide an API key when CoinMarketCap is enabled',
        });
      }
    } else if (config.coinmarketcap?.enabled === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['coinmarketcap', 'coins'],
        message: 'Provide at least one coin or ID when CoinMarketCap is enabled',
      });
    }

    // CryptoCompare retired its free tier on 21 May 2026 and `min-api.cryptocompare.com`
    // now answers 401 without a subscription, so the key is mandatory rather than optional.
    const cryptocompareEnabled = config.cryptocompare?.enabled !== false;
    if (cryptocompareEnabled && config.cryptocompare?.coins?.length) {
      if (!config.cryptocompare.api_key) {
        ctx.addIssue({
          code: 'custom',
          path: ['cryptocompare', 'api_key'],
          message:
            'Provide a CoinDesk Data (former CryptoCompare) API key when CryptoCompare is enabled. The free tier was retired on 21 May 2026',
        });
      }
    } else if (config.cryptocompare?.enabled === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['cryptocompare', 'coins'],
        message: 'Provide at least one coin when CryptoCompare is enabled',
      });
    }

    // The keyless CoinGecko plan is throttled to 5-15 calls/minute and rate limits
    // unpredictably. The free Demo plan (10,000 calls/month, no credit card) is required
    // instead: https://www.coingecko.com/en/developers/dashboard
    const coingeckoEnabled = config.coingecko?.enabled !== false;
    const coingeckoHasCoins = Boolean(
      config.coingecko?.coins?.length || config.coingecko?.ids?.length,
    );
    if (coingeckoEnabled && coingeckoHasCoins) {
      if (!config.coingecko?.api_key) {
        ctx.addIssue({
          code: 'custom',
          path: ['coingecko', 'api_key'],
          message:
            'Provide a free CoinGecko Demo API key when CoinGecko is enabled. Get one at https://www.coingecko.com/en/developers/dashboard',
        });
      }
    } else if (config.coingecko?.enabled === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['coingecko', 'coins'],
        message: 'Provide at least one coin or ID when CoinGecko is enabled',
      });
    }

    if (
      config.coinpaprika?.enabled === true &&
      !config.coinpaprika.coins?.length &&
      !config.coinpaprika.ids?.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['coinpaprika', 'coins'],
        message: 'Provide at least one coin or ID when CoinPaprika is enabled',
      });
    }

    if (
      config.coinlore?.enabled === true &&
      !config.coinlore.coins?.length &&
      !Object.keys(config.coinlore.ids || {}).length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['coinlore', 'coins'],
        message: 'Provide at least one coin or ID when CoinLore is enabled',
      });
    }

    if (config.binance?.enabled === true && !config.binance.coins?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['binance', 'coins'],
        message: 'Provide at least one coin when Binance is enabled',
      });
    }

    // Binance builds its markets as `<COIN><quote_asset>`, so a coin equal to the quote
    // asset would ask for a market that does not exist (`USDTUSDT`).
    if (config.binance?.quote_asset && config.binance.coins?.includes(config.binance.quote_asset)) {
      ctx.addIssue({
        code: 'custom',
        path: ['binance', 'coins'],
        message: `Remove '${config.binance.quote_asset}' from the Binance coins: it is the configured quote asset and has no market against itself`,
      });
    }

    if (config.exchange_rate_api?.enabled && !config.exchange_rate_api.codes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['exchange_rate_api', 'codes'],
        message: 'Provide at least one currency code when ExchangeRateApi is enabled',
      });
    }

    if (config.currency_api?.enabled && !config.currency_api.codes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['currency_api', 'codes'],
        message: 'Provide at least one currency code when CurrencyApi is enabled',
      });
    }

    if (config.moex?.enabled && !Object.keys(config.moex.codes).length) {
      ctx.addIssue({
        code: 'custom',
        path: ['moex', 'codes'],
        message: 'Provide at least one market code when MOEX is enabled',
      });
    }
  })
  .transform(({ base_coins: baseCoins, ...data }) => ({
    ...data,
    base_coins: baseCoins.map((coin) =>
      Object.hasOwn(data.mappings, coin) ? data.mappings[coin] : coin,
    ),
  }));

export type Schema = z.infer<typeof schema>;
