import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * NestJS pipe for validating and transforming incoming request data against a Zod schema.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  /**
   * Transforms and validates the incoming value against the schema.
   *
   * @param value - Incoming raw payload or query params
   * @returns Parsed and validated payload
   */
  transform(value: unknown) {
    return this.schema.parse(value);
  }
}
