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
  /** Asesmen payung (UTS/UAS/ASAS) — hanya nama periode. */
  @IsUUID()
  assessmentId!: string;

  /** Mapel ujian — model baru: ujian = per-mapel per-jenjang. */
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /** Jenjang sasaran (7/8/9) — diisi otomatis dari rombel bila seragam. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  warnAfter?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  blockAfter?: number;
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
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  gradeLevel?: number;

  @IsOptional()
  @IsBoolean()
  shuffle?: boolean;

  @IsOptional()
  @IsBoolean()
  showScore?: boolean;

  /** Proteksi: pelanggaran ke-N → peringatan ke siswa. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  warnAfter?: number;

  /** Proteksi: pelanggaran ke-N → sesi diblokir (0 = proteksi blokir nonaktif). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  blockAfter?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'CLOSED'])
  status?: 'DRAFT' | 'OPEN' | 'CLOSED';
}

export class LoginCbtDto {
  /** NIS siswa — apa adanya di data siswa. */
  @IsString()
  @IsNotEmpty()
  nis!: string;

  /** Password personal — tercetak di kartu peserta. */
  @IsString()
  @IsNotEmpty()
  password!: string;
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

export class UpdateGradeDto {
  @IsUUID()
  studentId!: string;

  @IsInt()
  @Min(0)
  score!: number;
}
