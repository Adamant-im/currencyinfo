import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

import { Ticker, TickerSchema } from './schemas/ticker.schema';
import { Timestamp, TimestampSchema } from './schemas/timestamp.schema';
import { SourcesManager } from './sources/sources-manager';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Ticker.name, schema: TickerSchema },
      { name: Timestamp.name, schema: TimestampSchema },
    ]),
  ],
  controllers: [RatesController],
  providers: [RatesService, SourcesManager],
})
export class RatesModule {}
