import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EMPLOYEE_TYPES } from '@smpmuh3/types';
import type { EmployeeType } from '@smpmuh3/types';
import type { AssessmentType } from '@prisma/client';

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
