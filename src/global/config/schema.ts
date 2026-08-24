import { z } from 'zod';
import { coinName } from 'src/shared/schema-types';

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
  (val) =>
    /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+$/.test(val as string),
  'Invalid Discord webhook url. The format is `https://discord.com/api/webhooks/123456789012345678/aBCdeFg9h0iJKl1-_mNoPqRST2uvwXYZ3ab4cDefgH5ijklmnOPQrsTuvWxYZaBC-de_`. Read more at https://discord.com/developers/docs/resources/webhook',
);

/**
 * Common configuration schema for external API rate sources.
 */
const apiSourceSchema = z.object({
  enabled: z.boolean(),
  weight: z.number().optional(),
});

/**
 * Strict Zod schema for Currencyinfo runtime configuration validation.
 */
export const schema = z
  .object({
    name: z.string().default('Currencyinfo'),

    decimals: z.number().default(12),

    strategy: z.enum(['avg', 'min', 'max', 'priority', 'weight']),

    rateDifferencePercentThreshold: z.number().default(25),
    groupPercentage: z.number(),

    minSources: z.number().default(1),
    priorities: z.array(z.string()),

    refreshInterval: z.number().optional(),
    rateLifetime: z.number(),

    // Server
    server: z
      .object({
        port: z.number().default(36661),
        mongodb: z
          .object({
            port: z.number().default(27017),
            host: z.string().default('127.0.0.1'),
            db: z.string().default('tickersdb'),
          })
          .default({}),
      })
      .default({}),

    // Logging & Notifications
    notify: z
      .object({
        slack: slackWebhookUrl.array(),
        discord: discordWebhookUrl.array(),
        adamant: adamantAddress.array(),
        adamantPassphrase: z.string().optional(),
      })
      .partial()
      .optional(),
    log_level: z.enum(['none', 'error', 'warn', 'log', 'info']).default('log'),

    base_coins: z.array(coinName),
    mappings: z.record(z.string()).default({}),

    // Sources API
    moex: apiSourceSchema
      .extend({
        url: z.string().url(),
        codes: z.record(z.string()),
      })
      .optional(),

    currency_api: apiSourceSchema
      .extend({
        url: z.string().url(),
        codes: z.array(coinName).default([]),
      })
      .optional(),

    exchange_rate_host: apiSourceSchema
      .extend({
        api_key: z.string(),
        codes: z.array(coinName).default([]),
      })
      .partial()
      .optional(),

    coinmarketcap: apiSourceSchema
      .extend({
        api_key: z.string(),
        coins: z.array(coinName),
        ids: z.record(z.number()),
      })
      .partial()
      .optional(),
    cryptocompare: apiSourceSchema
      .extend({
        api_key: z.string(),
        coins: z.array(coinName),
      })
      .partial()
      .optional(),
    coingecko: apiSourceSchema
      .extend({
        coins: z.array(coinName),
        ids: z.array(z.string()),
      })
      .partial()
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
  .transform(({ base_coins: baseCoins, ...data }) => ({
    ...data,
    base_coins: baseCoins.map((coin) => data.mappings[coin] ?? coin),
  }));

export type Schema = z.infer<typeof schema>;
