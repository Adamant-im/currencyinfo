import fs, { WriteStream } from 'fs';

import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import chalk from 'chalk';
import ms from 'ms';

import { DateFormats, formatDate, fullTime, sanitizeErrorMessage } from 'src/shared/utils';
import { LogLevel, LogLevelChalkColors, LogLevelName } from './logger.constants';

/**
 * Custom Winston-style logger service supporting console colored output and persistent file logging.
 * Filters output based on configured severity: error < warn < log < info.
 */
@Injectable()
export class Logger implements LoggerService {
  private logStream: WriteStream;
  private logLevel: LogLevel;
  private previousTime = 0;

  constructor(private config: ConfigService) {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { mode: 0o750 });
    }

    const safeLogFileName = fullTime().replace(/:/g, '-');
    this.logStream = fs.createWriteStream(`./logs/${safeLogFileName}.log`, {
      flags: 'a',
      mode: 0o600,
    });

    const configuredLevel = (this.config.get('log_level') as keyof typeof LogLevel) || 'log';
    this.logLevel = configuredLevel in LogLevel ? LogLevel[configuredLevel] : LogLevel.log;
  }

  /**
   * Logs an informational milestone event (highest verbosity).
   */
  info(message: string) {
    this.logWithLevel('info', message);
  }

  /**
   * Logs a standard operational event.
   */
  log(message: string) {
    this.logWithLevel('log', message);
  }

  /**
   * Logs a warning event.
   */
  warn(message: string) {
    this.logWithLevel('warn', message);
  }

  /**
   * Logs an error event.
   */
  error(message: string) {
    this.logWithLevel('error', message);
  }

  /**
   * Logs a fatal application error.
   */
  fatal(message: string) {
    this.logWithLevel('error', message);
  }

  /**
   * Logs a debug message mapped to info level.
   */
  debug(message: string) {
    this.logWithLevel('info', message);
  }

  /**
   * Logs a verbose message mapped to info level.
   */
  verbose(message: string) {
    this.logWithLevel('info', message);
  }

  private logWithLevel(level: LogLevelName, message: string) {
    if (LogLevel[level] > this.logLevel) {
      return;
    }

    const sanitizedMessage = sanitizeErrorMessage(String(message));
    const { time, diff } = this.timestamp();
    const space = ' '.repeat('error'.length - level.length);
    const color = LogLevelChalkColors[level];
    const prefix = `${chalk.gray(time)} ${color(level)}${space}|`;

    const colorfulLogMessage = `${prefix} ${sanitizedMessage} ${diff}`;
    console.log(colorfulLogMessage.slice(0, 500));

    const fullLogMessage = `${level}${space}|${fullTime()}| ${sanitizedMessage}\n`;
    this.logStream.write(fullLogMessage);
  }

  private timestamp() {
    const time = formatDate(DateFormats.HH_MM_SS, new Date());
    const currentTime = Date.now();
    let diff = '';

    if (this.previousTime) {
      diff = chalk.green(`+${ms(currentTime - this.previousTime)}`);
    }

    this.previousTime = currentTime;

    return { time, diff };
  }
}
