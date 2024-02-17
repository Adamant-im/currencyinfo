import { coinName } from 'src/shared/schema-types';
import { z } from 'zod';

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
    /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+$/.test(
      val as string,
    ),
  'Invalid Discord webhook url. The format is `https://discord.com/api/webhooks/123456789012345678/aBCdeFg9h0iJKl1-_mNoPqRST2uvwXYZ3ab4cDefgH5ijklmnOPQrsTuvWxYZaBC-de_`. Read more at https://discord.com/developers/docs/resources/webhook',
);

export const schema = z
  .object({
    // Formatting
    decimals: z.number(),

    rateDifferencePercentThreshold: z.number(),
    refreshInterval: z.number().optional(),
    minSources: z.number(),

    // Server
    port: z.number(),

    // Logging
    passphrase: z.string().optional(),
    notify: z
      .object({
        slack: slackWebhookUrl.array().optional(),
        discord: discordWebhookUrl.array().optional(),
        adamant: adamantAddress.array().optional(),
      })
      .optional(),
    log_level: z.enum(['none', 'log', 'info', 'warn', 'error']),

    // API
    moex: z.record(z.string()),
    base_coins: z.array(coinName),

    exchange_rate_host: z
      .object({
        enabled: z.boolean().optional(),
        api_key: z.string(),
      })
      .optional(),

    coinmarketcap: z
      .object({
        enabled: z.boolean().optional(),
        api_key: z.string(),
        coins: z.array(coinName).optional(),
        ids: z.record(z.number()).optional(),
      })
      .optional(),
    cryptocompare: z
      .object({
        enabled: z.boolean().optional(),
        api_key: z.string(),
        coins: z.array(coinName).optional(),
      })
      .optional(),
    coingecko: z
      .object({
        enabled: z.boolean().optional(),
        api_key: z.string(),
        coins: z.array(coinName).optional(),
        ids: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strict(); /* Throw error on unkown properties. This will help users to migrate from the
 * older versions of the app that use different config schema
 */

export type Schema = z.infer<typeof schema>;
