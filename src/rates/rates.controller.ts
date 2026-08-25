import { Controller, Get, Query, UseFilters, UseInterceptors, UsePipes } from '@nestjs/common';

import { HttpExceptionFilter } from 'src/http-exception.filter';
import { ZodValidationPipe } from 'src/zod-validation.pipe';

import { GetHistoryDto, getHistorySchema } from './schemas/getHistory.schema';
import { GetRatesDto, getRatesSchema } from './schemas/getRates.schema';

import { RatesService } from './rates.service';
import { RatesInterceptor } from './rates.interceptor';

/**
 * Controller providing REST API endpoints for exchange rates, rate history, and health status.
 */
@Controller()
@UseFilters(HttpExceptionFilter)
@UseInterceptors(RatesInterceptor)
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  /**
   * Returns current exchange rates filtered by coin or currency pairs.
   *
   * @param query - Query parameters containing optional coin list and rateLifetime
   */
  @Get('get')
  @UsePipes(new ZodValidationPipe(getRatesSchema))
  async getRates(
    @Query()
    query: GetRatesDto,
  ) {
    const result = await this.ratesService.getTickers(query.coin, query.rateLifetime);
    return { result };
  }

  /**
   * Returns historical rate records filtered by time range, timestamp, and coin.
   *
   * @param query - Query parameters for historical data filtering
   */
  @Get('getHistory')
  @UsePipes(new ZodValidationPipe(getHistorySchema))
  async getHistory(@Query() query: GetHistoryDto) {
    const result = await this.ratesService.getHistoryTickers(query);
    return { result };
  }

  /**
   * Returns current operational status and next scheduled update timestamp.
   */
  @Get('status')
  getStatus() {
    const { lastUpdated, refreshInterval, initializationTimestamp } = this.ratesService;

    const ready = lastUpdated !== 0;
    const next_update = ready ? lastUpdated + refreshInterval : initializationTimestamp;
    const updating = next_update < Date.now();

    return { ready, updating, next_update };
  }
}
