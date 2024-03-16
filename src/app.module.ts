import { Module } from '@nestjs/common';

import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MongooseModule } from '@nestjs/mongoose';
import { RedisModule } from '@nestjs-modules/ioredis';

import configuration from './global/config/configuration';

import { RatesModule } from './rates/rates.module';
import { LoggerModule } from './global/logger/logger.module';
import { NotifierModule } from './global/notifier/notifier.module';

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
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const port = config.get('server.mongodb.port');
        const host = config.get('server.mongodb.host');

        return {
          uri: `mongodb://${host}:${port}/tickersdb`,
        };
      },
    }),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const port = config.get('server.redis.port');
        const host = config.get('server.redis.host');

        return {
          type: 'single',
          url: `redis://${host}:${port}`,
          options: {
            retryStrategy() {
              console.error('Error: could not connect to Redis');
              process.exit(-1);
            },
          },
        };
      },
    }),
  ],
})
export class AppModule {}
