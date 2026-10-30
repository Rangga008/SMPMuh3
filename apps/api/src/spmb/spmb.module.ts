import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { AdminSpmbController } from './admin.controller';
import { CandidatesService } from './candidates.service';
import { DocumentsService } from './documents.service';
import { SpmbImportService } from './import.service';
import { RegistrationsService } from './registrations.service';
import { SpmbSettingsService } from './settings.service';
import { SpmbController } from './spmb.controller';

@Module({
  imports: [NotificationsModule, PaymentsModule, IdentityModule],
  controllers: [SpmbController, AdminSpmbController],
  providers: [
    CandidatesService,
    RegistrationsService,
    DocumentsService,
    SpmbSettingsService,
    SpmbImportService,
  ],
})
export class SpmbModule {}
