import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminSpmbController } from './admin.controller';
import { CandidatesService } from './candidates.service';
import { DocumentsService } from './documents.service';
import { RegistrationsService } from './registrations.service';
import { SpmbController } from './spmb.controller';

@Module({
  imports: [NotificationsModule, PaymentsModule],
  controllers: [SpmbController, AdminSpmbController],
  providers: [CandidatesService, RegistrationsService, DocumentsService],
})
export class SpmbModule {}
