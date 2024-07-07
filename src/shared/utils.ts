export const DateFormats = {
  YY_MM_DD_HH_MM_SS: '{0}-{1}-{2} {3}:{4}:{5}',
  HH_MM_SS: '{3}:{4}:{5}',
};

/**
 * Format the given date using the given template
 *
 * @param template - string with placeholders like `{0}`, `{1}`, etc.
 * @param date - date to format
 */
export function formatDate(template: string, date: Date) {
  const digits = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ].map((num) => String(num).padStart(2, '0'));

  return template.replace(/{(\d)}/g, (_, num) => digits[num]);
}

/**
 * Returns string with current time in format 'yy-mm-dd hh:mm:ss'
 */
export function fullTime() {
  return formatDate(DateFormats.YY_MM_DD_HH_MM_SS, new Date());
}

/**
 * Removes Markdown formatting from the text.
 */
export function removeMarkdown(text: string) {
  return doubleAsterisksToSingle(text).replace(/([_*]\b|\b[_*])/g, '');
}

/**
 * Converts double asterisks to single asterisks.
 */
export function doubleAsterisksToSingle(text: string) {
  return text.replace(/(\*\*\b|\b\*\*)/g, '*');
}

/**
 * Transforms single asterisks to double. Opposite of {@link doubleAsterisksToSingle}
 *
 * @example
 * ```js
 * doubleAsterisksToSingle('**hello world**') // '*hello world*'
 * ```
 */
export function singleAsteriskToDouble(text: string) {
  return text.replace(/(\*\b|\b\*)/g, '**');
}

export function makeBoldForSlack(text: string) {
  return doubleAsterisksToSingle(text);
}

export function formatMessageForDiscord(text: string) {
  return singleAsteriskToDouble(text);
}

export function formatMessageForAdamant(text: string) {
  return singleAsteriskToDouble(doubleAsterisksToSingle(text));
}

export function isPositiveOrZeroNumber(value: number) {
  return isNumber(value) && value >= 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && Number.isFinite(value);
}

export function calculatePercentageDifference(a: number, b: number) {
  return 100 * Math.abs((a - b) / ((a + b) / 2));
}
