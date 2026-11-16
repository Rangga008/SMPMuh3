import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { CbtService } from './cbt.service';
import {
  AnswerDto,
  CreateExamDto,
  EnterExamDto,
  ExamSessionDto,
  ExamSessionUpdateDto,
  LoginCbtDto,
  UpdateExamDto,
  UpdateGradeDto,
} from './dto/cbt.dto';
import type { QuestionDto } from '../ops/dto/ops.dto';

@Controller({ path: 'cbt', version: '1' })
export class CbtController {
  constructor(private cbt: CbtService) {}

  // ================= Admin / kurikulum / guru (scope mapel) =================

  @Get('exams')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  list(@CurrentUser() u: AuthUser, @Query('academicYearId') y?: string) {
    return this.cbt.listExams(u, y);
  }

  @Post('exams')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateExamDto) {
    return this.cbt.createExam(dto, u.id);
  }

  @Get('exams/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.getExam(id, u);
  }

  @Patch('exams/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto) {
    return this.cbt.updateExam(id, dto, u);
  }

  @Post('exams/:id/regenerate-code')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  regenerateCode(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.regenerateCode(id, u);
  }

  @Delete('exams/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.deleteExam(id, u);
  }

  // ---- Sesi per kelompok rombel ----
  @Post('exams/:id/sessions')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  createSession(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExamSessionDto) {
    return this.cbt.createSession(id, dto, u);
  }
  @Patch('sessions/:sid')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  updateSession(@CurrentUser() u: AuthUser, @Param('sid', ParseUUIDPipe) sid: string, @Body() dto: ExamSessionUpdateDto) {
    return this.cbt.updateSession(sid, dto, u);
  }
  @Delete('sessions/:sid')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  deleteSession(@CurrentUser() u: AuthUser, @Param('sid', ParseUUIDPipe) sid: string) {
    return this.cbt.deleteSession(sid, u);
  }

  // ---- Monitor (semua staf: proktor/pengawas/tendik/guru/admin) ----
  @Get('monitor/exams')
  @RequirePermission(PERMISSIONS.CBT_MONITOR)
  monitorExams(@Query('academicYearId') y?: string) {
    return this.cbt.listMonitorExams(y);
  }
  @Get('exams/:id/monitor')
  @RequirePermission(PERMISSIONS.CBT_MONITOR)
  monitor(@Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.monitor(id);
  }

  // ---- Hasil & analisis per rombel ----
  @Get('exams/:id/results')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  results(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('classId') classId?: string) {
    return this.cbt.results(id, classId, u);
  }
  @Get('exams/:id/analysis')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  analysis(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('classId') classId?: string) {
    return this.cbt.analysis(id, classId, u);
  }
  @Get('exams/:id/answers-matrix')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  matrix(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query('classId') classId: string) {
    if (!classId) throw new BadRequestException('classId wajib untuk rekap jawaban.');
    return this.cbt.answerMatrix(id, classId, u);
  }
  @Get('exams/:id/results.xlsx')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  async resultsExcel(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('classId') classId: string | undefined,
    @Res() res: Response,
  ) {
    const buf = await this.cbt.resultsExcel(id, classId, u);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hasil-ujian-${id.slice(0, 8)}.xlsx"`);
    res.send(buf);
  }
  /** Edit nilai akhir ledger — guru mapel scope / admin-kurikulum. */
  @Patch('exams/:id/grades')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  updateGrade(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGradeDto) {
    return this.cbt.updateGrade(id, dto.studentId, dto.score, u);
  }

  // ---- Soal ujian (4 tipe: PG/PGK/BS/BSK) ----
  @Get('exams/:id/questions')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  questions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.examQuestions(id, u);
  }
  @Put('exams/:id/questions')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  setQuestions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { questions: QuestionDto[] }) {
    return this.cbt.setExamQuestions(id, body.questions ?? [], u);
  }
  @Post('exams/:id/questions/import')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  @UseInterceptors(FileInterceptor('file'))
  importQuestions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File wajib diunggah.');
    return this.cbt.importExamQuestions(id, file, u);
  }

  /** Acak ulang password login satu siswa — cetak ulang kartu setelah ini. */
  @Post('exams/:id/credentials/:studentId/regen')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  regenCredential(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('studentId', ParseUUIDPipe) studentId: string) {
    return this.cbt.regenCredential(id, studentId, u);
  }

  /** Bacaan soal (passthrough ke asesmen terkait). */
  @Get('exams/:id/passages')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  examPassages(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.examPassages(id, u);
  }

  /** Media gambar soal — publik agar <img> di aplikasi siswa langsung tampil. */
  @Get('media/qmedia/:file')
  @Public()
  async media(@Param('file') file: string, @Res() res: Response) {
    const f = await this.cbt.questionMedia(`qmedia/${file}`);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(f.buf);
  }

  // ================= Siswa (publik — kredensial = NIS + kode + token sesi) =================
  // Satu sesi ujian bisa diisi ~180 siswa dari 1 IP publik sekolah (NAT lab),
  // jadi endpoint siswa dikecualikan dari limit 300/menit global — keamanan
  // tetap terjaga karena tiap request wajib token sesi yang tak tertebak.

  /** Login: NIS + password kartu → identitas & ujian terkait (tanpa kode). */
  @Public()
  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginCbtDto) {
    return this.cbt.login(dto);
  }

  /** Masuk ujian: NIS + kode (dari pengawas) + password → token sesi. */
  @Public()
  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Post('enter')
  enter(@Body() dto: EnterExamDto) {
    return this.cbt.enter(dto);
  }

  /** Info sesi untuk halaman persiapan. */
  @Public()
  @SkipThrottle()
  @Get('session/:token')
  session(@Param('token') token: string) {
    return this.cbt.sessionByToken(token);
  }

  /** Daftar soal tanpa kunci + jawaban tersimpan. */
  @Public()
  @SkipThrottle()
  @Get('paper/:token')
  paper(@Param('token') token: string) {
    return this.cbt.paper(token);
  }

  /** Autosave satu jawaban. */
  @Public()
  @SkipThrottle()
  @Post('paper/:token/answer')
  answer(@Param('token') token: string, @Body() dto: AnswerDto) {
    return this.cbt.saveAnswer(token, dto);
  }

  /** Kumpulkan & nilai. */
  @Public()
  @SkipThrottle()
  @Post('paper/:token/submit')
  submit(@Param('token') token: string) {
    return this.cbt.submit(token);
  }

  /** Hasil akhir. */
  @Public()
  @SkipThrottle()
  @Get('result/:token')
  result(@Param('token') token: string) {
    return this.cbt.result(token);
  }
}
