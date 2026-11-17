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
import * as XLSX from 'xlsx';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { OpsService } from './ops.service';
import { BukuIndukPdfService } from './buku-induk-pdf.service';
import {
  CollectionDto,
  ExamRoomDto,
  ExamRoomUpdateDto,
  ExamSeatDto,
  PassageDto,
  PrasaranaDto,
  PrasaranaUpdateDto,
  QuestionDto,
  ReviewDto,
  SaranaItemDto,
  SaranaItemUpdateDto,
  SaranaTypeDto,
  SaranaTypeUpdateDto,
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
  constructor(private ops: OpsService, private bukuInduk: BukuIndukPdfService) {}

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
  /** Matriks jadwal semua kelas — dipakai halaman cetak & bisa dijadikan PDF. */
  @Get('timetable-matrix')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  timetableMatrix(@Query('academicYearId') y: string) {
    if (!y) throw new BadRequestException('academicYearId wajib.');
    return this.ops.timetableMatrix(y);
  }
  /** Rekap absen siswa bulanan — format Dapodik, satu sheet per kelas. */
  @Get('attendance/recap.xlsx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async attendanceRecapXlsx(
    @Res() res: Response,
    @Query('academicYearId') y: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    if (!y || !year || !month) throw new BadRequestException('academicYearId, year, month wajib.');
    const buf = await this.ops.attendanceRecapXlsx(y, Number(year), Number(month));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="absen-${year}-${String(month).padStart(2, '0')}.xlsx"`);
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
  /** Template Excel import soal — kolom sesuai parser di parseQuestionWorkbook.
   *  ?pg=10&pgk=0&bs=5&bsk=3 → baris kosong bernomor per tipe (generator). */
  @Get('assessments/:id/questions/template')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  questionsTemplate(@Res() res: Response, @Query('pg') pgQ?: string, @Query('pgk') pgkQ?: string, @Query('bs') bsQ?: string, @Query('bsk') bskQ?: string) {
    const gen = pgQ !== undefined || pgkQ !== undefined || bsQ !== undefined || bskQ !== undefined;
    const n = (v?: string) => Math.floor(Number(v) || 0);
    const buf = this.ops.questionTemplateXlsx(gen ? { pg: n(pgQ), pgk: n(pgkQ), bs: n(bsQ), bsk: n(bskQ) } : undefined);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template-soal.xlsx"');
    res.send(buf);
  }

  /** Template Word (.docx) — satu tabel per soal + tabel BACAAN; contoh semua tipe. */
  @Get('assessments/:id/questions/template.docx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async questionsTemplateDocx(@Res() res: Response) {
    const buf = await this.ops.questionTemplateDocx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="template-import-soal.docx"');
    res.send(buf);
  }

  /** Import soal dari Excel/CSV/Word — mengganti seluruh butir asesmen. */
  @Post('assessments/:id/questions/import')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  async importQuestions(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.docx')) {
      const { questions, passages } = await this.ops.parseQuestionDocx(file);
      return this.ops.setQuestions(id, questions, passages);
    }
    const questions = this.ops.parseQuestionWorkbook(file);
    return this.ops.setQuestions(id, questions, this.ops.parsePassageSheet(file));
  }

  /** Preview import — parse file & unggah gambar, hasilnya ditampilkan dulu sebelum disimpan. */
  @Post('assessments/:id/questions/import-preview')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  async importPreview(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.docx')) return this.ops.parseQuestionDocx(file);
    return { questions: this.ops.parseQuestionWorkbook(file), passages: this.ops.parsePassageSheet(file) };
  }

  @Get('assessments/:id/passages')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  listPassages(@Param('id') id: string) {
    return this.ops.listPassages(id);
  }

  /** Simpan seluruh bacaan — tambah/edit/hapus via daftar lengkap. */
  @Put('assessments/:id/passages')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  setPassages(@Param('id') id: string, @Body() body: { passages: PassageDto[] }) {
    return this.ops.setPassages(id, body.passages ?? []);
  }

  /** Unggah gambar untuk disisipkan ke soal/opsi/bacaan buatan manual — hasil {key,url}. */
  @Post('question-media')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  uploadQuestionMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) throw new BadRequestException('Gambar harus JPG/PNG/WebP/GIF.');
    return this.ops.uploadQuestionMedia(file);
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
  @Get('ledger.xlsx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async ledgerXlsx(@Res() res: Response, @Query('classId') c: string, @Query('academicYearId') y: string) {
    const buf = await this.ops.gradeLedgerXlsx(c, y);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ledger-nilai.xlsx"');
    res.send(buf);
  }
  @Get('stats.xlsx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async statsXlsx(@Res() res: Response, @Query('classId') c: string, @Query('academicYearId') y: string) {
    const buf = await this.ops.classSubjectStatsXlsx(c, y);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="statistik-mapel.xlsx"');
    res.send(buf);
  }
  @Get('attendance/recap-class.xlsx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async recapClassXlsx(@Res() res: Response, @Query('classId') c: string, @Query('from') f: string, @Query('to') t: string) {
    const buf = await this.ops.attendanceRecapClassXlsx(c, f, t);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="rekap-absen.xlsx"');
    res.send(buf);
  }

  // ---- Absen siswa harian ----
  @Get('attendance/my-today')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  myToday(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.ops.teacherToday(u.id, date);
  }
  @Get('attendance/class')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  classAttendance(@Query('classId') c: string, @Query('date') d: string) {
    return this.ops.classAttendance(c, d);
  }

  /** Hapus seluruh absen satu rombel di satu tanggal (salah absen). */
  @Delete('class-attendance')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  clearClassAttendance(@Query('classId') c: string, @Query('date') d: string, @CurrentUser() u: AuthUser) {
    if (!c || !d) throw new BadRequestException('Parameter classId & date wajib.');
    return this.ops.clearClassAttendance(c, d, u.id);
  }

  /** Sinkron ulang Grade dari attempt SUBMITTED (untuk ujian lama). */
  @Post('exams/:id/sync-grades')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  syncExamGrades(@Param('id') id: string) {
    return this.ops.syncExamGrades(id);
  }
  @Post('attendance')
  @RequirePermission(PERMISSIONS.ATTENDANCE_MANAGE)
  saveAttendance(@Body() dto: SaveAttendanceDto, @CurrentUser() u: AuthUser) {
    return this.ops.saveAttendance(dto, u.id);
  }
  @Get('attendance/recap')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  attendanceRecap(@Query('classId') c: string, @Query('from') f: string, @Query('to') t: string) {
    return this.ops.attendanceRecap(c, f, t);
  }
  /** Ikhtisar harian seluruh rombel — dasbor kesiswaan. */
  @Get('attendance/daily-overview')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  attendanceDailyOverview(@Query('date') d: string, @Query('academicYearId') y?: string) {
    return this.ops.attendanceDailyOverview(d, y);
  }
  /** Riwayat absen satu siswa + rekap jumlah. */
  @Get('attendance/student-history')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  studentAttendanceHistory(@Query('studentId') s: string, @Query('academicYearId') y?: string) {
    return this.ops.studentAttendanceHistory(s, y);
  }
  /** Laporan absensi fleksibel — siswa/kelas/jenjang × hari/rentang/bulan/multi-bulan. */
  @Get('attendance/report')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  attendanceReport(
    @Query('mode') mode: 'day' | 'range' | 'month' | 'months',
    @Query('academicYearId') y?: string, @Query('studentIds') s?: string,
    @Query('classIds') c?: string, @Query('gradeLevels') g?: string,
    @Query('date') d?: string, @Query('from') f?: string, @Query('to') t?: string,
    @Query('year') yr?: string, @Query('month') mo?: string,
  ) {
    const csv = (v?: string) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);
    return this.ops.attendanceReport({
      mode, academicYearId: y, studentIds: csv(s), classIds: csv(c),
      gradeLevels: csv(g)?.map(Number), date: d, from: f, to: t,
      year: yr ? Number(yr) : undefined, month: mo ? Number(mo) : undefined,
    });
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
  @Patch('archives/categories/:id')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  updateArchiveCat(@Param('id') id: string, @Body('name') name: string) {
    return this.ops.updateArchiveCategory(id, name);
  }
  @Delete('archives/categories/:id')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  deleteArchiveCat(@Param('id') id: string) {
    return this.ops.deleteArchiveCategory(id);
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
  @Patch('archives/:id')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  updateArchive(
    @Param('id') id: string,
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.ops.updateArchiveItem(id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId || null } : {}),
      ...(body.refNumber !== undefined ? { refNumber: body.refNumber || null } : {}),
      ...(body.date !== undefined ? { date: body.date || null } : {}),
    }, file);
  }
  @Delete('archives/:id')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  deleteArchive(@Param('id') id: string) {
    return this.ops.deleteArchiveItem(id);
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
  @Post('exam-rooms/:id/links')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  addLink(@Param('id') id: string, @Body() dto: { examId?: string; sessionId?: string; sessionLabel?: string; startsAt?: string; endsAt?: string }) {
    return this.ops.addRoomLink(id, dto);
  }
  @Delete('exam-room-links/:linkId')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  removeLink(@Param('linkId') linkId: string) {
    return this.ops.removeRoomLink(linkId);
  }
  @Post('exam-rooms/:id/assign-class')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  assignClass(
    @Param('id') id: string,
    @Body('classId') classId: string,
    @Body('linkId') linkId?: string,
    @Body('count') count?: number,
  ) {
    return this.ops.assignClassToRoom(id, classId, linkId, count != null ? Number(count) : undefined);
  }
  @Patch('exam-rooms/:id')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  updateRoom(@Param('id') id: string, @Body() dto: ExamRoomUpdateDto) {
    return this.ops.updateExamRoom(id, dto);
  }
  @Delete('exam-rooms/:id')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  deleteRoom(@Param('id') id: string) {
    return this.ops.deleteExamRoom(id);
  }
  @Delete('exam-seats/:seatId')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  removeSeat(@Param('seatId') seatId: string) {
    return this.ops.removeExamSeat(seatId);
  }
  /** Checklist hadir satu peserta — null = belum dicek. */
  @Patch('exam-seats/:seatId/attendance')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  seatAttendance(@Param('seatId') seatId: string, @Body('present') present?: boolean | null) {
    return this.ops.setSeatPresent(seatId, present ?? null);
  }
  /** Checklist hadir massal satu sesi ruang — body: { presentIds: string[] }. */
  @Patch('exam-room-links/:linkId/attendance')
  @RequirePermission(PERMISSIONS.TATAUSAHA_MANAGE)
  linkAttendance(@Param('linkId') linkId: string, @Body('presentIds') presentIds?: string[]) {
    return this.ops.setLinkAttendance(linkId, presentIds ?? []);
  }
  @Get('exam-rooms/:id/cards')
  @RequirePermission(PERMISSIONS.TATAUSAHA_READ)
  examCards(@Param('id') id: string, @Query('linkId') linkId?: string) {
    return this.ops.examCards(id, linkId);
  }
  /** Kartu gabungan per siswa — satu kartu menampilkan SEMUA jadwal ujiannya. */
  @Get('exam-room-links/:linkId/student-cards')
  @RequirePermission(PERMISSIONS.TATAUSAHA_READ)
  studentCards(@Param('linkId') linkId: string) {
    return this.ops.studentCards(linkId);
  }
  /** Roster satu periode: semua ruang+sesi+peserta — untuk cetak daftar peserta
   *  per ruang, rekap kelas×ruang, dan daftar semua peserta. */
  @Get('exam-rooms/roster')
  @RequirePermission(PERMISSIONS.TATAUSAHA_READ)
  examRoomRoster(@Query('academicYearId') y: string, @Query('period') p: string) {
    return this.ops.examRoomRoster(y, p);
  }

  /** Data calon peserta US-1/US-2 — daftar peserta & rekapitulasi per rombel. */
  @Get('us/candidates')
  @RequirePermission(PERMISSIONS.TATAUSAHA_READ)
  usCandidates(@Query('academicYearId') y: string, @Query('gradeLevel') g?: string) {
    return this.ops.usCandidates(y, g ? Number(g) : undefined);
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
  /** Ekspor buku induk → PDF tunggal atau ZIP hierarki Kelas X/<rombel>/<siswa>.pdf. */
  @Get('buku-induk/export')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  async exportBukuInduk(
    @Query('academicYearId') academicYearId: string | undefined,
    @Query('classId') classId: string | undefined,
    @Query('gradeLevel') gradeLevel: string | undefined,
    @Query('studentIds') studentIds: string | undefined,
    @Query('all') all: string | undefined,
    @Res() res: Response,
  ) {
    const f = await this.bukuInduk.export({
      academicYearId: academicYearId || undefined,
      classId: classId || undefined,
      gradeLevel: gradeLevel ? Number(gradeLevel) : undefined,
      studentIds: studentIds ? studentIds.split(',').filter(Boolean) : undefined,
      all: all === '1' || all === 'true',
    });
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.send(f.buf);
  }

  @Get('students/:id/record')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  studentRecord(@Param('id') id: string) {
    return this.ops.studentRecord(id);
  }
  @Patch('students/:id/record')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  updateStudentRecord(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.ops.updateStudentRecord(id, body);
  }

  /** Pas foto buku induk — sinkron dengan kolom photo_key siswa. */
  @Post('students/:id/photo')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  uploadStudentPhoto(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('File foto wajib.');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Foto harus JPG, PNG, atau WebP.');
    }
    return this.ops.uploadStudentPhoto(id, file);
  }

  /** Pas foto siswa — publik agar <img> langsung menampilkannya di buku induk. */
  @Get('students/:id/photo')
  @Public()
  async studentPhoto(@Param('id') id: string, @Res() res: Response) {
    const f = await this.ops.studentPhoto(id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(f.buf);
  }

  // ---- Sarpras: jenis sarana, sarana, prasarana ----
  @Get('sarana-types')
  @RequirePermission(PERMISSIONS.SARPRAS_READ)
  saranaTypes() { return this.ops.saranaTypes(); }
  @Post('sarana-types')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  createSaranaType(@Body() dto: SaranaTypeDto) { return this.ops.createSaranaType(dto); }
  @Patch('sarana-types/:id')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  updateSaranaType(@Param('id') id: string, @Body() dto: SaranaTypeUpdateDto) { return this.ops.updateSaranaType(id, dto); }
  @Delete('sarana-types/:id')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  deleteSaranaType(@Param('id') id: string) { return this.ops.deleteSaranaType(id); }

  @Get('saranas')
  @RequirePermission(PERMISSIONS.SARPRAS_READ)
  saranas() { return this.ops.saranas(); }
  @Get('saranas.xlsx')
  @RequirePermission(PERMISSIONS.SARPRAS_READ)
  async saranasXlsx(@Res() res: Response) {
    const buf = await this.ops.saranaXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''sarana.xlsx");
    res.send(buf);
  }
  @Post('saranas')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  createSarana(@Body() dto: SaranaItemDto) { return this.ops.createSarana(dto); }
  @Patch('saranas/:id')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  updateSarana(@Param('id') id: string, @Body() dto: SaranaItemUpdateDto) { return this.ops.updateSarana(id, dto); }
  @Delete('saranas/:id')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  deleteSarana(@Param('id') id: string) { return this.ops.deleteSarana(id); }

  /** Foto inventaris sarpras — unggah (manage) & layani (read). */
  @Post('sarpras-media')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  uploadSarprasMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) throw new BadRequestException('Gambar harus JPG/PNG/WebP/GIF.');
    return this.ops.uploadSarprasMedia(file);
  }
  @Get('sarpras-media/:file')
  @RequirePermission(PERMISSIONS.SARPRAS_READ)
  async sarprasMedia(@Param('file') file: string, @Res() res: Response) {
    const f = await this.ops.sarprasMedia(file);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(f.buf);
  }

  @Get('prasaranas')
  @RequirePermission(PERMISSIONS.SARPRAS_READ)
  prasaranas() { return this.ops.prasaranas(); }
  @Get('prasaranas.xlsx')
  @RequirePermission(PERMISSIONS.SARPRAS_READ)
  async prasaranasXlsx(@Res() res: Response) {
    const buf = await this.ops.prasaranaXlsx();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''prasarana.xlsx");
    res.send(buf);
  }
  @Post('prasaranas')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  createPrasarana(@Body() dto: PrasaranaDto) { return this.ops.createPrasarana(dto); }
  @Patch('prasaranas/:id')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  updatePrasarana(@Param('id') id: string, @Body() dto: PrasaranaUpdateDto) { return this.ops.updatePrasarana(id, dto); }
  @Delete('prasaranas/:id')
  @RequirePermission(PERMISSIONS.SARPRAS_MANAGE)
  deletePrasarana(@Param('id') id: string) { return this.ops.deletePrasarana(id); }

  // ---- Import Dapodik ----
  /** Template Excel — sheet Data + Petunjuk + daftar rombel tahun ajaran. */
  @Get('import/students-template')
  @RequirePermission(PERMISSIONS.STUDENT_READ)
  async studentImportTemplate(@Query('academicYearId') y: string, @Res() res: Response) {
    const buf = await this.ops.studentImportTemplateXlsx(y);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''template-import-siswa.xlsx");
    res.send(buf);
  }

  @Post('import/students')
  @RequirePermission(PERMISSIONS.STUDENT_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  importStudents(
    @UploadedFile() file: Express.Multer.File,
    @Body('academicYearId') y: string,
    @Body('classMap') classMapJson?: string,
    @Body('dry') dry?: string,
    @Body('classId') classId?: string,
  ) {
    if (!file) throw new BadRequestException('File wajib.');
    let classMap: Record<string, string> = {};
    try {
      classMap = classMapJson ? JSON.parse(classMapJson) : {};
    } catch {
      throw new BadRequestException('classMap harus JSON valid.');
    }
    return this.ops.importStudents(
      file.buffer,
      y,
      classMap,
      dry === '1' || dry === 'true',
      classId || undefined,
    );
  }
}
