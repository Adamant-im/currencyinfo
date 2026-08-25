import {
  DateFormats,
  calculatePercentageDifference,
  doubleAsterisksToSingle,
  formatDate,
  formatMessageForAdamant,
  formatMessageForDiscord,
  fullTime,
  isNumber,
  isPositiveOrZeroNumber,
  makeBoldForSlack,
  removeMarkdown,
  sanitizeErrorMessage,
  sanitizeParams,
  singleAsteriskToDouble,
} from './utils';

describe('Shared Utils', () => {
  describe('formatDate', () => {
    it('should format date string or timestamp correctly into template', () => {
      const date = new Date(Date.UTC(2026, 7, 23, 14, 30, 45)); // Aug 23, 2026 14:30:45 UTC
      expect(formatDate(DateFormats.YY_MM_DD_HH_MM_SS, date)).toBe('2026-08-23 14:30:45');
      expect(formatDate(DateFormats.HH_MM_SS, date)).toBe('14:30:45');
    });

    it('should provide fullTime string', () => {
      const time = fullTime();
      expect(time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('Markdown formatting utilities', () => {
    it('should remove bold and italic markdown', () => {
      expect(removeMarkdown('**Bold** and *italic* and _italic_')).toBe(
        'Bold and italic and italic',
      );
    });

    it('should convert double asterisks to single', () => {
      expect(doubleAsterisksToSingle('**Bold text**')).toBe('*Bold text*');
    });

    it('should convert single asterisks to double', () => {
      expect(singleAsteriskToDouble('*Bold text*')).toBe('**Bold text**');
    });

    it('should format text bold for Slack', () => {
      expect(makeBoldForSlack('**Important** alert')).toBe('*Important* alert');
    });

    it('should format message for Discord', () => {
      expect(formatMessageForDiscord('*Discord*')).toBe('**Discord**');
    });

    it('should format message for ADAMANT', () => {
      expect(formatMessageForAdamant('**Alert**')).toBe('**Alert**');
    });
  });

  describe('Number validators', () => {
    it('should validate positive or zero numbers', () => {
      expect(isPositiveOrZeroNumber(0)).toBe(true);
      expect(isPositiveOrZeroNumber(42)).toBe(true);
      expect(isPositiveOrZeroNumber(0.001)).toBe(true);
      expect(isPositiveOrZeroNumber(-1)).toBe(false);
      expect(isPositiveOrZeroNumber(NaN)).toBe(false);
      expect(isPositiveOrZeroNumber('100' as any)).toBe(false);
    });

    it('should validate numeric types', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-10)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber(Infinity)).toBe(false);
      expect(isNumber('123' as any)).toBe(false);
      expect(isNumber(null as any)).toBe(false);
    });
  });

  describe('calculatePercentageDifference', () => {
    it('should calculate accurate percentage difference between two numbers', () => {
      expect(calculatePercentageDifference(100, 110)).toBeCloseTo(9.5238, 3);
      expect(calculatePercentageDifference(100, 100)).toBe(0);
      expect(calculatePercentageDifference(100, 200)).toBeCloseTo(66.666, 2);
    });

    it('should return 0 if both values are 0', () => {
      expect(calculatePercentageDifference(0, 0)).toBe(0);
    });

    it('should return 200 if one value is 0 and the other is non-zero', () => {
      expect(calculatePercentageDifference(0, 50)).toBe(200);
      expect(calculatePercentageDifference(50, 0)).toBe(200);
    });
  });

  describe('sanitizeErrorMessage', () => {
    it('should redact URI credentials', () => {
      expect(sanitizeErrorMessage('mongodb://admin:supersecret@127.0.0.1:27017/db')).toBe(
        'mongodb://***:***@127.0.0.1:27017/db',
      );
    });

    it('should redact Bearer and Basic authorization tokens', () => {
      expect(sanitizeErrorMessage('Authorization: Bearer secret_token_12345')).toBe(
        'Authorization: Bearer ***',
      );
      expect(sanitizeErrorMessage('Authorization: Basic dXNlcjpwYXNz')).toBe(
        'Authorization: Basic ***',
      );
      expect(sanitizeErrorMessage('Basic dXNlcjpwYXNz')).toBe('Basic ***');
    });

    it('should redact query string credentials', () => {
      expect(
        sanitizeErrorMessage('https://api.exchangerate.host/live?access_key=SECRET_KEY&format=1'),
      ).toBe('https://api.exchangerate.host/live?access_key=***&format=1');
      expect(
        sanitizeErrorMessage('https://api.cryptocompare.com/data/price?api_key=SECRET_CC&fsym=BTC'),
      ).toBe('https://api.cryptocompare.com/data/price?api_key=***&fsym=BTC');
      expect(sanitizeErrorMessage('https://api.example.com/rates?key=SECRET_KEY&base=USD')).toBe(
        'https://api.example.com/rates?key=***&base=USD',
      );
    });

    it('should redact JSON property values including key', () => {
      expect(
        sanitizeErrorMessage(
          'Request failed with params: {"access_key":"SECRET_VAL","pair":"BTC/USD"}',
        ),
      ).toBe('Request failed with params: {"access_key":"***","pair":"BTC/USD"}');
      expect(sanitizeErrorMessage('{"key": "my-secret-key"}')).toBe('{"key": "***"}');
    });

    it('should redact quoted key-value pairs with spaces, delimiters and passphrases', () => {
      expect(sanitizeErrorMessage('password="secret with spaces"')).toBe('password="***"');
      expect(sanitizeErrorMessage("password='secret with spaces'")).toBe("password='***'");
      expect(sanitizeErrorMessage('password: secret with spaces')).toBe('password: ***');
      expect(sanitizeErrorMessage('password: secret with spaces; port=36661')).toBe(
        'password: ***; port=36661',
      );
      expect(sanitizeErrorMessage('api_key="abc;def"')).toBe('api_key="***"');
      expect(sanitizeErrorMessage('?key=SECRET&b=2')).toBe('?key=***&b=2');
      expect(sanitizeErrorMessage('{"key": "my-secret-key"}')).toBe('{"key": "***"}');
      expect(sanitizeErrorMessage('passphrase: correct horse battery staple')).toBe(
        'passphrase: ***',
      );
      expect(
        sanitizeErrorMessage(
          'passphrase: apple banana cherry dragon elephant fox gorilla hawk iguana jaguar',
        ),
      ).toBe('passphrase: ***');
      expect(sanitizeErrorMessage('passphrase: "apple banana" and port=36661 failed')).toBe(
        'passphrase: "***" and port=36661 failed',
      );
      expect(
        sanitizeErrorMessage('Config error at passphrase: "x"; server.port must be valid'),
      ).toBe('Config error at passphrase: "***"; server.port must be valid');
    });

    it('should redact prefixed secrets including adamantPassphrase, mongoPassword, and slackToken', () => {
      expect(
        sanitizeErrorMessage('adamantPassphrase: apple banana cherry dragon elephant fox'),
      ).toBe('adamantPassphrase: ***');
      expect(sanitizeErrorMessage('"adamantPassphrase": "apple banana cherry dragon"')).toBe(
        '"adamantPassphrase": "***"',
      );
      expect(
        sanitizeErrorMessage('{"notify":{"adamantPassphrase":"apple banana cherry dragon"}}'),
      ).toBe('{"notify":{"adamantPassphrase":"***"}}');
      expect(sanitizeErrorMessage('mongoPassword: supersecret_pw')).toBe('mongoPassword: ***');
      expect(sanitizeErrorMessage('slackToken=xoxb-123456-abcdef')).toBe('slackToken=***');
      expect(
        sanitizeErrorMessage('https://api.example.com/rates?adamantPassphrase=secret123&base=USD'),
      ).toBe('https://api.example.com/rates?adamantPassphrase=***&base=USD');
    });

    it('should not redact harmless diagnostic text containing the word key', () => {
      expect(sanitizeErrorMessage('Unknown key: BTC/USD is not supported')).toBe(
        'Unknown key: BTC/USD is not supported',
      );
      expect(sanitizeErrorMessage('Cache key = rates:USD:BTC could not be resolved')).toBe(
        'Cache key = rates:USD:BTC could not be resolved',
      );
      expect(sanitizeErrorMessage('E11000 duplicate key error collection: tickers')).toBe(
        'E11000 duplicate key error collection: tickers',
      );
      expect(sanitizeErrorMessage('Invalid key: BTC/USD')).toBe('Invalid key: BTC/USD');
      expect(sanitizeErrorMessage('Missing key = coingecko.ids')).toBe(
        'Missing key = coingecko.ids',
      );
      expect(sanitizeErrorMessage('Redis key: rates:latest')).toBe('Redis key: rates:latest');
      expect(sanitizeErrorMessage('primary key: _id')).toBe('primary key: _id');
      expect(sanitizeErrorMessage('Sort key = date')).toBe('Sort key = date');
      expect(sanitizeErrorMessage('Object key: base')).toBe('Object key: base');
    });

    it('should redact multi-word secrets assigned with the equals sign', () => {
      expect(sanitizeErrorMessage('passphrase=apple banana cherry dragon')).toBe('passphrase=***');
      expect(sanitizeErrorMessage('adamantPassphrase=apple banana cherry dragon')).toBe(
        'adamantPassphrase=***',
      );
      expect(sanitizeErrorMessage('password=secret with spaces')).toBe('password=***');
    });

    it('should redact quoted secrets containing escaped quotes', () => {
      expect(sanitizeErrorMessage('password="abc\\"def" tail')).toBe('password="***" tail');
      expect(sanitizeErrorMessage("password='abc\\'def' tail")).toBe("password='***' tail");
      expect(sanitizeErrorMessage('{"password":"abc\\"def"}')).toBe('{"password":"***"}');
    });

    it('should redact secrets in a table-driven contract', () => {
      const mustRedactCases: Array<[string, string]> = [
        ['adamantPassphrase=apple banana cherry', 'adamantPassphrase=***'],
        ['passphrase=apple banana cherry', 'passphrase=***'],
        ['?key=SECRET&a=1', '?key=***&a=1'],
        ['{"key":"SECRET"}', '{"key":"***"}'],
        ['Authorization: Bearer tok123', 'Authorization: Bearer ***'],
        ['mongodb://user:pw@host/db', 'mongodb://***:***@host/db'],
        ['slackToken=xoxb-1', 'slackToken=***'],
        ['api_key=VERY_SECRET', 'api_key=***'],
      ];

      for (const [input, expected] of mustRedactCases) {
        expect(sanitizeErrorMessage(input)).toBe(expected);
      }
    });
  });

  describe('sanitizeParams', () => {
    it('should deeply sanitize sensitive keys in nested objects and arrays', () => {
      const input = {
        symbol: 'BTC',
        api_key: 'SECRET_API_KEY',
        adamantPassphrase: 'passphrase-root',
        nested: {
          access_key: 'ANOTHER_SECRET',
          safeField: 123,
          notify: {
            adamantPassphrase: 'passphrase-nested',
          },
        },
        list: [{ token: 'SECRET_TOKEN' }, { name: 'safe' }],
      };

      expect(sanitizeParams(input)).toEqual({
        symbol: 'BTC',
        api_key: '***',
        adamantPassphrase: '***',
        nested: {
          access_key: '***',
          safeField: 123,
          notify: {
            adamantPassphrase: '***',
          },
        },
        list: [{ token: '***' }, { name: 'safe' }],
      });
    });

    it('should not redact ordinary keys that merely contain sensitive substrings', () => {
      const input = {
        secretary: 'alice',
        tokenomics: 'enabled',
        apiKeyboardLayout: 'qwerty',
        passwordPolicy: 'strong',
        monkey: 'animal',
        keyboard: 'input',
        keystone: 'component',
      };

      expect(sanitizeParams(input)).toEqual({
        secretary: 'alice',
        tokenomics: 'enabled',
        // camelCase suffix "Key" is treated as a sensitive component
        apiKeyboardLayout: 'qwerty'.replace('qwerty', '***'),
        passwordPolicy: 'strong',
        monkey: 'animal',
        keyboard: 'input',
        keystone: 'component',
      });
    });

    it('should return primitive values unchanged', () => {
      expect(sanitizeParams('string')).toBe('string');
      expect(sanitizeParams(123)).toBe(123);
      expect(sanitizeParams(null)).toBe(null);
    });
  });
});
