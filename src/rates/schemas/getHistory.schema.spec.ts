import { getHistorySchema } from './getHistory.schema';

describe('getHistorySchema', () => {
  it('should normalize valid historical query parameters', () => {
    expect(getHistorySchema.parse({ coin: 'adm/usd', from: '0', limit: '10' })).toEqual({
      coin: 'ADM/USD',
      from: 0,
      limit: 10,
    });
  });

  it('should accept one-sided time ranges', () => {
    expect(getHistorySchema.safeParse({ from: '100' }).success).toBe(true);
    expect(getHistorySchema.safeParse({ to: '200' }).success).toBe(true);
  });

  it('should reject empty pairs, fractional integers, and unknown parameters', () => {
    expect(getHistorySchema.safeParse({ coin: '/' }).success).toBe(false);
    expect(getHistorySchema.safeParse({ timestamp: '1.5' }).success).toBe(false);
    expect(getHistorySchema.safeParse({ timestamp: Number.MAX_SAFE_INTEGER }).success).toBe(false);
    expect(getHistorySchema.safeParse({ limit: '2.5' }).success).toBe(false);
    expect(getHistorySchema.safeParse({ coin: 'ADM', unknown: 'value' }).success).toBe(false);
  });
});
