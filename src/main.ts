import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

import { AppModule } from './app.module';

import { Logger } from './global/logger/logger.service';
import { Notifier } from './global/notifier/notifier.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);

  const logger = new Logger(config);

  app.useLogger(logger);

  const port = config.get('server.port') as number;
  await app.listen(port);

  const notifier = new Notifier(config);
  notifier.notify(
    'log',
    `Infoservice v${process.env.APP_VERSION} started on port ${port}`,
  );
}

bootstrap();
