import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

import { Logger } from './global/logger/logger.service';
import { Notifier } from './global/notifier/notifier.service';

import { version } from 'src/global/version';

/**
 * Application bootstrap function initializing NestJS server and notification dispatcher.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = new Logger(config);

  app.useLogger(logger);

  const port = (config.get('server.port') as number) || 36661;
  await app.listen(port);

  const notifier = new Notifier(config);
  await notifier.notify('info', `Infoservice v${version} started on port ${port}`);
}

bootstrap();
