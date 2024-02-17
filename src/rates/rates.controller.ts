import {
  Controller,
  Get,
  Query,
  UseFilters,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { HttpExceptionFilter } from 'src/http-exception.filter';

import { ParseCoinsPipe } from 'src/parse-coins.pipe';
import { ZodValidationPipe } from 'src/zod-validation.pipe';

import { GetHistoryDto, getHistorySchema } from './schemas/getHistory.schema';
import { RatesService } from './rates.service';
import { RatesInterceptor } from './rates.interceptor';

@Controller()
@UseFilters(HttpExceptionFilter)
@UseInterceptors(RatesInterceptor)
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get('get')
  getRates(@Query('coin', ParseCoinsPipe) coins: string[]) {
    return this.ratesService.getTickers(coins);
  }

  @Get('getHistory')
  @UsePipes(new ZodValidationPipe(getHistorySchema))
  getHistory(@Query() query: GetHistoryDto) {
    return this.ratesService.getHistoryTickers(query);
  }
}
