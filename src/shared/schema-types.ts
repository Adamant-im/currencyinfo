import { z } from 'zod';

const coinNameRegexPattern = '[\\$a-zA-Z0-9]+';

const coinRegex = new RegExp(`^${coinNameRegexPattern}$`);
const coinPairRegex = new RegExp(`^(${coinNameRegexPattern})?/(${coinNameRegexPattern})?$`);
const coinListRegex = new RegExp(`^${coinNameRegexPattern}(?:,${coinNameRegexPattern})*$`);

/**
 * Zod schema for validating and normalizing single coin symbols (e.g. "BTC", "ADM").
 * Transforms output to uppercase.
 */
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

/**
 * Zod schema for validating and normalizing currency pair strings (e.g. "ADM/USD", "BTC/USD").
 * Transforms output to uppercase.
 */
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

/**
 * Zod schema matching either a coin symbol or a currency pair.
 */
export const coinNameOrPair = coinName.or(coinPair);

/**
 * Zod schema for validating comma-separated lists of coin symbols (e.g. "BTC,ETH,ADM").
 * Transforms output to an array of uppercase coin symbols.
 */
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

/**
 * Zod schema for coercing and validating non-negative numeric values (>= 0).
 */
export const nonnegativeNumber = z.coerce.number().nonnegative();

/**
 * Zod schema for coercing and validating strictly positive numeric values (> 0).
 */
export const positiveNumber = z.coerce.number().positive();
