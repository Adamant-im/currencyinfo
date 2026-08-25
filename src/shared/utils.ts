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

/**
 * Sanitizes sensitive URI credentials, Bearer tokens, query parameters, JSON fields,
 * and key-value pairs from error messages and logs.
 *
 * @param text - Raw message or error text
 * @returns Sanitized string with sensitive information redacted
 */
export function sanitizeErrorMessage(text: string): string {
  if (typeof text !== 'string') {
    text = String(text);
  }

  return (
    text
      // 1. URI credentials (e.g. mongodb://user:pass@host)
      .replace(/\/\/[^:]+:[^@]+@/g, '//***:***@')
      // 2. Authorization headers (Bearer, Basic)
      .replace(/\b((?:Authorization:\s*)?(?:Bearer|Basic)\s+)[a-zA-Z0-9_\-.~+/]+=*/gi, '$1***')
      // 3. Query string parameters (e.g. ?api_key=secret, &password=secret, ?adamantPassphrase=secret, ?key=secret)
      .replace(
        /([?&](?:[\w.]*(?:access_key|api_?key|token|secret|passphrase|password)|key)=)[^& "'\s]+/gi,
        '$1***',
      )
      // 4. JSON properties (e.g. "adamantPassphrase": "...", "api_key": "secret", "password": 12345, "key": "val")
      .replace(
        /("(?:\b[\w.]*(?:access_key|api_?key|token|secret|passphrase|password)\b|key)"\s*:\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,{}]+)/gi,
        '$1"***"',
      )
      // 5. Quoted key-value pairs with escaped-quote support (supports spaces, semicolons, etc.)
      .replace(
        /\b([\w.]*(?:access_key|api_?key|token|secret|passphrase|password)\b\s*[:=]\s*)(["'])((?:(?!\2)[^\\]|\\.)*)\2/gi,
        '$1$2***$2',
      )
      // 6. Unquoted multi-word passphrases & passwords (both ':' and '=' separators; stops before ;, }, comma or newline)
      .replace(/\b([\w.]*(?:passphrase|password)\b\s*[:=]\s*)([^"'\s\r\n*][^\r\n,;}{]*)/gi, '$1***')
      // 7. Unquoted single-word key-value pairs for non-multiword secret names (key=value, api_key=value, slackToken: value, etc.)
      .replace(
        /(?<![?&])\b([\w.]*(?:access_key|api_?key|token|secret)\b\s*[:=]\s*)([^"'\s\r\n*][^\s"',;&]*)/gi,
        '$1***',
      )
  );
}

/**
 * Deeply sanitizes sensitive properties from an object (e.g. Axios request params).
 *
 * @param params - Object or array to sanitize
 * @returns Sanitized clone of the input data
 */
export function sanitizeParams(params: unknown): unknown {
  if (!params || typeof params !== 'object') {
    return params;
  }

  if (Array.isArray(params)) {
    return params.map((item) => sanitizeParams(item));
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveComponent =
    /(?:^|[^a-z0-9])(?:access[_-]?key|api[_-]?key|apikey|token|secret|passphrase|password)(?:$|[^a-z0-9])/i;
  const camelCaseSensitive = /(?:(?:access|api)[_-]?key|apikey|passphrase|password|token|secret)$/i;

  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (
      key.toLowerCase() === 'key' ||
      sensitiveComponent.test(key) ||
      camelCaseSensitive.test(key)
    ) {
      sanitized[key] = '***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeParams(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
