import { z } from 'zod';

const coinNameRegexPattern = '[\\$a-zA-Z0-9]+';

const coinRegex = new RegExp(`^${coinNameRegexPattern}$`);
const coinPairRegex = new RegExp(
  `^(${coinNameRegexPattern})?/(${coinNameRegexPattern})?$`,
);
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

export const coinPair = z.string().transform<string>((value, ctx) => {
  if (!value.match(coinPairRegex)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid coin pair',
      fatal: true,
    });

    return '';
  }

  return value.toUpperCase();
});

export const coinNameOrPair = coinName.or(coinPair);

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
