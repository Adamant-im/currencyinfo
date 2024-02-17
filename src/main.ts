import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import { Logger } from './global/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { LogLevelName } from './global/logger/logger.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);

  const logLevel = config.get('log_level') as LogLevelName;
  app.useLogger(new Logger(logLevel));

  const port = config.get('port') as number;
  await app.listen(port);
}

bootstrap();
