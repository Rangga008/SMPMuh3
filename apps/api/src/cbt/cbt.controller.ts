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
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { Public } from '../identity/decorators/public.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { CbtService } from './cbt.service';
import { AnswerDto, CreateExamDto, EnterExamDto, UpdateExamDto } from './dto/cbt.dto';

@Controller({ path: 'cbt', version: '1' })
export class CbtController {
  constructor(private cbt: CbtService) {}

  // ================= Admin / kurikulum =================

  @Get('exams')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  list(@Query('academicYearId') y?: string) {
    return this.cbt.listExams(y);
  }

  @Post('exams')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateExamDto) {
    return this.cbt.createExam(dto, u.id);
  }

  @Get('exams/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_READ)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.getExam(id);
  }

  @Patch('exams/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamDto) {
    return this.cbt.updateExam(id, dto, u.id);
  }

  @Post('exams/:id/regenerate-code')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  regenerateCode(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.regenerateCode(id, u.id);
  }

  @Delete('exams/:id')
  @RequirePermission(PERMISSIONS.ACADEMIC_MANAGE)
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cbt.deleteExam(id, u.id);
  }

  // ================= Siswa (publik — kredensial = NIS + kode + token sesi) =================

  /** Masuk: NIS + kode → token sesi + info persiapan. */
  @Public()
  @Post('enter')
  enter(@Body() dto: EnterExamDto) {
    return this.cbt.enter(dto);
  }

  /** Info sesi untuk halaman persiapan. */
  @Public()
  @Get('session/:token')
  session(@Param('token') token: string) {
    return this.cbt.sessionByToken(token);
  }

  /** Daftar soal tanpa kunci + jawaban tersimpan. */
  @Public()
  @Get('paper/:token')
  paper(@Param('token') token: string) {
    return this.cbt.paper(token);
  }

  /** Autosave satu jawaban. */
  @Public()
  @Post('paper/:token/answer')
  answer(@Param('token') token: string, @Body() dto: AnswerDto) {
    return this.cbt.saveAnswer(token, dto);
  }

  /** Kumpulkan & nilai. */
  @Public()
  @Post('paper/:token/submit')
  submit(@Param('token') token: string) {
    return this.cbt.submit(token);
  }

  /** Hasil akhir. */
  @Public()
  @Get('result/:token')
  result(@Param('token') token: string) {
    return this.cbt.result(token);
  }
}
