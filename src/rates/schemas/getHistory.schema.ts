import { z } from 'zod';
import { coinNameOrPair, nonnegativeNumber, positiveNumber } from 'src/shared/schema-types';

/**
 * Zod validation schema for `/getHistory` REST endpoint query parameters.
 */
export const getHistorySchema = z
  .object({
    timestamp: nonnegativeNumber,
    from: nonnegativeNumber,
    to: nonnegativeNumber,
    limit: positiveNumber,
    coin: coinNameOrPair,
  })
  .partial()
  .refine((data) => !!Object.values(data).length, {
    message: 'At least one parameter is required',
  });

export type GetHistoryDto = z.infer<typeof getHistorySchema>;
