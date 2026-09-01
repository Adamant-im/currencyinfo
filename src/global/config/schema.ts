import { z } from 'zod';
import { coinName } from 'src/shared/schema-types';

const percentage = z.number().min(0).max(200);

/**
 * Optional secret that treats an empty or whitespace-only value as omitted.
 *
 * Currencyinfo v1 used `""` to mean "no key", and `scripts/migrate.mjs` copies
 * `cmcApiKey` / `ccApiKey` across verbatim, so rejecting the empty string here
 * would fail closed on upgrade before `superRefine` can decide whether the
 * source actually needs a key.
 */
const optionalSecret = z
  .string()
  .trim()
  .transform((value) => (value.length ? value : undefined));
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
        coins: z.array(coinName),
        ids: z.array(z.string().trim().min(1)),
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

    if (config.cryptocompare?.enabled === true && !config.cryptocompare.coins?.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['cryptocompare', 'coins'],
        message: 'Provide at least one coin when CryptoCompare is enabled',
      });
    }

    if (
      config.coingecko?.enabled === true &&
      !config.coingecko.coins?.length &&
      !config.coingecko.ids?.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['coingecko', 'coins'],
        message: 'Provide at least one coin or ID when CoinGecko is enabled',
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
