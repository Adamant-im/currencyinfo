import chalk from 'chalk';

export enum LogLevel {
  log = 0,
  info = 1,
  warn = 2,
  error = 3,
}

export type LogLevelName = keyof typeof LogLevel;

export const LogLevelChalkColors = {
  log: chalk.cyan,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
};
