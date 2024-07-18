import chalk from 'chalk';

export enum LogLevel {
  log,
  warn,
  error,
}

export type LogLevelName = keyof typeof LogLevel;

export const LogLevelChalkColors = {
  log: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
};
