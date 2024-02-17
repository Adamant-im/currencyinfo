import { z } from 'zod';
import { coinName } from 'src/shared/schema-types';

const positiveNumber = z.union([z.string(), z.number()]).transform((value) => {
  if (typeof value === 'number') {
    return value;
  }

  const parsedValue = parseFloat(value);

  if (isNaN(parsedValue)) {
    throw new Error('Invalid number');
  }

  return parsedValue;
});

export const getHistorySchema = z
  .object({
    timestamp: positiveNumber,
    from: positiveNumber,
    to: positiveNumber,
    limit: positiveNumber,
    coin: coinName,
  })
  .partial()
  .refine((data) => !!Object.values(data).length, {
    message: 'At least one parameter is required',
  });

export type GetHistoryDto = z.infer<typeof getHistorySchema>;
