import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';

import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { version } from 'src/global/version';

@Injectable()
export class RatesInterceptor implements NestInterceptor {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(async (data) => {
        const lastUpdated = await this.redis.get('last_updated');

        return {
          success: true,
          date: Date.now(),
          result: data,
          last_updated: lastUpdated ? Number(lastUpdated) : null,
          version,
        };
      }),
    );
  }
}
