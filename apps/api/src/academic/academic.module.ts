import { Module } from '@nestjs/common';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';

@Module({
  controllers: [AcademicController, GradebookController],
  providers: [AcademicService, GradebookService],
})
export class AcademicModule {}
