import fs, { WriteStream } from 'fs';

import { LoggerService } from '@nestjs/common';

import chalk from 'chalk';
import ms from 'ms';

import { DateFormats, formatDate, fullTime } from 'src/shared/utils';
import {
  LogLevel,
  LogLevelChalkColors,
  LogLevelName,
} from './logger.constants';

export class Logger implements LoggerService {
  private logStream: WriteStream;
  private logLevel: LogLevel;

  private previousTime = 0;

  constructor(logLevel: LogLevelName) {
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs');
    }

    this.logStream = fs.createWriteStream(`./logs/${fullTime()}.log`, {
      flags: 'a',
    });

    this.logLevel = LogLevel[logLevel];
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
