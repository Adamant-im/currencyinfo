import { z } from 'zod';
import { coinName } from 'src/shared/schema-types';

export const slackWebhookUrl = z.custom<string>(
  (value: unknown) =>
    /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(
      value as string,
    ),
  'Invalid Slack webhook url. The format is `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`. Read more at https://api.slack.com/messaging/webhooks',
);

export const adamantAddress = z.custom<string>(
  (val) => /^U([0-9]{6,21})$/.test(val as string),
  'Invalid ADAMANT address',
);

export const discordWebhookUrl = z.custom<string>(
  (val) =>
    /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+$/.test(
      val as string,
    ),
  'Invalid Discord webhook url. The format is `https://discord.com/api/webhooks/123456789012345678/aBCdeFg9h0iJKl1-_mNoPqRST2uvwXYZ3ab4cDefgH5ijklmnOPQrsTuvWxYZaBC-de_`. Read more at https://discord.com/developers/docs/resources/webhook',
);

const apiSourceSchema = z.object({
  enabled: z.boolean(),
  weight: z.number().optional(),
});

export const schema = z
  .object({
    decimals: z.number().default(12),

    strategy: z.enum(['avg', 'min', 'max', 'priority', 'weight']),

    rateDifferencePercentThreshold: z.number().default(25),
    groupPercentage: z.number(),

    minSources: z.number().default(1),
    priorities: z.array(z.string()),

    refreshInterval: z.number().optional(),
    rateLifetime: z.number(),

    // Server
    server: z.object({
      port: z.number(),
      mongodb: z.object({
        port: z.number(),
        host: z.string(),
        db: z.string(),
      }),
    }),

    // Logging
    notify: z
      .object({
        slack: slackWebhookUrl.array(),
        discord: discordWebhookUrl.array(),
        adamant: adamantAddress.array(),
        adamantPassphrase: z.string().optional(),
      })
      .partial()
      .optional(),
    log_level: z.enum(['none', 'log', 'warn', 'error']).default('log'),

    base_coins: z.array(coinName),

    // API
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
  .strict() /* Throw error on unknown properties. This will help users to migrate from the
   * older versions of the app that use different config schema
   */
  .refine(
    (schema) => !(schema.notify?.adamant && !schema.notify?.adamantPassphrase),
    'Provide passphrase to use ADAMANT notifier',
  );

export type Schema = z.infer<typeof schema>;
