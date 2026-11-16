import { Module } from '@nestjs/common';
import { AcademicYearController } from './academic-year/academic-year.controller';
import { AcademicYearService } from './academic-year/academic-year.service';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
  controllers: [AcademicYearController, SchoolController, BackupController],
  providers: [AcademicYearService, SchoolService, BackupService],
})
export class SchoolModule {}
