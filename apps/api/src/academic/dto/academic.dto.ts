import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
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
  ValidateIf,
} from 'class-validator';
import { EMPLOYEE_TYPES } from '@smpmuh3/types';
import type { EmployeeType } from '@smpmuh3/types';
import type { AssessmentType } from '@prisma/client';

const emptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

export class EmployeeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nip?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_TYPES)
  type?: EmployeeType;

  /** Jabatan pokok tendik — TU, LAYSUS, SATPAM, KEPALA_SEKOLAH. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  staffKind?: string;

  /** Tugas tambahan — WAKASEK_KURIKULUM, KEPALA_TU, BENDAHARA_BOS, dst. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  additionalDuty?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Bidang tempat pegawai bernaung. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  department?: string;

  /** Kepala bidang — bisa melihat seluruh pegawai di bidangnya. */
  @IsOptional()
  @IsBoolean()
  isDeptHead?: boolean;

  /** Opsional — sekaligus buat akun login untuk pegawai ini. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password?: string;

  /** Opsional — role kerja akun (menentukan akses bidang: spmb, cbt, keuangan, dst). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  roleKey?: string;
}

export class CurriculumDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SubjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  curriculumId?: string;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(9)
  gradeLevel?: number;
}

export class UpdateCurriculumDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  /** Kosongkan deskripsi dengan mengirim null. */
  @IsOptional()
  @ValidateIf((o: UpdateCurriculumDto) => o.description !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  /** Lepas dari kurikulum dengan mengirim null. */
  @IsOptional()
  @ValidateIf((o: UpdateSubjectDto) => o.curriculumId !== null)
  @IsUUID()
  curriculumId?: string | null;

  /** Berlaku semua tingkat dengan mengirim null. */
  @IsOptional()
  @ValidateIf((o: UpdateSubjectDto) => o.gradeLevel !== null)
  @IsInt()
  @Min(7)
  @Max(9)
  gradeLevel?: number | null;
}

export class SemesterDto {
  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name?: string;

  /** Kosongkan tanggal dengan mengirim null. */
  @IsOptional()
  @ValidateIf((o: UpdateSemesterDto) => o.startDate !== null)
  @IsString()
  startDate?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateSemesterDto) => o.endDate !== null)
  @IsString()
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ClassDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name!: string;

  @IsInt()
  @Min(7)
  @Max(9)
  gradeLevel!: number;

  @IsUUID()
  academicYearId!: string;

  @IsOptional()
  @IsUUID()
  homeroomId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  capacity?: number;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(9)
  gradeLevel?: number;

  /** Kosongkan wali kelas dengan mengirim null. */
  @IsOptional()
  @ValidateIf((o: UpdateClassDto) => o.homeroomId !== null)
  @IsUUID()
  homeroomId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  capacity?: number;
}

export class EnrollmentDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  classId!: string;

  @IsUUID()
  academicYearId!: string;
}

export class TeachingAssignmentDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  classId!: string;

  @IsUUID()
  academicYearId!: string;
}

export class ScheduleEntryDto {
  @IsUUID()
  assignmentId!: string;

  @IsInt()
  @Min(1)
  @Max(6)
  day!: number;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  room?: string;
}

export class AssessmentDto {
  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsIn(['FORMATIF', 'SUMATIF', 'PTS', 'PAS'])
  type!: AssessmentType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxScore?: number;
}

export class GradeDto {
  @IsUUID()
  studentId!: string;

  @IsInt()
  @Min(0)
  @Max(1000)
  score!: number;
}

export class CalendarEventDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format tanggal YYYY-MM-DD' })
  date!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @IsIn(['LIBUR', 'KEGIATAN', 'UJIAN', 'LAINNYA'])
  type!: 'LIBUR' | 'KEGIATAN' | 'UJIAN' | 'LAINNYA';

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
}
