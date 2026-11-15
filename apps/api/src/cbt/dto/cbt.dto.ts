import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateExamDto {
  @IsUUID()
  assessmentId!: string;

  /** Kelas yang boleh ikut — minimal satu. */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  classIds!: string[];

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsInt()
  @Min(5)
  @Max(600)
  durationMin!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;

  @IsOptional()
  @IsBoolean()
  showScore?: boolean;
}

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  durationMin?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  classIds?: string[];

  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;

  @IsOptional()
  @IsBoolean()
  showScore?: boolean;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'CLOSED'])
  status?: 'DRAFT' | 'OPEN' | 'CLOSED';
}

export class EnterExamDto {
  /** NIS siswa — apa adanya di data siswa. */
  @IsString()
  @IsNotEmpty()
  nis!: string;

  /** Kode ujian — dibagikan pengawas. */
  @IsString()
  @IsNotEmpty()
  code!: string;

  /** Password personal — tercetak di kartu peserta. */
  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class AnswerDto {
  @IsUUID()
  questionId!: string;

  /** Bentuk tergantung tipe soal: index, array index, boolean, array boolean (BSK), atau peta jodoh. */
  @IsOptional()
  answer?: unknown;
}

/** Sesi ujian untuk kelompok rombel — mis. "Sesi 1" untuk 7A–7C. */
export class ExamSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  classIds!: string[];

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;
}

export class ExamSessionUpdateDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40)
  name?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true })
  classIds?: string[];

  @IsOptional() @IsDateString()
  startAt?: string;

  @IsOptional() @IsDateString()
  endAt?: string;
}

export class UpdateGradeDto {
  @IsUUID()
  studentId!: string;

  @IsInt()
  @Min(0)
  score!: number;
}
