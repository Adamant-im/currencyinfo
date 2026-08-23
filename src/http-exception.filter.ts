import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ZodError } from 'zod';

/**
 * Global HTTP exception filter catching ZodError, HttpException, and unexpected exceptions,
 * returning a unified JSON error structure.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let errorMessage: string | object = 'Something went wrong';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof ZodError) {
      const [firstError] = exception.issues;
      errorMessage = firstError.message;
      status = HttpStatus.BAD_REQUEST;
    } else if (exception instanceof HttpException) {
      errorMessage = exception.getResponse();
      status = exception.getStatus();
    } else if (exception instanceof Error) {
      errorMessage = exception.message;
    }

    httpAdapter.reply(
      response,
      {
        success: false,
        date: Date.now(),
        msg: errorMessage,
      },
      status,
    );
  }
}
