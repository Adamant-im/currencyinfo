import {
  Controller,
  Get,
  Query,
  UseFilters,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';

import { HttpExceptionFilter } from 'src/http-exception.filter';
import { ZodValidationPipe } from 'src/zod-validation.pipe';

import { GetHistoryDto, getHistorySchema } from './schemas/getHistory.schema';
import { GetRatesDto, getRatesSchema } from './schemas/getRates.schema';

import { RatesService } from './rates.service';
import { RatesInterceptor } from './rates.interceptor';

@Controller()
@UseFilters(HttpExceptionFilter)
@UseInterceptors(RatesInterceptor)
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get('get')
  @UsePipes(new ZodValidationPipe(getRatesSchema))
  async getRates(
    @Query()
    query: GetRatesDto,
  ) {
    const result = await this.ratesService.getTickers(
      query.coin,
      query.rateLifetime,
    );
    return { result };
  }

  @Get('getHistory')
  @UsePipes(new ZodValidationPipe(getHistorySchema))
  async getHistory(@Query() query: GetHistoryDto) {
    const result = await this.ratesService.getHistoryTickers(query);
    return { result };
  }

  @Get('status')
  getStatus() {
    const { lastUpdated, refreshInterval, initializationTimestamp } =
      this.ratesService;

    const ready = lastUpdated !== 0;
    const next_update = ready
      ? lastUpdated + refreshInterval
      : initializationTimestamp;
    const updating = next_update < Date.now();

    return { ready, updating, next_update };
  }
}
