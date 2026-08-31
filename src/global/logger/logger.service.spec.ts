import fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { Logger } from './logger.service';

describe('Logger Service', () => {
  let consoleLogSpy: jest.SpyInstance;
  let createWriteStreamSpy: jest.SpyInstance;
  let mkdirSyncSpy: jest.SpyInstance;
  let chmodSyncSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    chmodSyncSpy = jest.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);
    createWriteStreamSpy = jest.spyOn(fs, 'createWriteStream').mockReturnValue({
      write: jest.fn(),
      end: jest.fn(),
    } as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    mkdirSyncSpy.mockRestore();
    chmodSyncSpy.mockRestore();
    createWriteStreamSpy.mockRestore();
  });

  const createLogger = (logLevel: string) => {
    const config = {
      get: jest.fn((key: string) => (key === 'log_level' ? logLevel : undefined)),
    } as unknown as ConfigService;
    return new Logger(config);
  };

  it('should log messages at info level when log_level is info', () => {
    const logger = createLogger('info');
    logger.info('Test info message');
    logger.log('Test log message');
    logger.warn('Test warn message');
    logger.error('Test error message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(4);
  });

  it('should enforce restricted permissions on an existing logs directory', () => {
    createLogger('log');

    expect(mkdirSyncSpy).toHaveBeenCalledWith('./logs', { mode: 0o750, recursive: true });
    expect(chmodSyncSpy).toHaveBeenCalledWith('./logs', 0o750);
  });

  it('should start even when the logs directory permissions cannot be changed', () => {
    chmodSyncSpy.mockImplementation(() => {
      throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
    });

    expect(() => createLogger('log')).not.toThrow();
    expect(createWriteStreamSpy).toHaveBeenCalled();
  });

  it('should filter out info messages when log_level is log', () => {
    const logger = createLogger('log');
    logger.info('Test info message');
    logger.log('Test log message');
    logger.warn('Test warn message');
    logger.error('Test error message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
  });

  it('should filter out log and info messages when log_level is warn', () => {
    const logger = createLogger('warn');
    logger.info('Test info message');
    logger.log('Test log message');
    logger.warn('Test warn message');
    logger.error('Test error message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
  });

  it('should only log error messages when log_level is error', () => {
    const logger = createLogger('error');
    logger.info('Test info message');
    logger.log('Test log message');
    logger.warn('Test warn message');
    logger.error('Test error message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
  });

  it('should not log any messages when log_level is none', () => {
    const logger = createLogger('none');
    logger.info('Test info message');
    logger.log('Test log message');
    logger.warn('Test warn message');
    logger.error('Test error message');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should handle debug, verbose, and fatal methods', () => {
    const logger = createLogger('info');
    logger.debug('Debug message');
    logger.verbose('Verbose message');
    logger.fatal('Fatal error message');

    expect(consoleLogSpy).toHaveBeenCalledTimes(3);
  });

  it('should redact webhook credentials from console and file logs', () => {
    const logger = createLogger('error');
    const write = (createWriteStreamSpy.mock.results[0].value as { write: jest.Mock }).write;
    const secret = 'SECRET_WEBHOOK_TOKEN';

    logger.error(
      `Request to https://hooks.slack.com/services/T00000000/B00000000/${secret} failed`,
    );

    expect(JSON.stringify(consoleLogSpy.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(write.mock.calls)).not.toContain(secret);
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('https://hooks.slack.com/services/***'),
    );
  });
});
