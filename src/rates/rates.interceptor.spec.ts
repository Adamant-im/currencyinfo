import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { RatesInterceptor } from './rates.interceptor';
import { RatesService } from './rates.service';
import { version } from 'src/global/version';

describe('RatesInterceptor', () => {
  let interceptor: RatesInterceptor;
  let mockRatesService: Partial<RatesService>;

  beforeEach(() => {
    mockRatesService = {
      lastUpdated: 1700000000000,
    };
    interceptor = new RatesInterceptor(mockRatesService as RatesService);
  });

  it('should wrap response in standard API envelope with success, date, last_updated, and version', (done) => {
    const mockContext = {} as ExecutionContext;
    const mockHandler: CallHandler = {
      handle: () => of({ result: { 'ADM/USD': 0.03 } }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((response) => {
      expect(response).toMatchObject({
        success: true,
        result: { 'ADM/USD': 0.03 },
        last_updated: 1700000000000,
        version,
      });
      expect(typeof response.date).toBe('number');
      done();
    });
  });

  it('should set last_updated to null if lastUpdated is 0', (done) => {
    mockRatesService.lastUpdated = 0;
    const mockContext = {} as ExecutionContext;
    const mockHandler: CallHandler = {
      handle: () => of({ ready: false }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe((response) => {
      expect(response.last_updated).toBeNull();
      done();
    });
  });
});
