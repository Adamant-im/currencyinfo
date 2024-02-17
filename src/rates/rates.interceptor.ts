import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import Redis from 'ioredis';

@Injectable()
export class RatesInterceptor implements NestInterceptor {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(async (data) => {
        const lastUpdated = await this.redis.get('last_updated');

        return {
          result: data,
          last_updated: lastUpdated ? Number(lastUpdated) : null,
          version: process.env.APP_VERSION,
        };
      }),
    );
  }
}
