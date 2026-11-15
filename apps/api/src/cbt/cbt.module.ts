import { Module } from '@nestjs/common';
import { CbtController } from './cbt.controller';
import { CbtService } from './cbt.service';
import { OpsModule } from '../ops/ops.module';

@Module({
  imports: [OpsModule],
  controllers: [CbtController],
  providers: [CbtService],
})
export class CbtModule {}
