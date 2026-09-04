import { readFileSync } from 'fs';

import JSON5 from 'json5';

import {
  adamantAddress,
  discordWebhookUrl,
  isPlaceholderSecret,
  schema,
  slackWebhookUrl,
} from './schema';

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
        api_key: 'CG-demo-key',
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

    it('should reject unknown properties in nested configuration objects', () => {
      const invalidConfig = {
        ...validConfig,
        server: {
          ...validConfig.server,
          mongodb: {
            ...validConfig.server.mongodb,
            legacyOption: true,
          },
        },
      };

      expect(schema.safeParse(invalidConfig).success).toBe(false);
      expect(
        schema.safeParse({
          ...validConfig,
          currency_api: { enabled: true, url: 'not-a-url', codes: ['USD'] },
        }).success,
      ).toBe(false);
    });

    it.each([
      ['decimals', -1],
      ['decimals', 101],
      ['minSources', 0],
      ['minSources', 1.5],
      ['refreshInterval', 0],
      ['rateLifetime', 0],
      ['rateDifferencePercentThreshold', -1],
      ['groupPercentage', 201],
    ])('should reject unsafe %s value %s', (property, value) => {
      const invalidConfig = {
        ...validConfig,
        [property]: value,
      };

      expect(schema.safeParse(invalidConfig).success).toBe(false);
    });

    it('should reject unsupported protocols for configurable provider URLs', () => {
      const invalidConfig = {
        ...validConfig,
        currency_api: {
          enabled: true,
          url: 'file:///etc/passwd',
          codes: ['USD'],
        },
      };

      expect(schema.safeParse(invalidConfig).success).toBe(false);
    });

    it('should accept zero source weights and reject negative weights and IDs', () => {
      const zeroWeight = {
        ...validConfig,
        coingecko: {
          enabled: true,
          api_key: 'CG-demo-key',
          coins: ['BTC'],
          weight: 0,
        },
      };
      const invalidWeight = {
        ...validConfig,
        coingecko: {
          enabled: true,
          api_key: 'CG-demo-key',
          coins: ['BTC'],
          weight: -1,
        },
      };
      const invalidId = {
        ...validConfig,
        coinmarketcap: {
          enabled: false,
          ids: { BTC: -1 },
        },
      };

      expect(schema.safeParse(zeroWeight).success).toBe(true);
      expect(schema.safeParse(invalidWeight).success).toBe(false);
      expect(schema.safeParse(invalidId).success).toBe(false);
    });

    it('should reject enabled authenticated sources without API keys', () => {
      const invalidExchangeRateHost = {
        ...validConfig,
        exchange_rate_host: {
          enabled: true,
          codes: ['EUR'],
        },
      };
      const invalidCoinMarketCap = {
        ...validConfig,
        coinmarketcap: {
          enabled: true,
          ids: { BTC: 1 },
        },
      };

      expect(schema.safeParse(invalidExchangeRateHost).success).toBe(false);
      expect(schema.safeParse(invalidCoinMarketCap).success).toBe(false);
    });

    it('should treat an empty or blank secret as omitted rather than failing startup', () => {
      // v1 configs and scripts/migrate.mjs write "" to mean "no key".
      expect(
        schema.safeParse({
          ...validConfig,
          exchange_rate_host: { enabled: false, api_key: '', codes: ['USD'] },
        }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          ...validConfig,
          coinmarketcap: { enabled: false, api_key: '   ', coins: ['BTC'] },
        }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          ...validConfig,
          cryptocompare: { enabled: false, api_key: '', coins: ['BTC'] },
        }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          ...validConfig,
          notify: { adamant: [], adamantPassphrase: '' },
        }).success,
      ).toBe(true);
    });

    it('should still require a key when an authenticated source is actually enabled', () => {
      expect(
        schema.safeParse({
          ...validConfig,
          exchange_rate_host: { enabled: true, api_key: '', codes: ['USD'] },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...validConfig,
          notify: { adamant: ['U1234567890'], adamantPassphrase: '  ' },
        }).success,
      ).toBe(false);
    });

    it('should normalize mapping keys so case cannot silently disable a mapping', () => {
      const lowerCaseKey = schema.safeParse({
        ...validConfig,
        mappings: { cwif: '$cwif' },
        base_coins: ['USD', 'CWIF'],
      });
      const upperCaseKey = schema.safeParse({
        ...validConfig,
        mappings: { CWIF: '$CWIF' },
        base_coins: ['USD', 'CWIF'],
      });

      expect(lowerCaseKey.success).toBe(true);
      expect(upperCaseKey.success).toBe(true);

      if (lowerCaseKey.success && upperCaseKey.success) {
        expect(lowerCaseKey.data.mappings).toEqual({ CWIF: '$CWIF' });
        // Both spellings must resolve the base coin identically.
        expect(lowerCaseKey.data.base_coins).toEqual(upperCaseKey.data.base_coins);
        expect(lowerCaseKey.data.base_coins).toContain('$CWIF');
      }
    });

    it('should require an API key for CryptoCompare, whose free tier was retired', () => {
      const withoutApiKey = {
        ...validConfig,
        cryptocompare: {
          enabled: true,
          coins: ['BTC'],
        },
      };
      const withApiKey = {
        ...validConfig,
        cryptocompare: {
          enabled: true,
          api_key: 'coindesk-data-key',
          coins: ['BTC'],
        },
      };
      const disabled = {
        ...validConfig,
        cryptocompare: {
          enabled: false,
          coins: ['BTC'],
        },
      };

      expect(schema.safeParse(withoutApiKey).success).toBe(false);
      expect(schema.safeParse(withApiKey).success).toBe(true);
      expect(schema.safeParse(disabled).success).toBe(true);
    });

    it('should require a Demo API key when CoinGecko is enabled', () => {
      const withoutApiKey = {
        ...validConfig,
        coingecko: {
          enabled: true,
          coins: ['BTC'],
        },
      };
      const disabled = {
        ...validConfig,
        coingecko: {
          enabled: false,
          coins: ['BTC'],
        },
      };

      expect(schema.safeParse(withoutApiKey).success).toBe(false);
      expect(schema.safeParse(disabled).success).toBe(true);
    });

    it('should validate the keyless CoinPaprika block', () => {
      expect(
        schema.safeParse({
          ...validConfig,
          coinpaprika: {
            enabled: true,
            ids: ['btc-bitcoin'],
            bulk_limit: 200,
            max_individual_requests: 5,
          },
        }).success,
      ).toBe(true);
      expect(schema.safeParse({ ...validConfig, coinpaprika: { enabled: true } }).success).toBe(
        false,
      );
      // CoinPaprika caps the ranked response at 2000 rows regardless of a higher limit.
      expect(
        schema.safeParse({
          ...validConfig,
          coinpaprika: { enabled: true, coins: ['BTC'], bulk_limit: 2001 },
        }).success,
      ).toBe(false);
    });

    it('should validate the keyless CoinLore block', () => {
      expect(
        schema.safeParse({
          ...validConfig,
          coinlore: { enabled: true, coins: ['BTC'], ids: { ADM: 33250 } },
        }).success,
      ).toBe(true);
      expect(schema.safeParse({ ...validConfig, coinlore: { enabled: true } }).success).toBe(false);
      expect(
        schema.safeParse({
          ...validConfig,
          coinlore: { enabled: true, ids: { ADM: 0 } },
        }).success,
      ).toBe(false);
    });

    it('should validate the keyless Binance block', () => {
      expect(
        schema.safeParse({
          ...validConfig,
          binance: { enabled: true, quote_asset: 'USDT', coins: ['BTC', 'ETH'] },
        }).success,
      ).toBe(true);
      expect(schema.safeParse({ ...validConfig, binance: { enabled: true } }).success).toBe(false);
      // There is no market of the quote asset against itself.
      expect(
        schema.safeParse({
          ...validConfig,
          binance: { enabled: true, quote_asset: 'USDT', coins: ['BTC', 'USDT'] },
        }).success,
      ).toBe(false);
    });

    it('should validate the keyless ExchangeRate-API block', () => {
      expect(
        schema.safeParse({
          ...validConfig,
          exchange_rate_api: {
            enabled: true,
            url: 'https://open.er-api.com/v6/latest/USD',
            codes: ['USD', 'RUB'],
          },
        }).success,
      ).toBe(true);
      expect(
        schema.safeParse({
          ...validConfig,
          exchange_rate_api: {
            enabled: true,
            url: 'https://open.er-api.com/v6/latest/USD',
            codes: [],
          },
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...validConfig,
          exchange_rate_api: { enabled: true, url: 'file:///etc/passwd', codes: ['USD'] },
        }).success,
      ).toBe(false);
    });

    it('should refuse the shipped placeholder secrets as if no key were configured', () => {
      // Copying config.default.jsonc and flipping `enabled` without replacing the placeholder
      // used to pass validation and then fail on every request with 401.
      const cases = [
        ['coingecko', { enabled: true, api_key: 'Demo API key for CoinGecko', coins: ['BTC'] }],
        [
          'cryptocompare',
          { enabled: true, api_key: 'API key for CoinDesk Data (CryptoCompare)', coins: ['BTC'] },
        ],
        // Superseded template spelling, still carried by upgrading operators.
        ['cryptocompare', { enabled: true, api_key: 'API key for CryptoCompare', coins: ['BTC'] }],
        ['coinmarketcap', { enabled: true, api_key: 'API key for CoinMarketCap', coins: ['BTC'] }],
        [
          'exchange_rate_host',
          { enabled: true, api_key: 'API key for ExchangeRate', codes: ['EUR'] },
        ],
        // Currencyinfo v1 placeholders, copied across verbatim by scripts/migrate.mjs.
        [
          'coinmarketcap',
          { enabled: true, api_key: 'Put yours Coinmarketcap API key', coins: ['BTC'] },
        ],
      ] as const;

      for (const [block, value] of cases) {
        const result = schema.safeParse({ ...validConfig, coingecko: undefined, [block]: value });

        expect([block, result.success]).toEqual([block, false]);
      }
    });

    it('should reject the placeholder passphrase when ADAMANT recipients are configured', () => {
      expect(
        schema.safeParse({
          ...validConfig,
          notify: { adamant: ['U17636520927910270607'], adamantPassphrase: 'apple banana...' },
        }).success,
      ).toBe(false);
    });

    // A placeholder the detector does not know is a placeholder that passes validation and then
    // fails on every request, so the template and the detector have to stay in step.
    it('should recognize every secret shipped in config.default.jsonc as a placeholder', () => {
      const template = JSON5.parse(readFileSync('./config.default.jsonc', 'utf-8'));

      const shipped = {
        'exchange_rate_host.api_key': template.exchange_rate_host?.api_key,
        'coinmarketcap.api_key': template.coinmarketcap?.api_key,
        'cryptocompare.api_key': template.cryptocompare?.api_key,
        'coingecko.api_key': template.coingecko?.api_key,
        'notify.adamantPassphrase': template.notify?.adamantPassphrase,
      };

      for (const [path, secret] of Object.entries(shipped)) {
        expect([path, typeof secret]).toEqual([path, 'string']);
        expect([path, isPlaceholderSecret(secret)]).toEqual([path, true]);
      }
    });

    // `.strict()` rejects unknown fields, so the shipped template and the schema have to be
    // updated together. This test is what makes that requirement enforceable.
    it('should validate the shipped config.default.jsonc template', () => {
      const template = JSON5.parse(readFileSync('./config.default.jsonc', 'utf-8'));

      const result = schema.safeParse(template);

      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
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
