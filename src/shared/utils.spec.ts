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
});
