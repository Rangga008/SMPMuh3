import { Module } from '@nestjs/common';
import { CbtController } from './cbt.controller';
import { CbtService } from './cbt.service';

@Module({
  controllers: [CbtController],
  providers: [CbtService],
})
export class CbtModule {}
