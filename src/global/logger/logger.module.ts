import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Logger } from './logger.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [Logger],
  exports: [Logger],
})
export class LoggerModule {}
