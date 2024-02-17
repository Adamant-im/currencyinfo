import { z } from 'zod';

export const coinName = z.string().transform((value, ctx) => {
  if (!value.match(/^[a-zA-Z]+$/)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid coin name',
    });

    return z.never;
  }

  return value.toUpperCase();
});
