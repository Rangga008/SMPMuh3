import { Module } from '@nestjs/common';
import { AcademicYearController } from './academic-year/academic-year.controller';
import { AcademicYearService } from './academic-year/academic-year.service';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';

@Module({
  controllers: [AcademicYearController, SchoolController],
  providers: [AcademicYearService, SchoolService],
})
export class SchoolModule {}
