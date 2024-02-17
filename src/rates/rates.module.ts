import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

import { Ticker, TickerSchema } from './schemas/ticker.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticker.name, schema: TickerSchema }]),
  ],
  controllers: [RatesController],
  providers: [RatesService],
})
export class RatesModule {}
