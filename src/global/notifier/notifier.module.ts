import { Module, Global } from '@nestjs/common';
import { Notifier } from './notifier.service';

@Global()
@Module({
  providers: [Notifier],
  exports: [Notifier],
})
export class NotifierModule {}
