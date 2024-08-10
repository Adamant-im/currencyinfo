import { z } from 'zod';
import {
  coinNameOrPair,
  nonnegativeNumber,
  positiveNumber,
} from 'src/shared/schema-types';

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
