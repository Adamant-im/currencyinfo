import chalk from 'chalk';

/**
 * Numeric log levels for severity filtering.
 */
export enum LogLevel {
  log,
  warn,
  error,
}

export type LogLevelName = keyof typeof LogLevel;

/**
 * Terminal color functions mapped to log levels.
 */
export const LogLevelChalkColors = {
  log: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
};
