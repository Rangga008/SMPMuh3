import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
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

const emptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  );

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isMonth = () => Matches(MONTH_RE, { message: 'format bulan harus YYYY-MM' });

// ---------- Pay scale ----------

export class PayScaleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsInt()
  @Min(0)
  minYears!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxYears?: number;

  @IsInt()
  @Min(0)
  hourlyRate!: number;

  @IsInt()
  @Min(0)
  transportRate!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePayScaleDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  minYears?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxYears?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRate?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  transportRate?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Pengaturan payroll pegawai — dipisah dari EmployeeDto utama. */
export class EmployeePayrollSettingsDto {
  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  payScaleId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  workStartDate?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10080)
  weeklyRequiredMinutes?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  hourlyRate?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  transportRate?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isCertified?: boolean;
}

// ---------- Absensi ----------

export class AttendanceEntryDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['HADIR', 'TELAT', 'IZIN', 'SAKIT', 'ALPHA'])
  status!: 'HADIR' | 'TELAT' | 'IZIN' | 'SAKIT' | 'ALPHA';

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  teachingMinutes?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class BulkAttendanceDto {
  @IsDateString()
  date!: string;

  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  @IsArray()
  @ArrayMinSize(1)
  entries!: AttendanceEntryDto[];
}

// ---------- Honor ----------

export class HonorTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsIn(['MONTHLY', 'PER_SESSION', 'ONE_TIME'])
  period!: 'MONTHLY' | 'PER_SESSION' | 'ONE_TIME';

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultAmount?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key?: string;
}

export class EmployeeHonorDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  honorTypeId!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  sessions?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  eventName?: string;

  @emptyToUndefined()
  @IsOptional()
  @isMonth()
  eventMonth?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  validFrom?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  validTo?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Potongan ----------

export class DeductionTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  defaultAmount?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  key?: string;
}

export class EmployeeDeductionDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  deductionTypeId!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  @emptyToUndefined()
  @IsOptional()
  @isMonth()
  month?: string; // "YYYY-MM" utk sekali; null/kosong = tiap bulan

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Pinjaman ----------

export class CreateLoanDto {
  @IsUUID()
  employeeId!: string;

  @IsIn(['KASBON', 'KOOPERASI', 'EKSTERNAL'])
  source!: 'KASBON' | 'KOOPERASI' | 'EKSTERNAL';

  @IsInt()
  @Min(1)
  principal!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  fee?: number;

  @IsInt()
  @Min(1)
  @Max(120)
  installments!: number;

  @isMonth()
  startMonth!: string; // "YYYY-MM" mulai dipotong

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  cashAccountId?: string; // wajib utk KASBON (kas sumber dana)

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateLoanDto {
  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyAmount?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(0)
  remaining?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  note?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(['ACTIVE', 'PAID_OFF', 'CANCELLED'])
  status?: 'ACTIVE' | 'PAID_OFF' | 'CANCELLED';
}

// ---------- Honor BOS ----------

export class BosHonorDto {
  @IsUUID()
  employeeId!: string;

  @isMonth()
  month!: string; // "YYYY-MM"

  @IsInt()
  @Min(0)
  amount!: number;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  certified?: boolean;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

// ---------- Payroll run ----------

export class CreatePayrollRunDto {
  @isMonth()
  month!: string; // "YYYY-MM"

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  weeks?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PayRunDto {
  @IsUUID()
  cashAccountId!: string;
}

export class PayrollSettingsDto {
  /** Potongan tetap per hari telat (Rp) — 0 = nonaktif. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  lateDeductionPerDay?: number;

  /** Potongan per menit keterlambatan (Rp) — 0 = nonaktif. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  lateDeductionPerMin?: number;
}
