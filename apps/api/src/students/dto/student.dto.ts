import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ATTENDANCE_STATUSES, STUDENT_STATUSES } from '@smpmuh3/types';
import type {
  AttendanceStatus,
  Gender,
  StudentStatus,
} from '@smpmuh3/types';

export class CreateStudentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nis?: string;

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'nisn must be 10 digits' })
  nisn?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  birthPlace?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  /** Allow creation despite duplicate-name warnings. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  nis?: string;

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'nisn must be 10 digits' })
  nisn?: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  birthPlace?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: StudentStatus;

  /** Nama orang tua/wali — dibuat/diperbarui lewat data ortu siswa. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  parentName?: string;

  /** No. HP orang tua/wali — dipakai untuk WA gateway & kwitansi. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  parentPhone?: string;
}

export class AchievementDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  level?: string;

  @IsOptional()
  @IsInt()
  @Min(1990)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Dokumen bukti (piagam/foto) — id hasil upload /students/:id/documents. */
  @IsOptional()
  @IsUUID()
  evidenceDocumentId?: string;
}

export class EkskulDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /** Pembina — id pegawai. */
  @IsOptional()
  @IsUUID()
  coachId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  schedule?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class EkskulMemberDto {
  @IsUUID()
  studentId!: string;

  /** Peran pengurus — ketua/sekretaris/dst (kosong = anggota). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  role?: string;
}

export class ViolationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;

  @IsDateString()
  date!: string;

  /** Dokumen bukti — id hasil upload /students/:id/documents. */
  @IsOptional()
  @IsUUID()
  evidenceDocumentId?: string;
}

class AttendanceRecordDto {
  @IsUUID()
  studentId!: string;

  @IsIn(ATTENDANCE_STATUSES)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class MarkAttendanceDto {
  @IsUUID()
  classId!: string;

  @IsDateString()
  date!: string;

  /** Per-student marks. */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}
