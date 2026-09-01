import { z } from 'zod';

// Symbols an operator may configure. Deliberately narrow, so that typos in
// `base_coins`, source `coins` and `mappings` targets fail at startup.
const coinNameRegexPattern = '[\\$a-zA-Z0-9]+';

// Symbols a rate source may emit. Providers use hyphens, dots, underscores and
// non-ASCII letters, so this is wider than the configurable form. The lookahead
// requires at least one letter or number, which keeps punctuation-only values
// such as `.../...` out of the aggregation pipeline.
const sourceCoinNameRegexPattern = '(?=[^/,]*[\\p{L}\\p{N}])[\\p{L}\\p{N}$._-]{1,64}';

const coinRegex = new RegExp(`^${coinNameRegexPattern}$`);

// Query filters must be able to address every stored pair, so they accept the
// source form rather than the narrower configurable one.
const sourceCoinRegex = new RegExp(`^${sourceCoinNameRegexPattern}$`, 'u');
const coinPairRegex = new RegExp(
  `^(?:${sourceCoinNameRegexPattern}/${sourceCoinNameRegexPattern}|${sourceCoinNameRegexPattern}/|/${sourceCoinNameRegexPattern})$`,
  'u',
);
const completeCoinPairRegex = new RegExp(
  `^${sourceCoinNameRegexPattern}/${sourceCoinNameRegexPattern}$`,
  'u',
);
const coinListRegex = new RegExp(
  `^${sourceCoinNameRegexPattern}(?:,${sourceCoinNameRegexPattern})*$`,
  'u',
);

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
 * Zod schema for complete currency pairs produced by rate sources.
 * Both symbols are required and may contain provider-defined Unicode letters,
 * numbers, dollar signs, dots, underscores, and hyphens.
 */
export const completeCoinPair = z.string().transform<string>((value, ctx) => {
  if (!value.match(completeCoinPairRegex)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid complete coin pair',
      fatal: true,
    });

    return '';
  }

  return value.toUpperCase();
});

/**
 * Zod schema for a single coin symbol used as a query filter.
 * Accepts every symbol a rate source can produce, so any stored pair is addressable.
 */
const sourceCoinName = z.string().transform<string>((value, ctx) => {
  if (!value.match(sourceCoinRegex)) {
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
 * Zod schema matching either a coin symbol or a currency pair.
 */
export const coinNameOrPair = sourceCoinName.or(coinPair);

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

/**
 * Zod schema for coercing and validating non-negative integers.
 */
export const nonnegativeInteger = z.coerce.number().int().nonnegative();

/**
 * Zod schema for coercing and validating strictly positive integers.
 */
export const positiveInteger = z.coerce.number().int().positive();
