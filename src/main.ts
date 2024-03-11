import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

import { Logger } from './global/logger/logger.service';
import { LogLevelName } from './global/logger/logger.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);

  const logLevel = config.get('log_level') as LogLevelName;
  const logger = new Logger(logLevel);

  app.useLogger(logger);

  const port = config.get('server.port') as number;
  await app.listen(port);

  logger.log(`The app started on port ${port}`);
}

bootstrap();
