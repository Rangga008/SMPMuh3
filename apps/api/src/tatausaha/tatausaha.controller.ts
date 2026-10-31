import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '@smpmuh3/types';
import { PERMISSIONS } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import {
  ExamRecordDto,
  LetterDto,
  MutationDto,
  UpdateExamRecordDto,
  UpdateLetterDto,
  UpdateMutationDto,
} from './dto/tatausaha.dto';
import { TatausahaService } from './tatausaha.service';

const R = PERMISSIONS.TATAUSAHA_READ;
const M = PERMISSIONS.TATAUSAHA_MANAGE;

@Controller({ path: 'tu', version: '1' })
export class TatausahaController {
  constructor(private readonly tu: TatausahaService) {}

  // ---------- Surat menyurat ----------
  @Get('letters')
  @RequirePermission(R)
  letters(
    @Query('direction') direction?: 'IN' | 'OUT',
    @Query('search') search?: string,
  ) {
    return this.tu.listLetters(direction, search);
  }

  @Post('letters')
  @RequirePermission(M)
  createLetter(@CurrentUser() u: AuthUser, @Body() dto: LetterDto) {
    return this.tu.createLetter(dto, u.id);
  }

  @Patch('letters/:id')
  @RequirePermission(M)
  updateLetter(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateLetterDto) {
    return this.tu.updateLetter(id, dto, u.id);
  }

  @Delete('letters/:id')
  @RequirePermission(M)
  deleteLetter(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tu.deleteLetter(id, u.id);
  }

  @Post('letters/:id/file')
  @RequirePermission(M)
  @UseInterceptors(FileInterceptor('file'))
  uploadLetterFile(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    return this.tu.uploadLetterFile(id, file, u.id);
  }

  @Get('letters/:id/file')
  @RequirePermission(R)
  async getLetterFile(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buf, mime, name } = await this.tu.getLetterFile(id);
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    return new StreamableFile(buf);
  }

  // ---------- Mutasi siswa ----------
  @Get('mutations')
  @RequirePermission(R)
  mutations(
    @Query('direction') direction?: 'IN' | 'OUT',
    @Query('search') search?: string,
  ) {
    return this.tu.listMutations(direction, search);
  }

  @Post('mutations')
  @RequirePermission(M)
  createMutation(@CurrentUser() u: AuthUser, @Body() dto: MutationDto) {
    return this.tu.createMutation(dto, u.id);
  }

  @Patch('mutations/:id')
  @RequirePermission(M)
  updateMutation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateMutationDto) {
    return this.tu.updateMutation(id, dto, u.id);
  }

  @Delete('mutations/:id')
  @RequirePermission(M)
  deleteMutation(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tu.deleteMutation(id, u.id);
  }

  // ---------- Ujian Sekolah ----------
  @Get('exam-records')
  @RequirePermission(R)
  examRecords(
    @Query('period') period?: 'US1' | 'US2',
    @Query('academicYearId') academicYearId?: string,
    @Query('search') search?: string,
  ) {
    return this.tu.listExamRecords(period, academicYearId, search);
  }

  @Post('exam-records')
  @RequirePermission(M)
  createExamRecord(@CurrentUser() u: AuthUser, @Body() dto: ExamRecordDto) {
    return this.tu.createExamRecord(dto, u.id);
  }

  @Patch('exam-records/:id')
  @RequirePermission(M)
  updateExamRecord(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateExamRecordDto) {
    return this.tu.updateExamRecord(id, dto, u.id);
  }

  @Delete('exam-records/:id')
  @RequirePermission(M)
  deleteExamRecord(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tu.deleteExamRecord(id, u.id);
  }
}
