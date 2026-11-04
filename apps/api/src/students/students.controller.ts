import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  // ---------- Orang tua / wali (deklarasi sebelum :id agar tak tertelan) ----------

  @Get('students/parents')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  listParents(@Query('search') search?: string) {
    return this.students.listParents(search);
  }

  @Get('students/parents/:id')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  parentDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.students.parentDetail(id);
  }

  @Post('students/parents/:id/remind')
  @RequirePermission(PERMISSIONS.FINANCE_MANAGE)
  remindParent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.students.remindParent(id, user.id);
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

  /** Unggah dokumen siswa (bukti prestasi/pelanggaran, berkas umum). */
  @Post('students/:id/documents')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('type') type: string | undefined,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    return this.students.uploadDocument(id, type ?? 'lainnya', file, user.id);
  }

  /** Unduh/buka dokumen siswa. */
  @Get('students/documents/:docId')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  async openDocument(@Param('docId', ParseUUIDPipe) docId: string) {
    const { doc, buffer } = await this.students.openDocument(docId);
    return new StreamableFile(buffer, {
      type: doc.mimeType,
      disposition: `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    });
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
