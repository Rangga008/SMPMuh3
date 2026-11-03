import { IsBoolean, IsDateString, IsInt, IsOptional, Matches, Min } from 'class-validator';

export class CreateAcademicYearDto {
  /** Format: "YYYY/YYYY", e.g. "2026/2027". */
  @Matches(/^\d{4}\/\d{4}$/)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAcademicYearDto {
  @IsOptional()
  @Matches(/^\d{4}\/\d{4}$/)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  titipanOpen?: boolean;

  /** Kuota penerimaan — null = tanpa batas. */
  @IsOptional()
  @IsInt()
  @Min(0)
  quota?: number | null;
}
