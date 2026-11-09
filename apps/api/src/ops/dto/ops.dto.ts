import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
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
