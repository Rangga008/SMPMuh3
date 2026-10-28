import { IsBoolean, IsDateString, IsOptional, Matches } from 'class-validator';

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
