import { HttpException, HttpStatus } from '@nestjs/common';
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

  it('should format standard Error with 500 Internal Server Error', () => {
    const error = new Error('Unexpected runtime crash');

    filter.catch(error, mockArgumentsHost);

    expect(mockHttpAdapter.reply).toHaveBeenCalledWith(
      mockResponse,
      expect.objectContaining({
        success: false,
        msg: 'Unexpected runtime crash',
      }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });
});
