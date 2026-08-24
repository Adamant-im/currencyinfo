import fs, { WriteStream } from 'fs';

import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import chalk from 'chalk';
import ms from 'ms';

import { DateFormats, formatDate, fullTime } from 'src/shared/utils';
import { LogLevel, LogLevelChalkColors, LogLevelName } from './logger.constants';

/**
 * Custom Winston-style logger service supporting console colored output and persistent file logging.
 */
@Injectable()
export class Logger implements LoggerService {
  private logStream: WriteStream;
  private logLevel: LogLevel;
  private previousTime = 0;

  constructor(private config: ConfigService) {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs');
    }

    const safeLogFileName = fullTime().replace(/:/g, '-');
    this.logStream = fs.createWriteStream(`./logs/${safeLogFileName}.log`, {
      flags: 'a',
    });

    const configuredLevel = (this.config.get('log_level') as LogLevelName) || 'log';
    this.logLevel = configuredLevel in LogLevel ? LogLevel[configuredLevel] : LogLevel.log;
  }

  log(message: string) {
    this.logWithLevel('log', message);
  }

  warn(message: string) {
    this.logWithLevel('warn', message);
  }

  error(message: string) {
    this.logWithLevel('error', message);
  }

  fatal(message: string) {
    this.logWithLevel('error', message);
  }

  debug(message: string) {
    this.logWithLevel('log', message);
  }

  verbose(message: string) {
    this.logWithLevel('log', message);
  }

  private logWithLevel(level: LogLevelName, message: string) {
    if (this.logLevel > LogLevel[level]) {
      return;
    }

    const { time, diff } = this.timestamp();
    const space = ' '.repeat('error'.length - level.length);
    const color = LogLevelChalkColors[level];
    const prefix = `${chalk.gray(time)} ${color(level)}${space}|`;

    const colorfulLogMessage = `${prefix} ${message} ${diff}`;
    console.log(colorfulLogMessage.slice(0, 500));

    const fullLogMessage = `${level}${space}|${fullTime()}| ${message}\n`;
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
