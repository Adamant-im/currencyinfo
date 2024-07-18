import { z } from 'zod';

const coinNameRegexPattern = '[\\$a-zA-Z0-9]+';

const coinRegex = new RegExp(`^${coinNameRegexPattern}$`);
const coinListRegex = new RegExp(
  `^${coinNameRegexPattern}(?:,${coinNameRegexPattern})*$`,
);

export const coinName = z.string().transform<string>((value, ctx) => {
  if (!value.match(coinRegex)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid coin name',
      fatal: true,
    });

    return '';
  }

  return value.toUpperCase();
});

export const coinList = z.string().transform<string[]>((value, ctx) => {
  if (!value.match(coinListRegex)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid coin name list',
    });

    return [];
  }

  return value.toUpperCase().split(',');
});

export const nonnegativeNumber = z.coerce.number().nonnegative();

export const positiveNumber = z.coerce.number().positive();
