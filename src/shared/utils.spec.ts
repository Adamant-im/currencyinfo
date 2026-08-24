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

    it('should redact Bearer authorization tokens', () => {
      expect(sanitizeErrorMessage('Authorization: Bearer secret_token_12345')).toBe(
        'Authorization: Bearer ***',
      );
    });

    it('should redact query string credentials', () => {
      expect(
        sanitizeErrorMessage('https://api.exchangerate.host/live?access_key=SECRET_KEY&format=1'),
      ).toBe('https://api.exchangerate.host/live?access_key=***&format=1');
      expect(
        sanitizeErrorMessage('https://api.cryptocompare.com/data/price?api_key=SECRET_CC&fsym=BTC'),
      ).toBe('https://api.cryptocompare.com/data/price?api_key=***&fsym=BTC');
    });

    it('should redact JSON property values', () => {
      expect(
        sanitizeErrorMessage(
          'Request failed with params: {"access_key":"SECRET_VAL","pair":"BTC/USD"}',
        ),
      ).toBe('Request failed with params: {"access_key":"***","pair":"BTC/USD"}');
    });

    it('should redact unstructured key-value pairs', () => {
      expect(sanitizeErrorMessage('Error with password=VERY_SECRET and key: MY_KEY')).toBe(
        'Error with password=*** and key: ***',
      );
    });
  });

  describe('sanitizeParams', () => {
    it('should deeply sanitize sensitive keys in nested objects and arrays', () => {
      const input = {
        symbol: 'BTC',
        api_key: 'SECRET_API_KEY',
        nested: {
          access_key: 'ANOTHER_SECRET',
          safeField: 123,
        },
        list: [{ token: 'SECRET_TOKEN' }, { name: 'safe' }],
      };

      expect(sanitizeParams(input)).toEqual({
        symbol: 'BTC',
        api_key: '***',
        nested: {
          access_key: '***',
          safeField: 123,
        },
        list: [{ token: '***' }, { name: 'safe' }],
      });
    });

    it('should return primitive values unchanged', () => {
      expect(sanitizeParams('string')).toBe('string');
      expect(sanitizeParams(123)).toBe(123);
      expect(sanitizeParams(null)).toBe(null);
    });
  });
});
