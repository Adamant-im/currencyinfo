import { adamantAddress, discordWebhookUrl, schema, slackWebhookUrl } from './schema';

describe('Config Schema Validation', () => {
  describe('slackWebhookUrl', () => {
    it('should validate valid Slack webhook URLs', () => {
      const valid = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX';
      expect(slackWebhookUrl.safeParse(valid).success).toBe(true);
    });

    it('should reject invalid Slack webhook URLs', () => {
      expect(slackWebhookUrl.safeParse('https://slack.com').success).toBe(false);
      expect(slackWebhookUrl.safeParse('not-a-url').success).toBe(false);
    });
  });

  describe('adamantAddress', () => {
    it('should validate valid ADAMANT address', () => {
      expect(adamantAddress.safeParse('U1234567890123456789').success).toBe(true);
      expect(adamantAddress.safeParse('U123456').success).toBe(true);
    });

    it('should reject invalid ADAMANT address', () => {
      expect(adamantAddress.safeParse('123456789').success).toBe(false);
      expect(adamantAddress.safeParse('U123').success).toBe(false);
      expect(adamantAddress.safeParse('A123456789').success).toBe(false);
    });
  });

  describe('discordWebhookUrl', () => {
    it('should validate valid Discord webhook URLs', () => {
      const valid =
        'https://discord.com/api/webhooks/123456789012345678/aBCdeFg9h0iJKl1-_mNoPqRST2uvwXYZ3ab4cDefgH5ijklmnOPQrsTuvWxYZaBC-de_';
      expect(discordWebhookUrl.safeParse(valid).success).toBe(true);
    });

    it('should reject invalid Discord webhook URLs', () => {
      expect(discordWebhookUrl.safeParse('https://discord.com').success).toBe(false);
      expect(discordWebhookUrl.safeParse('invalid').success).toBe(false);
    });
  });

  describe('main configuration schema', () => {
    const validConfig = {
      name: 'Currencyinfo',
      decimals: 12,
      strategy: 'priority' as const,
      rateDifferencePercentThreshold: 25,
      groupPercentage: 60,
      minSources: 1,
      priorities: ['Coinmarketcap', 'Coingecko'],
      rateLifetime: 60,
      base_coins: ['USD', 'BTC', 'ETH', 'ADM'],
      server: {
        port: 36661,
        mongodb: {
          host: '127.0.0.1',
          port: 27017,
          db: 'currencyinfo',
        },
      },
      coingecko: {
        enabled: true,
        coins: ['ADM', 'BTC', 'ETH'],
      },
    };

    it('should validate a valid minimal configuration', () => {
      const result = schema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should accept port 0 for dynamic OS port allocation', () => {
      const configWithPortZero = {
        ...validConfig,
        server: {
          ...validConfig.server,
          port: 0,
        },
      };
      const result = schema.safeParse(configWithPortZero);
      expect(result.success).toBe(true);
    });

    it('should allow empty adamant recipients list without passphrase', () => {
      const configWithEmptyAdamant = {
        ...validConfig,
        notify: {
          adamant: [],
        },
      };
      const result = schema.safeParse(configWithEmptyAdamant);
      expect(result.success).toBe(true);
    });

    it('should require passphrase when adamant recipients are provided', () => {
      const configWithAdamant = {
        ...validConfig,
        notify: {
          adamant: ['U17636520927910270607'],
        },
      };
      const result = schema.safeParse(configWithAdamant);
      expect(result.success).toBe(false);
    });

    it('should accept valid adamant recipients with passphrase', () => {
      const configWithAdamantAndPassphrase = {
        ...validConfig,
        notify: {
          adamant: ['U17636520927910270607'],
          adamantPassphrase: 'apple banana cherry dragon elephant fox gorilla hawk iguana jaguar',
        },
      };
      const result = schema.safeParse(configWithAdamantAndPassphrase);
      expect(result.success).toBe(true);
    });

    it('should reject unknown extra properties due to strict mode', () => {
      const invalidConfig = {
        ...validConfig,
        unknown_legacy_field: true,
      };
      const result = schema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject invalid strategy enum value', () => {
      const invalidConfig = {
        ...validConfig,
        strategy: 'non_existent_strategy',
      };
      const result = schema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });
});
