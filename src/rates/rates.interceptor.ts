import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { version } from 'src/global/version';

import { RatesService } from './rates.service';

@Injectable()
export class RatesInterceptor implements NestInterceptor {
  constructor(private readonly ratesService: RatesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(async (data: object) => {
        const { lastUpdated } = this.ratesService;

        return {
          success: true,
          date: Date.now(),
          ...data,
          last_updated: lastUpdated || null,
          version,
        };
      }),
    );
  }
}
