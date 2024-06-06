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
  getRates(
    @Query()
    query: GetRatesDto,
  ) {
    return this.ratesService.getTickers(query.coins, query.rateLifetime);
  }

  @Get('getHistory')
  @UsePipes(new ZodValidationPipe(getHistorySchema))
  getHistory(@Query() query: GetHistoryDto) {
    return this.ratesService.getHistoryTickers(query);
  }
}
