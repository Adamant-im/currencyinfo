import { Module } from '@nestjs/common';

import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import configuration from './global/config/configuration';

import { RatesModule } from './rates/rates.module';
import { LoggerModule } from './global/logger/logger.module';
import { NotifierModule } from './global/notifier/notifier.module';
import { RedisModule } from '@nestjs-modules/ioredis';

const {
  MONGODB_HOST = '127.0.0.1',
  MONGODB_PORT = 27017,
  REDIS_HOST = 'localhost',
  REDIS_PORT = 6379,
} = process.env;

@Module({
  imports: [
    ScheduleModule.forRoot(),
    LoggerModule,
    NotifierModule,
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    RatesModule,
    MongooseModule.forRoot(
      `mongodb://${MONGODB_HOST}:${MONGODB_PORT}/currencyinfo`,
    ),
    RedisModule.forRoot({
      type: 'single',
      url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
    }),
  ],
})
export class AppModule {}
