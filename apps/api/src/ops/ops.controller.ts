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
import {
  CollectionDto,
  ExamRoomDto,
  ExamSeatDto,
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
  /** Template Excel import soal — kolom sesuai parser di questions/import. */
  @Get('assessments/:id/questions/template')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  questionsTemplate(@Res() res: Response) {
    const ws = XLSX.utils.aoa_to_sheet([
      ['TEMPLATE IMPORT SOAL — isi mulai BARIS 5 (baris keterangan & contoh jangan diubah)'],
      ['Tipe : PG = pilihan ganda · PGK = pilihan ganda kompleks (centang ≥1) · BS = benar/salah · JODOH = menjodohkan'],
      ['Kunci: PG → satu huruf (A) · PGK → huruf dipisah koma (A,C) · BS → B atau S · JODOH → nomor pasangan dipisah koma (2,1,3)'],
      [],
      ['No', 'Tipe', 'Soal', 'A', 'B', 'C', 'D', 'E', 'Pasangan (JODOH — pisahkan ;)', 'Kunci', 'Bobot'],
      ['CONTOH 1 (hapus)', 'PG', 'Ibu kota Indonesia adalah…', 'Surabaya', 'Bandung', 'Jakarta', 'Medan', '', '', 'C', '1'],
      ['CONTOH 2 (hapus)', 'PGK', 'Pilih semua bilangan prima:', '2', '4', '5', '9', '', '', 'A,C', '2'],
      ['CONTOH 3 (hapus)', 'BS', 'Indonesia merdeka tahun 1945.', '', '', '', '', '', '', 'B', '1'],
      ['CONTOH 4 (hapus)', 'JODOH', 'Jodohkan negara dengan ibu kotanya:', 'Indonesia', 'Jepang', 'Mesir', '', '', 'Tokyo;Kairo;Jakarta', '3,1,2', '3'],
    ]);
    ws['!cols'] = [
      { wch: 4 }, { wch: 7 }, { wch: 44 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 8 }, { wch: 6 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    const guide = XLSX.utils.json_to_sheet([
      { kolom: 'No', wajib: 'YA', keterangan: 'Nomor urut soal — mulai 1, jangan dobel' },
      { kolom: 'Tipe', wajib: 'YA', keterangan: 'PG / PGK / BS / JODOH — juga menerima MCQ / MCQ_COMPLEX / TRUE_FALSE / MATCHING' },
      { kolom: 'Soal', wajib: 'YA', keterangan: 'Teks pertanyaan' },
      { kolom: 'A–E', wajib: 'PG & PGK', keterangan: 'Pilihan jawaban (min. 2, maks. 5) — untuk JODOH diisi pernyataan sisi kiri' },
      { kolom: 'Pasangan', wajib: 'JODOH', keterangan: 'Pilihan sisi kanan dipisah titik-koma — contoh: Tokyo;Kairo;Jakarta' },
      { kolom: 'Kunci', wajib: 'YA', keterangan: 'PG: satu huruf · PGK: huruf-koma (A,C) · BS: B/S · JODOH: nomor pasangan-koma (2,1,3)' },
      { kolom: 'Bobot', wajib: 'tidak', keterangan: 'Bobot nilai soal — kosong = 1' },
    ]);
    guide['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="template-soal.xlsx"');
    res.send(buf);
  }

  /** Import soal dari Excel/CSV — mengganti seluruh butir asesmen. */
  @Post('assessments/:id/questions/import')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  async importQuestions(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      throw new BadRequestException('Hanya file Excel (.xlsx/.xls) atau CSV.');
    }
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File tidak dapat dibaca.');
    }
    const ws = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!ws) throw new BadRequestException('File tidak punya sheet.');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    // Cari baris header (kolom pertama = "No").
    const hi = rows.findIndex((r) => String(r[0] ?? '').trim().toLowerCase() === 'no');
    if (hi < 0) throw new BadRequestException('Kolom header tidak ditemukan — pakai template yang disediakan.');
    const typeOf = (v: string) => {
      const t = v.toUpperCase().replace(/[\s-]+/g, '_');
      if (/^(PG|MCQ|PILIHAN_GANDA)$/.test(t)) return 'MCQ';
      if (/^(PGK|MCQ_COMPLEX|PILIHAN_GANDA_KOMPLEKS)/.test(t)) return 'MCQ_COMPLEX';
      if (/^(BS|B_S|TRUE_FALSE|BENAR_SALAH)/.test(t)) return 'TRUE_FALSE';
      if (/^(JODOH|MATCHING|MENJODOHKAN)/.test(t)) return 'MATCHING';
      return '';
    };
    const letterIdx = (s: string) => 'ABCDE'.indexOf(s.trim().toUpperCase());
    const questions: QuestionDto[] = [];
    const errors: string[] = [];
    rows.slice(hi + 1).forEach((r, i) => {
      const line = hi + 2 + i;
      const no = Number(String(r[0] ?? '').trim());
      const cells = (j: number) => String(r[j] ?? '').trim();
      if (!cells(0) && !cells(1) && !cells(2)) return; // baris kosong
      if (/^contoh/i.test(cells(0))) return; // baris contoh template
      const type = typeOf(cells(1));
      const prompt = cells(2);
      if (!Number.isInteger(no) || no < 1) { errors.push(`Baris ${line}: nomor soal tidak valid.`); return; }
      if (!type) { errors.push(`Baris ${line}: tipe "${cells(1)}" tidak dikenal (PG/PGK/BS/JODOH).`); return; }
      if (!prompt) { errors.push(`Baris ${line}: teks soal kosong.`); return; }
      const weight = Math.max(1, Math.round(Number(cells(10)) || 1));
      const choices = [3, 4, 5, 6, 7].map((j) => cells(j)).filter(Boolean);
      let options: unknown;
      let key: unknown;
      if (type === 'MCQ' || type === 'MCQ_COMPLEX') {
        if (choices.length < 2) { errors.push(`Baris ${line}: pilihan jawaban minimal 2.`); return; }
        options = { choices };
        const letters = cells(9).split(/[,;\s]+/).filter(Boolean);
        const idx = letters.map(letterIdx).filter((x) => x >= 0 && x < choices.length);
        if (type === 'MCQ') {
          if (idx.length !== 1) { errors.push(`Baris ${line}: kunci PG harus tepat satu huruf A–E.`); return; }
          key = idx[0];
        } else {
          if (idx.length < 1) { errors.push(`Baris ${line}: kunci PGK minimal satu huruf.`); return; }
          key = [...new Set(idx)];
        }
      } else if (type === 'TRUE_FALSE') {
        const k = cells(9).toUpperCase();
        if (!/^(B|BENAR|S|SALAH|TRUE|FALSE)$/.test(k)) {
          errors.push(`Baris ${line}: kunci BS harus B/Benar atau S/Salah.`); return;
        }
        key = /^(B|BENAR|TRUE)$/.test(k);
      } else {
        // MATCHING — A–E = sisi kiri, Pasangan = sisi kanan (;), kunci = nomor pasangan.
        const rights = cells(8).split(';').map((s) => s.trim()).filter(Boolean);
        if (choices.length < 1 || rights.length < 1) {
          errors.push(`Baris ${line}: JODOH butuh kolom A–E (kiri) dan Pasangan (kanan).`); return;
        }
        const nums = cells(9).split(/[,;\s]+/).filter(Boolean).map(Number);
        if (nums.length !== choices.length || nums.some((n) => !Number.isInteger(n) || n < 1 || n > rights.length)) {
          errors.push(`Baris ${line}: kunci JODOH = nomor pasangan per item kiri (1..${rights.length}), dipisah koma.`); return;
        }
        options = { pairs: choices.map((left, j) => ({ left, right: rights[nums[j]! - 1]! })) , rights };
        key = nums.map((n) => n - 1);
      }
      questions.push({ number: no, type: type as QuestionDto['type'], weight, prompt, options, key });
    });
    if (errors.length) throw new BadRequestException(errors.slice(0, 8).join(' '));
    if (!questions.length) throw new BadRequestException('Tidak ada baris soal yang valid.');
    const dup = new Set<number>();
    for (const q of questions) {
      if (dup.has(q.number)) throw new BadRequestException(`Nomor soal ${q.number} ganda.`);
      dup.add(q.number);
    }
    return this.ops.setQuestions(id, questions);
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
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  myToday(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.ops.teacherToday(u.id, date);
  }
  @Get('attendance/class')
  @RequirePermission(PERMISSIONS.ATTENDANCE_READ)
  classAttendance(@Query('classId') c: string, @Query('date') d: string) {
    return this.ops.classAttendance(c, d);
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
