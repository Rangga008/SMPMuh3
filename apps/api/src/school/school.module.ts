import { Module } from '@nestjs/common';
import { AcademicYearController } from './academic-year/academic-year.controller';
import { AcademicYearService } from './academic-year/academic-year.service';

@Module({
  controllers: [AcademicYearController],
  providers: [AcademicYearService],
})
export class SchoolModule {}
