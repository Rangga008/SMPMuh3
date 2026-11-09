import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const emptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

export class CreateDeviceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  serial!: string; // SN mesin — kunci autentikasi iClock

  @IsOptional()
  @IsIn(['ICLOCK', 'PULL', 'MANUAL'])
  mode?: 'ICLOCK' | 'PULL' | 'MANUAL';

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  host?: string; // IP mesin (PULL)

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  commKey?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;
}

export class UpdateDeviceDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  serial?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(['ICLOCK', 'PULL', 'MANUAL'])
  mode?: 'ICLOCK' | 'PULL' | 'MANUAL';

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  host?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  commKey?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PinMapDto {
  @IsString()
  employeeId!: string;

  /** PIN/user id di mesin — kosong/null untuk menghapus pemetaan. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  pin?: string;
}

export class ManualPunchDto {
  @IsString()
  employeeId!: string;

  /** "YYYY-MM-DD HH:mm" atau ISO — waktu tap yang dicatat. */
  @IsString()
  punchedAt!: string;

  @IsOptional()
  @IsIn([0, 1])
  inOut?: 0 | 1; // 0 = masuk, 1 = pulang
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AttendanceSettingsDto {
  @IsOptional()
  @Matches(HHMM, { message: 'Format jam harus HH:mm' })
  workStart?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  lateAfter?: number; // menit toleransi sebelum TELAT

  @IsOptional()
  @Matches(HHMM, { message: 'Format jam harus HH:mm' })
  checkOutFrom?: string;

  @IsOptional()
  @IsBoolean()
  autoDerive?: boolean;

  /** Koordinat sekolah — geofence absen selfie. */
  @IsOptional()
  @IsNumber()
  schoolLat?: number | null;

  @IsOptional()
  @IsNumber()
  schoolLng?: number | null;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  radiusM?: number;
}

/** Absen selfie — pegawai mengirim foto + koordinat sendiri. */
export class SelfiePunchDto {
  @Type(() => Number)
  @IsIn([0, 1])
  inOut!: 0 | 1; // 0 = masuk, 1 = pulang

  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string; // e.g. "Pagi", "Siang", "Jumat Pendek"

  @Matches(HHMM_RE, { message: 'Format jam harus HH:mm' })
  startTime!: string; // jam masuk

  @Matches(HHMM_RE, { message: 'Format jam harus HH:mm' })
  endTime!: string; // jam pulang

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  lateAfter?: number; // toleransi telat (menit) — default 10

  @Matches(HHMM_RE, { message: 'Format jam harus HH:mm' })
  checkOutFrom!: string; // tap pulang sah mulai jam ini
}

export class UpdateShiftDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Matches(HHMM_RE, { message: 'Format jam harus HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(HHMM_RE, { message: 'Format jam harus HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  lateAfter?: number;

  @IsOptional()
  @Matches(HHMM_RE, { message: 'Format jam harus HH:mm' })
  checkOutFrom?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignShiftDto {
  @IsString()
  employeeId!: string;

  @IsString()
  shiftId!: string;

  /** -1 = semua hari; 0=Minggu … 6=Sabtu. */
  @IsInt()
  @Min(-1)
  @Max(6)
  dayOfWeek!: number;
}
