export const DateFormats = {
  YY_MM_DD_HH_MM_SS: '{0}-{1}-{2} {3}:{4}:{5}',
  HH_MM_SS: '{3}:{4}:{5}',
};

/**
 * Formats a Date object using a template string with placeholders.
 *
 * @param template - Template string with index placeholders like `{0}` (year), `{1}` (month), etc.
 * @param date - Date object to format
 * @returns Formatted date string
 */
export function formatDate(template: string, date: Date): string {
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
 * Returns a formatted string representing the current UTC time in 'YYYY-MM-DD HH:MM:SS' format.
 *
 * @returns Current UTC timestamp string
 */
export function fullTime(): string {
  return formatDate(DateFormats.YY_MM_DD_HH_MM_SS, new Date());
}

/**
 * Removes Markdown formatting characters from a string for plain-text logging.
 *
 * @param text - Input text with possible Markdown characters
 * @returns Plain text stripped of asterisks and underscores
 */
export function removeMarkdown(text: string): string {
  return doubleAsterisksToSingle(text).replace(/([_*]\b|\b[_*])/g, '');
}

/**
 * Converts double asterisks (`**bold**`) to single asterisks (`*bold*`).
 *
 * @param text - Input Markdown text
 * @returns Converted text with single asterisks
 */
export function doubleAsterisksToSingle(text: string): string {
  return text.replace(/(\*\*\b|\b\*\*)/g, '*');
}

/**
 * Converts single asterisks (`*bold*`) to double asterisks (`**bold**`).
 *
 * @example
 * ```js
 * singleAsteriskToDouble('*hello world*') // '**hello world**'
 * ```
 *
 * @param text - Input Markdown text
 * @returns Converted text with double asterisks
 */
export function singleAsteriskToDouble(text: string): string {
  return text.replace(/(\*\b|\b\*)/g, '**');
}

/**
 * Formats text with Slack-compatible bold syntax (single asterisks).
 *
 * @param text - Input message
 * @returns Formatted Slack text
 */
export function makeBoldForSlack(text: string): string {
  return doubleAsterisksToSingle(text);
}

/**
 * Formats text with Discord-compatible bold syntax (double asterisks).
 *
 * @param text - Input message
 * @returns Formatted Discord text
 */
export function formatMessageForDiscord(text: string): string {
  return singleAsteriskToDouble(text);
}

/**
 * Formats text for ADAMANT messenger notification payloads.
 *
 * @param text - Input message
 * @returns Normalized text for ADAMANT messages
 */
export function formatMessageForAdamant(text: string): string {
  return singleAsteriskToDouble(doubleAsterisksToSingle(text));
}

/**
 * Checks whether a value is a valid non-negative number.
 *
 * @param value - Value to check
 * @returns True if value is a finite number and >= 0
 */
export function isPositiveOrZeroNumber(value: number): boolean {
  return isNumber(value) && value >= 0;
}

/**
 * Type guard checking whether a value is a valid finite number (not NaN).
 *
 * @param value - Unknown value
 * @returns True if value is a valid finite number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && Number.isFinite(value);
}

/**
 * Calculates the percentage difference between two numerical values:
 * 100 * |a - b| / ((a + b) / 2)
 *
 * @param a - First value
 * @param b - Second value
 * @returns Percentage difference
 */
export function calculatePercentageDifference(a: number, b: number): number {
  if (a === 0 && b === 0) {
    return 0;
  }
  return 100 * Math.abs((a - b) / ((a + b) / 2));
}
