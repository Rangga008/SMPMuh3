import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const emptyToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

export class LetterDto {
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  number!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  party?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class UpdateLetterDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  number?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject?: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  party?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}

export class MutationDto {
  @IsIn(['IN', 'OUT'])
  direction!: 'IN' | 'OUT';

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  studentName!: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nisn?: string | null;

  @IsDateString()
  date!: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  school?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  letterNumber?: string | null;

  @IsOptional()
  @IsIn(['PROCESS', 'DONE', 'CANCELLED'])
  status?: 'PROCESS' | 'DONE' | 'CANCELLED';

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateMutationDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  studentName?: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nisn?: string | null;

  @IsOptional()
  @IsDateString()
  date?: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  school?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  letterNumber?: string | null;

  @IsOptional()
  @IsIn(['PROCESS', 'DONE', 'CANCELLED'])
  status?: 'PROCESS' | 'DONE' | 'CANCELLED';

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class ExamRecordDto {
  @IsIn(['US1', 'US2'])
  period!: 'US1' | 'US2';

  @IsUUID()
  academicYearId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  studentName!: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nisn?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsIn(['PENDING', 'PASSED', 'FAILED'])
  result?: 'PENDING' | 'PASSED' | 'FAILED';

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

export class UpdateExamRecordDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  studentName?: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nisn?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  score?: number | null;

  @IsOptional()
  @IsIn(['PENDING', 'PASSED', 'FAILED'])
  result?: 'PENDING' | 'PASSED' | 'FAILED';

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
