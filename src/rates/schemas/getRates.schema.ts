import { z } from 'zod';
import { coinList, positiveNumber } from 'src/shared/schema-types';

/**
 * Zod validation schema for `/get` REST endpoint query parameters.
 */
export const getRatesSchema = z
  .object({
    rateLifetime: positiveNumber.optional(),
    coin: coinList.optional(),
  })
  .strict();

export type GetRatesDto = z.infer<typeof getRatesSchema>;
