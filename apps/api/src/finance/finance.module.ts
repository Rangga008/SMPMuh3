import { Module } from '@nestjs/common';
import { WhatsappModule } from '../spmb/whatsapp.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [WhatsappModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
