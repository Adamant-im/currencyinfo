import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ZodError } from 'zod';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let errorMessage: string | object = 'Something went wrong';
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof ZodError) {
      const [firstError] = exception.issues;

      errorMessage = firstError.message;
      httpStatus = HttpStatus.BAD_REQUEST;
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      errorMessage = exception.getResponse();
    }

    httpAdapter.reply(
      response,
      {
        error: errorMessage,
        status: httpStatus,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
