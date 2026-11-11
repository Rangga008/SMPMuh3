import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleBlockDto {
  @IsString() @IsNotEmpty() label!: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) day?: number;
  @IsOptional() @IsString() date?: string; // ISO — tanggal spesifik
  @IsInt() @Min(0) @Max(1439) startMinute!: number;
  @IsInt() @Min(1) @Max(1440) endMinute!: number;
  @IsUUID() academicYearId!: string;
}

export class QuestionDto {
  @IsInt() @Min(1) number!: number;
  @IsString() type!: 'MCQ' | 'MCQ_COMPLEX' | 'TRUE_FALSE' | 'MATCHING';
  @IsOptional() @IsInt() @Min(1) weight?: number;
  @IsOptional() key?: unknown;
  @IsOptional() @IsString() prompt?: string;
}

export class AnswerRowDto {
  @IsUUID() studentId!: string;
  @IsOptional() answer?: unknown;
  @IsInt() @Min(0) score!: number;
  @IsOptional() @IsBoolean() isCorrect?: boolean;
}

export class SaveAnswersDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerRowDto)
  rows!: AnswerRowDto[];
}

export class AttendanceRowDto {
  @IsUUID() studentId!: string;
  @IsString() status!: 'PRESENT' | 'SICK' | 'PERMIT' | 'ABSENT';
  @IsOptional() @IsString() note?: string;
}

export class SaveAttendanceDto {
  @IsUUID() classId!: string;
  @IsString() date!: string; // YYYY-MM-DD
  @IsArray() @ValidateNested({ each: true }) @Type(() => AttendanceRowDto)
  rows!: AttendanceRowDto[];
}

export class CollectionDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() deadlineAt?: string;
  @IsOptional() @IsUUID() academicYearId?: string;
  @IsArray() @IsUUID('4', { each: true }) employeeIds!: string[];
}

export class SubmissionDto {
  @IsString() @IsNotEmpty() department!: string;
  @IsString() @IsNotEmpty() kind!: string; // RKS|PROKER|RENCANA|REALISASI
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() rab?: unknown;
  @IsOptional() @IsInt() amountTotal?: number;
}

export class ReviewDto {
  @IsString() action!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() note?: string;
}

export class ExamRoomDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() period!: string;
  @IsUUID() academicYearId!: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
}

export class ExamSeatDto {
  @IsUUID() studentId!: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsInt() seatNo?: number;
}

export class UniformDayDto {
  @IsInt() @Min(1) @Max(7) day!: number;
  @IsString() @IsNotEmpty() name!: string;
  @IsOptional() @IsString() note?: string;
}

// ---- Sarpras ----
export class SaranaTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(80) label!: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}
export class SaranaTypeUpdateDto {
  @IsOptional() @IsString() @MaxLength(80) label?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class SaranaItemDto {
  @IsUUID() typeId!: string;
  /** Letak — nama rombel/kelas (dipilih dari data rombel) atau teks bebas. */
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  /** Kepemilikan — Milik / Bukan Milik / Sewa / Hibah / dst. */
  @IsOptional() @IsString() @MaxLength(60) ownership?: string;
  @IsOptional() @IsString() @MaxLength(300) spec?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) qty?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) good?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bad?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class SaranaItemUpdateDto {
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsString() @MaxLength(60) ownership?: string;
  @IsOptional() @IsString() @MaxLength(300) spec?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) qty?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) good?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) bad?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PrasaranaDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) length?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) width?: number;
  @IsOptional() @IsString() @MaxLength(60) ownership?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class PrasaranaUpdateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) length?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) width?: number;
  @IsOptional() @IsString() @MaxLength(60) ownership?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
