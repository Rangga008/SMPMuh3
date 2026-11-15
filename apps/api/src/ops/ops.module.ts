import { Module } from '@nestjs/common';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { BukuIndukPdfService } from './buku-induk-pdf.service';

@Module({
  controllers: [OpsController],
  providers: [OpsService, BukuIndukPdfService],
  exports: [OpsService],
})
export class OpsModule {}
