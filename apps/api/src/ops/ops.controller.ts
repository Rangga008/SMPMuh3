import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { OpsService } from './ops.service';
import {
  CollectionDto,
  ExamRoomDto,
  ExamSeatDto,
  QuestionDto,
  ReviewDto,
  SaveAnswersDto,
  SaveAttendanceDto,
  ScheduleBlockDto,
  SubmissionDto,
  UniformDayDto,
} from './dto/ops.dto';

const sendFile = (res: Response, f: { buf: Buffer; mime: string; name: string }) => {
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.send(f.buf);
};

@Controller({ path: 'ops', version: '1' })
export class OpsController {
  constructor(private ops: OpsService) {}

  // ---- ScheduleBlock ----
  @Get('schedule-blocks')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  blocks(@Query('academicYearId') y: string) {
    return this.ops.listBlocks(y);
  }
  @Post('schedule-blocks')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  createBlock(@Body() dto: ScheduleBlockDto) {
    return this.ops.createBlock(dto);
  }
  @Delete('schedule-blocks/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  delBlock(@Param('id') id: string) {
    return this.ops.deleteBlock(id);
  }

  // ---- Timetable ----
  @Get('timetable')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  timetable(@Query('classId') classId: string) {
    return this.ops.classTimetable(classId);
  }
  @Get('timetable.xlsx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async timetableXlsx(
    @Res() res: Response,
    @Query('classId') classId?: string,
    @Query('academicYearId') y?: string,
  ) {
    if (!y) throw new BadRequestException('academicYearId wajib.');
    const buf = await this.ops.timetableXlsx(classId, y);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="jadwal-kelas.xlsx"');
    res.send(buf);
  }

  // ---- Butir soal & analisis ----
  @Put('assessments/:id/questions')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  setQuestions(@Param('id') id: string, @Body() body: { questions: QuestionDto[] }) {
    return this.ops.setQuestions(id, body.questions ?? []);
  }
  @Get('assessments/:id/questions')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  questions(@Param('id') id: string) {
    return this.ops.listQuestions(id);
  }
  @Post('questions/:id/answers')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  saveAnswers(@Param('id') id: string, @Body() dto: SaveAnswersDto) {
    return this.ops.saveAnswers(id, dto);
  }
  @Get('assessments/:id/analysis')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  analysis(@Param('id') id: string) {
    return this.ops.questionAnalysis(id);
  }
  @Get('assessments/:id/answers')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  answerMatrix(@Param('id') id: string) {
    return this.ops.answerMatrix(id);
  }

  // ---- Ledger & statistik nilai ----
  @Get('ledger')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  ledger(@Query('classId') c: string, @Query('academicYearId') y: string) {
    return this.ops.gradeLedger(c, y);
  }
  @Get('stats')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  stats(@Query('classId') c: string, @Query('academicYearId') y: string) {
    return this.ops.classSubjectStats(c, y);
  }

  // ---- Absen siswa harian ----
  @Get('attendance/my-today')
  myToday(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.ops.teacherToday(u.id, date);
  }
  @Get('attendance/class')
  classAttendance(@Query('classId') c: string, @Query('date') d: string) {
    return this.ops.classAttendance(c, d);
  }
  @Post('attendance')
  saveAttendance(@Body() dto: SaveAttendanceDto, @CurrentUser() u: AuthUser) {
    return this.ops.saveAttendance(dto, u.id);
  }
  @Get('attendance/recap')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  attendanceRecap(@Query('classId') c: string, @Query('from') f: string, @Query('to') t: string) {
    return this.ops.attendanceRecap(c, f, t);
  }

  // ---- StaffDocument ----
  @Get('staff-docs')
  @RequirePermission(PERMISSIONS.EMPLOYEE_READ)
  staffDocs(@Query('employeeId') e?: string, @Query('category') c?: string, @Query('q') q?: string) {
    return this.ops.listStaffDocs(e, c, q);
  }
  @Post('staff-docs')
  @UseInterceptors(FileInterceptor('file'))
  uploadStaffDoc(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { employeeId: string; category: string; title: string },
    @CurrentUser() u: AuthUser,
  ) {
    if (!file) throw new BadRequestException('File wajib.');
    return this.ops.uploadStaffDoc(body.employeeId, body.category || 'ADMINISTRASI', body.title || file.originalname, file, u.id);
  }
  @Get('staff-docs/:id/file')
  async staffDocFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.ops.staffDocFile(id));
  }
  @Delete('staff-docs/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  delStaffDoc(@Param('id') id: string) {
    return this.ops.deleteStaffDoc(id);
  }

  // ---- DocCollection ----
  @Get('collections')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  collections(@Query('academicYearId') y?: string) {
    return this.ops.listCollections(y);
  }
  @Get('collections/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  collection(@Param('id') id: string) {
    return this.ops.getCollection(id);
  }
  @Post('collections')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  createCollection(@Body() dto: CollectionDto, @CurrentUser() u: AuthUser) {
    return this.ops.createCollection(dto, u.id);
  }
  @Post('collections/:id/submit')
  @UseInterceptors(FileInterceptor('file'))
  submitItem(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('note') note: string | undefined,
    @CurrentUser() u: AuthUser,
  ) {
    if (!file) throw new BadRequestException('File wajib.');
    return this.ops.submitCollectionItem(id, u.id, file, note);
  }
  @Get('collection-items/:id/file')
  async collectionFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.ops.collectionItemFile(id));
  }

  // ---- ProgramSubmission ----
  @Get('submissions')
  submissions(@Query('department') d?: string, @Query('status') s?: string) {
    return this.ops.listSubmissions(d, s);
  }
  @Post('submissions')
  @UseInterceptors(FileInterceptor('file'))
  createSubmission(@Body() body: Record<string, string>, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    let rab: unknown;
    try {
      rab = body.rab ? JSON.parse(body.rab) : undefined;
    } catch {
      throw new BadRequestException('RAB harus JSON valid.');
    }
    return this.ops.createSubmission(
      {
        department: body.department, kind: body.kind, title: body.title,
        description: body.description, rab,
        amountTotal: body.amountTotal ? Number(body.amountTotal) : 0,
      } as SubmissionDto,
      u.id, file,
    );
  }
  @Patch('submissions/:id/review')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE) // kepala sekolah & kurikulum manage
  review(@Param('id') id: string, @Body() dto: ReviewDto, @CurrentUser() u: AuthUser) {
    return this.ops.reviewSubmission(id, dto.action, dto.note, u.id);
  }
  @Get('submissions/:id/file')
  async submissionFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.ops.submissionFile(id));
  }

  // ---- Arsip ----
  @Get('archives/categories')
  archiveCats() {
    return this.ops.listArchiveCategories();
  }
  @Post('archives/categories')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  createArchiveCat(@Body('name') name: string) {
    return this.ops.createArchiveCategory(name);
  }
  @Get('archives')
  archives(@Query('categoryId') c?: string, @Query('q') q?: string) {
    return this.ops.listArchiveItems(c, q);
  }
  @Post('archives')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  uploadArchive(@Body() body: Record<string, string>, @UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException('File wajib.');
    return this.ops.uploadArchiveItem(
      {
        title: body.title ?? file.originalname,
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.refNumber ? { refNumber: body.refNumber } : {}),
        ...(body.date ? { date: body.date } : {}),
      },
      file, u.id,
    );
  }
  @Get('archives/:id/file')
  async archiveFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.ops.archiveFile(id));
  }

  // ---- Policy docs ----
  @Get('policies')
  policies(@Query('kind') kind?: string) {
    return this.ops.listPolicies(kind);
  }
  @Post('policies')
  @UseInterceptors(FileInterceptor('file'))
  uploadPolicy(@Body() body: { kind: string; title: string }, @UploadedFile() file: Express.Multer.File, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException('File wajib.');
    return this.ops.uploadPolicy(body.kind || 'LAINNYA', body.title || file.originalname, file, u.id);
  }
  @Get('policies/:id/file')
  async policyFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.ops.policyFile(id));
  }

  // ---- Seragam ----
  @Get('uniforms')
  uniforms() {
    return this.ops.listUniforms();
  }
  @Put('uniforms')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  upsertUniform(@Body() dto: UniformDayDto) {
    return this.ops.upsertUniform(dto);
  }

  // ---- Ruang ujian ----
  @Get('exam-rooms')
  @RequirePermission(PERMISSIONS.TATAUSAHA_READ)
  examRooms(@Query('academicYearId') y: string, @Query('period') p?: string) {
    return this.ops.listExamRooms(y, p);
  }
  @Post('exam-rooms')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  createRoom(@Body() dto: ExamRoomDto) {
    return this.ops.createExamRoom(dto);
  }
  @Post('exam-rooms/:id/seats')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  assignSeat(@Param('id') id: string, @Body() dto: ExamSeatDto) {
    return this.ops.assignSeat(id, dto);
  }
  @Post('exam-rooms/:id/assign-class')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  assignClass(@Param('id') id: string, @Body('classId') classId: string) {
    return this.ops.assignClassToRoom(id, classId);
  }
  @Get('exam-rooms/:id/cards')
  @RequirePermission(PERMISSIONS.TATAUSAHA_READ)
  examCards(@Param('id') id: string) {
    return this.ops.examCards(id);
  }

  // ---- Mutasi: surat ----
  @Post('mutations/:id/letter')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  mutationLetter(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib.');
    return this.ops.mutationLetter(id, file);
  }
  @Get('mutations/:id/letter')
  async mutationLetterFile(@Param('id') id: string, @Res() res: Response) {
    sendFile(res, await this.ops.mutationLetterFile(id));
  }

  // ---- Buku induk ----
  @Get('students/:id/record')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  studentRecord(@Param('id') id: string) {
    return this.ops.studentRecord(id);
  }
  @Patch('students/:id/record')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  updateStudentRecord(@Param('id') id: string, @Body() body: Record<string, string>) {
    return this.ops.updateStudentRecord(id, body);
  }

  // ---- Import Dapodik ----
  @Post('import/students')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  importStudents(
    @UploadedFile() file: Express.Multer.File,
    @Body('academicYearId') y: string,
    @Body('classMap') classMapJson?: string,
  ) {
    if (!file) throw new BadRequestException('File wajib.');
    let classMap: Record<string, string> = {};
    try {
      classMap = classMapJson ? JSON.parse(classMapJson) : {};
    } catch {
      throw new BadRequestException('classMap harus JSON valid.');
    }
    return this.ops.importStudents(file.buffer, y, classMap);
  }
  @Post('import/employees')
  @RequirePermission(PERMISSIONS.EMPLOYEE_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  importEmployees(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib.');
    return this.ops.importEmployees(file.buffer);
  }
}
