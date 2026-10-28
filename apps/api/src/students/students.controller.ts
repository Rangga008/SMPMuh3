import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import type { StudentStatus } from '@prisma/client';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { StudentsService } from './students.service';
import {
  AchievementDto,
  CreateStudentDto,
  MarkAttendanceDto,
  UpdateStudentDto,
  ViolationDto,
} from './dto/student.dto';

@Controller({ version: '1' })
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('students')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  list(
    @Query('search') search?: string,
    @Query('status') status?: StudentStatus,
    @Query('classId') classId?: string,
  ) {
    return this.students.list({ search, status, classId });
  }

  @Get('students/:id')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.detail(id);
  }

  @Post('students')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStudentDto) {
    return this.students.create(dto, user.id);
  }

  @Patch('students/:id')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ) {
    return this.students.update(id, dto, user.id);
  }

  @Delete('students/:id')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.archive(id, user.id);
  }

  @Post('students/:id/achievements')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  addAchievement(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AchievementDto,
  ) {
    return this.students.addAchievement(id, dto, user.id);
  }

  @Post('students/:id/violations')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  addViolation(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ViolationDto,
  ) {
    return this.students.addViolation(id, dto, user.id);
  }

  @Post('attendance')
  @RequirePermission(PERMISSIONS.ATTENDANCE_MANAGE)
  mark(@CurrentUser() user: AuthUser, @Body() dto: MarkAttendanceDto) {
    return this.students.markAttendance(dto, user.id);
  }

  @Get('attendance')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  listAttendance(@Query('classId') classId: string, @Query('date') date: string) {
    return this.students.listAttendance(classId, date);
  }
}
