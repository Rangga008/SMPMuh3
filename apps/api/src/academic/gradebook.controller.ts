import {
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
} from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { GradebookService } from './gradebook.service';

class EnsureBookDto {
  @IsUUID() classId!: string;
  @IsUUID() subjectId!: string;
  @IsOptional() @IsUUID() academicYearId?: string;
}

class UpdateBookDto {
  @IsOptional() @IsNumber() @Min(0) avgWeight?: number;
  @IsOptional() @IsBoolean() submit?: boolean;
}

class ColumnDto {
  @IsOptional() @IsIn(['FORMATIF', 'SUMATIF_LM', 'ASAJ', 'CUSTOM']) kind?: 'FORMATIF' | 'SUMATIF_LM' | 'ASAJ' | 'CUSTOM';
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) weight?: number;
  @IsOptional() @IsUUID() examId?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

class EntryDto {
  @IsUUID() studentId!: string;
  @ValidateIf((o) => o.score !== null && o.score !== undefined)
  @IsNumber()
  score!: number | null;
}

class EntriesBody {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntryDto)
  entries!: EntryDto[];
}

const R = PERMISSIONS.ACADEMIC_READ;

@Controller({ version: '1', path: 'grade-books' })
export class GradebookController {
  constructor(private readonly gb: GradebookService) {}

  /** Buku yang bisa diakses user — guru: penugasannya, wali: kelas walinya, kurikulum: semua. */
  @Get()
  @RequirePermission(R)
  listMine(@CurrentUser() u: AuthUser, @Query('academicYearId') academicYearId?: string) {
    return this.gb.listMine(u, academicYearId);
  }

  /** Kelas untuk matriks wali — wali: kelas walinya; kurikulum: semua kelas. */
  @Get('matrix/classes')
  @RequirePermission(R)
  matrixClasses(@CurrentUser() u: AuthUser, @Query('academicYearId') academicYearId?: string) {
    return this.gb.matrixClasses(u, academicYearId);
  }

  /** Matriks siswa × mapel (NR per mapel) — untuk wali kelas / kurikulum. */
  @Get('matrix/:classId')
  @RequirePermission(R)
  matrix(
    @CurrentUser() u: AuthUser,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.gb.classMatrix(u, classId, academicYearId);
  }

  @Post('ensure')
  @RequirePermission(R)
  ensure(@CurrentUser() u: AuthUser, @Body() dto: EnsureBookDto) {
    return this.gb.ensureBook(u, dto);
  }

  @Get(':id')
  @RequirePermission(R)
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gb.getBook(u, id);
  }

  @Patch(':id')
  @RequirePermission(R)
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBookDto) {
    return this.gb.updateBook(u, id, dto);
  }

  @Get(':id/exam-options')
  @RequirePermission(R)
  examOptions(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.gb.examOptions(u, id);
  }

  @Post(':id/columns')
  @RequirePermission(R)
  addColumn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ColumnDto) {
    return this.gb.addColumn(u, id, dto);
  }

  @Patch('columns/:columnId')
  @RequirePermission(R)
  updateColumn(@CurrentUser() u: AuthUser, @Param('columnId', ParseUUIDPipe) columnId: string, @Body() dto: ColumnDto) {
    return this.gb.updateColumn(u, columnId, dto);
  }

  @Delete('columns/:columnId')
  @RequirePermission(R)
  deleteColumn(@CurrentUser() u: AuthUser, @Param('columnId', ParseUUIDPipe) columnId: string) {
    return this.gb.deleteColumn(u, columnId);
  }

  @Put('columns/:columnId/entries')
  @RequirePermission(R)
  setEntries(@CurrentUser() u: AuthUser, @Param('columnId', ParseUUIDPipe) columnId: string, @Body() body: EntriesBody) {
    return this.gb.setEntries(u, columnId, body.entries);
  }

  @Post('columns/:columnId/pull')
  @RequirePermission(R)
  pullExam(@CurrentUser() u: AuthUser, @Param('columnId', ParseUUIDPipe) columnId: string) {
    return this.gb.pullExam(u, columnId);
  }
}
