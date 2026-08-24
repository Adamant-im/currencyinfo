import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ZodError } from 'zod';

/**
 * Global HTTP exception filter catching ZodError, HttpException, and unexpected exceptions,
 * returning a unified JSON error structure without leaking internal error details.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let errorMessage: string | object;
    let status: HttpStatus;

    if (exception instanceof ZodError) {
      const [firstError] = exception.issues;
      errorMessage = firstError.message;
      status = HttpStatus.BAD_REQUEST;
    } else if (exception instanceof HttpException) {
      errorMessage = exception.getResponse();
      status = exception.getStatus();
    } else {
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.stack || exception.message : exception}`,
      );
      errorMessage = 'Something went wrong';
      status = HttpStatus.INTERNAL_SERVER_ERROR;
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
