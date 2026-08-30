import { z } from 'zod';
import { coinNameOrPair, nonnegativeInteger, positiveInteger } from 'src/shared/schema-types';

const unixTimestamp = nonnegativeInteger.max(
  Math.floor(Number.MAX_SAFE_INTEGER / 1000),
  'Timestamp is too large',
);

/**
 * Zod validation schema for `/getHistory` REST endpoint query parameters.
 */
export const getHistorySchema = z
  .object({
    timestamp: unixTimestamp,
    from: unixTimestamp,
    to: unixTimestamp,
    limit: positiveInteger,
    coin: coinNameOrPair,
  })
  .partial()
  .strict()
  .refine((data) => !!Object.values(data).length, {
    message: 'At least one parameter is required',
  });

export type GetHistoryDto = z.infer<typeof getHistorySchema>;
