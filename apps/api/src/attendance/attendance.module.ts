import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { IclockController } from './iclock.controller';

@Module({
  controllers: [AttendanceController, IclockController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
