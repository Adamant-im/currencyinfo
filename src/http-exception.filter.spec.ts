import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ZodError, z } from 'zod';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockHttpAdapter: { reply: jest.Mock };
  let mockArgumentsHost: any;
  let mockResponse: any;

  beforeEach(() => {
    mockHttpAdapter = { reply: jest.fn() };
    const httpAdapterHost = { httpAdapter: mockHttpAdapter } as unknown as HttpAdapterHost;
    filter = new HttpExceptionFilter(httpAdapterHost);

    mockResponse = {};
    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    };
  });

  it('should format ZodError with 400 Bad Request', () => {
    const schema = z.object({ coin: z.string().min(3) });
    let zodError: ZodError;
    try {
      schema.parse({ coin: 'A' });
    } catch (err) {
      zodError = err as ZodError;
    }

    filter.catch(zodError!, mockArgumentsHost);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        success: false,
        msg: expect.any(String),
      }),
      HttpStatus.BAD_REQUEST,
    );
  });

  it('should format HttpException with its own status code', () => {
    const exception = new HttpException('Not Found error', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockArgumentsHost);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        success: false,
        msg: 'Not Found error',
      }),
      HttpStatus.NOT_FOUND,
    );
  });

  it('should format standard Error with 500 and generic message without leaking internals', () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const error = new Error('mongodb://admin:supersecret@127.0.0.1:27017/db connection failed');

    filter.catch(error, mockArgumentsHost);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        success: false,
        msg: 'Something went wrong',
      }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );

    expect(loggerSpy).toHaveBeenCalledWith(expect.not.stringContaining('supersecret'));
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('mongodb://***:***@127.0.0.1:27017/db'),
    );

    loggerSpy.mockRestore();
  });

  it('should redact bearer tokens, basic auth, quoted passwords, and passphrases from unhandled exception logs', () => {
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const error = new Error(
      'Auth failed with Authorization: Basic dXNlcjpwYXNz, password="secret with spaces", and passphrase: apple banana cherry',
    );

    filter.catch(error, mockArgumentsHost);

    expect(loggerSpy).toHaveBeenCalledWith(expect.not.stringContaining('dXNlcjpwYXNz'));
    expect(loggerSpy).toHaveBeenCalledWith(expect.not.stringContaining('secret with spaces'));
    expect(loggerSpy).toHaveBeenCalledWith(expect.not.stringContaining('apple banana cherry'));
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Authorization: Basic ***'));
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('password="***"'));
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('passphrase: ***'));

    loggerSpy.mockRestore();
  });
});
