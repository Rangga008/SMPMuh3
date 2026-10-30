import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [NotificationsModule, FinanceModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, ReceiptsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
