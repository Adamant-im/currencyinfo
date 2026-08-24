import chalkModule from 'chalk';

const chalk = (chalkModule as unknown as { default?: typeof chalkModule }).default || chalkModule;

/**
 * Numeric log levels for severity filtering where error < warn < log < info.
 */
export enum LogLevel {
  none = 0,
  error = 1,
  warn = 2,
  log = 3,
  info = 4,
}

export type LogLevelName = 'error' | 'warn' | 'log' | 'info';

/**
 * Terminal color functions mapped to log levels.
 */
export const LogLevelChalkColors: Record<LogLevelName, (text: string) => string> = {
  info: chalk.green,
  log: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
};
