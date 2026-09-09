import { getRatesSchema } from './getRates.schema';

describe('getRatesSchema', () => {
  it('should normalize valid query parameters', () => {
    expect(getRatesSchema.parse({ coin: 'adm,btc', rateLifetime: '30' })).toEqual({
      coin: ['ADM', 'BTC'],
      rateLifetime: 30,
    });
  });

  it('should reject unknown and ambiguous query parameters', () => {
    expect(getRatesSchema.safeParse({ coin: 'ADM', unknown: 'value' }).success).toBe(false);
    expect(getRatesSchema.safeParse({ coin: ['ADM', 'BTC'] }).success).toBe(false);
  });
});
