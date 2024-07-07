import { z } from 'zod';
import { coinList, positiveNumber } from 'src/shared/schema-types';

export const getRatesSchema = z.object({
  rateLifetime: positiveNumber.optional(),
  coin: coinList.optional(),
});

export type GetRatesDto = z.infer<typeof getRatesSchema>;
