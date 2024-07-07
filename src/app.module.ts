import { Module } from '@nestjs/common';

import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { MongooseModule } from '@nestjs/mongoose';

import configuration from './global/config/configuration';

import { RatesModule } from './rates/rates.module';
import { LoggerModule } from './global/logger/logger.module';
import { NotifierModule } from './global/notifier/notifier.module';
import { Logger } from './global/logger/logger.service';

const MONGODB_NAME = 'tickersdb';

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
      imports: [ConfigModule, LoggerModule],
      inject: [ConfigService, Logger],
      useFactory: (config: ConfigService, logger: Logger) => {
        const port = config.get('server.mongodb.port');
        const host = config.get('server.mongodb.host');

        return {
          uri: `mongodb://${host}:${port}/${MONGODB_NAME}`,
          retryAttempts: 0,
          serverSelectionTimeoutMS: 1000,
          connectionFactory(connection) {
            connection.on('connected', () => {
              logger.log(
                `InfoService successfully connected to '${MONGODB_NAME}' MongoDB.`,
              );
            });
            connection._events.connected();
            return connection;
          },
        };
      },
    }),
  ],
})
export class AppModule {}
