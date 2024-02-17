import { Module, Global } from '@nestjs/common';
import { Logger } from './logger.service';

@Global()
@Module({
  providers: [Logger],
  exports: [Logger],
})
export class LoggerModule {}
