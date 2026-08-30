import {
  coinList,
  coinName,
  coinNameOrPair,
  coinPair,
  completeCoinPair,
  nonnegativeInteger,
  nonnegativeNumber,
  positiveInteger,
  positiveNumber,
} from './schema-types';

describe('Shared Schema Types', () => {
  describe('coinName', () => {
    it('should accept valid coin names and transform to uppercase', () => {
      const btc = coinName.safeParse('btc');
      expect(btc.success).toBe(true);
      if (btc.success) {
        expect(btc.data).toBe('BTC');
      }
      expect(coinName.safeParse('ETH').success).toBe(true);
      expect(coinName.safeParse('ADM').success).toBe(true);
    });

    it('should reject coin names with invalid chars', () => {
      expect(coinName.safeParse('').success).toBe(false);
      expect(coinName.safeParse('BTC-USD').success).toBe(false);
      expect(coinName.safeParse('BTC/USD').success).toBe(false);
    });
  });

  describe('coinPair', () => {
    it('should accept valid coin pairs in BASE/QUOTE format', () => {
      const pair = coinPair.safeParse('btc/usd');
      expect(pair.success).toBe(true);
      if (pair.success) {
        expect(pair.data).toBe('BTC/USD');
      }
    });

    it('should accept partial pairs with slash for filtering', () => {
      expect(coinPair.safeParse('BTC/').success).toBe(true);
      expect(coinPair.safeParse('/USD').success).toBe(true);
    });

    it('should reject invalid coin pairs without slash or with multiple slashes', () => {
      expect(coinPair.safeParse('BTC').success).toBe(false);
      expect(coinPair.safeParse('BTC/USD/EUR').success).toBe(false);
      expect(coinPair.safeParse('/').success).toBe(false);
    });
  });

  describe('completeCoinPair', () => {
    it('should accept and normalize complete pairs only', () => {
      expect(completeCoinPair.safeParse('btc/usd').data).toBe('BTC/USD');
      expect(completeCoinPair.safeParse('BTC/').success).toBe(false);
      expect(completeCoinPair.safeParse('/USD').success).toBe(false);
      expect(completeCoinPair.safeParse('/').success).toBe(false);
    });
  });

  describe('coinNameOrPair', () => {
    it('should accept either coin symbol or pair', () => {
      expect(coinNameOrPair.safeParse('BTC').success).toBe(true);
      expect(coinNameOrPair.safeParse('BTC/USD').success).toBe(true);
      expect(coinNameOrPair.safeParse('ADM').success).toBe(true);
    });

    it('should reject invalid input', () => {
      expect(coinNameOrPair.safeParse('').success).toBe(false);
      expect(coinNameOrPair.safeParse('BTC//USD').success).toBe(false);
    });
  });

  describe('coinList', () => {
    it('should parse comma-separated string into uppercase coin array', () => {
      const result = coinList.safeParse('BTC,ETH,ADM');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(['BTC', 'ETH', 'ADM']);
      }
    });

    it('should reject invalid list with special characters', () => {
      expect(coinList.safeParse('btc!eth').success).toBe(false);
      expect(coinList.safeParse('').success).toBe(false);
    });
  });

  describe('positiveNumber', () => {
    it('should coerce valid numeric strings and numbers', () => {
      expect(positiveNumber.safeParse('10').data).toBe(10);
      expect(positiveNumber.safeParse(5).data).toBe(5);
      expect(positiveNumber.safeParse('0.5').data).toBe(0.5);
    });

    it('should reject zero or negative values', () => {
      expect(positiveNumber.safeParse(0).success).toBe(false);
      expect(positiveNumber.safeParse(-5).success).toBe(false);
      expect(positiveNumber.safeParse('abc').success).toBe(false);
    });
  });

  describe('nonnegativeNumber', () => {
    it('should accept zero and positive values', () => {
      expect(nonnegativeNumber.safeParse(0).data).toBe(0);
      expect(nonnegativeNumber.safeParse('0').data).toBe(0);
      expect(nonnegativeNumber.safeParse(100).data).toBe(100);
    });

    it('should reject negative values', () => {
      expect(nonnegativeNumber.safeParse(-1).success).toBe(false);
      expect(nonnegativeNumber.safeParse('-10').success).toBe(false);
    });
  });

  describe('integer schemas', () => {
    it('should accept integer strings and reject fractional values', () => {
      expect(nonnegativeInteger.safeParse('0').data).toBe(0);
      expect(nonnegativeInteger.safeParse('10').data).toBe(10);
      expect(nonnegativeInteger.safeParse('0.5').success).toBe(false);

      expect(positiveInteger.safeParse('10').data).toBe(10);
      expect(positiveInteger.safeParse(0).success).toBe(false);
      expect(positiveInteger.safeParse('1.5').success).toBe(false);
    });
  });
});
