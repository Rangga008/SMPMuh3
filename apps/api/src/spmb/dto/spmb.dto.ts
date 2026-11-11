import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
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
import { PATHWAYS, REGISTRATION_DOC_TYPES } from '@smpmuh3/types';
import type { RegistrationDocType } from '@smpmuh3/types';

export class CreateCandidateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsNotEmpty({ message: 'name wajib diisi' })
  name!: string;

  @IsIn(['MALE', 'FEMALE'])
  @IsNotEmpty({ message: 'gender wajib dipilih' })
  gender!: 'MALE' | 'FEMALE';

  @IsDateString()
  @IsNotEmpty({ message: 'birthDate wajib diisi' })
  birthDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @IsNotEmpty({ message: 'previousSchool wajib diisi' })
  previousSchool!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @IsNotEmpty({ message: 'birthPlace wajib diisi' })
  birthPlace!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsNotEmpty({ message: 'motherName wajib diisi' })
  motherName!: string;

  @emptyToUndefined()
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'nisn harus 10 digit' })
  nisn?: string;

  @Matches(/^\d{16}$/, { message: 'nik harus 16 digit angka' })
  @IsNotEmpty({ message: 'nik wajib diisi' })
  nik!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  tkaScore?: number;
}

export class UpdateCandidateDto extends CreateCandidateDto {}

export class CreateRegistrationDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  waveId!: string;
}

export class UpdateRegistrationDto {
  @IsOptional()
  @IsIn(PATHWAYS)
  pathway?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pathwayDetail?: string;

  @IsOptional()
  @IsObject()
  formAnswers?: Record<string, string>;
}

export class StatusLookupDto {
  @IsString()
  @Length(6, 40)
  number!: string;
}

export type { RegistrationDocType };
export { REGISTRATION_DOC_TYPES };

export class UploadDocumentDto {
  @IsEnum(REGISTRATION_DOC_TYPES, {
    message: `type must be one of ${REGISTRATION_DOC_TYPES.join(', ')}`,
  })
  type!: RegistrationDocType;
}

// ---------- Admin: pembayaran ----------

export class VerifyPaymentDto {
  @IsIn(['confirm', 'reject'])
  action!: 'confirm' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateInvoiceDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsIn([
    'registration_fee',
    'dsp_dp',
    'dsp',
    'spp',
    'seragam',
    'installment',
    'other',
  ])
  kind?: string;

  @IsOptional()
  @IsBoolean()
  applyDiscount?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class InstallmentPlanDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  totalAmount!: number;

  @IsInt()
  @Min(2)
  @Max(24)
  count!: number;

  @IsOptional()
  @IsBoolean()
  applyDiscount?: boolean;
}

export class PsikotesDto {
  @IsOptional()
  @IsDateString()
  psikotesAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class DiscountDto {
  @IsInt()
  @Min(0)
  @Max(100)
  percent!: number;
}

// ---------- Admin: pengaturan ----------

export class SaveWaveDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsDateString()
  psikotesAt?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  psikotesNote?: string;
}

export class UpdateFeeDto {
  @IsInt()
  @Min(0)
  amount!: number;
}

export class CreateFeeDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  key?: string;

  @IsInt()
  @Min(0)
  amount!: number;
}

export class SaveDiscountDto {
  @IsString()
  @MaxLength(120)
  label!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  percent!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Grup jalur prestasi di formulir ortu. */
  @IsOptional()
  @IsIn(['akademik', 'non_akademik', 'alumni_sdm'])
  category?: string;
}

export class SaveQuestionDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  helpText?: string;

  @IsOptional()
  @IsIn(['text', 'textarea', 'date', 'number', 'select'])
  fieldType?: string;

  @IsOptional()
  options?: string[];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ---------- Daftar titipan / waiting list ----------

export class GuestTitipanDto {
  @IsUUID()
  @IsNotEmpty({ message: 'academicYearId wajib dipilih' })
  academicYearId!: string;

  /** Gelombang sasaran — opsional; default gelombang aktif pertama TA tsb. */
  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  waveId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  @IsNotEmpty({ message: 'candidateName wajib diisi' })
  candidateName!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  birthPlace?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  previousSchool?: string;

  @emptyToUndefined()
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  @Matches(/^(?:\+?62|0)8\d{6,13}$/, {
    message:
      'guardianPhone bukan nomor HP Indonesia yang valid — contoh 0812xxxxxxx',
  })
  @IsNotEmpty({ message: 'guardianPhone wajib diisi' })
  guardianPhone!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  infoSource?: string;

  /** Honeypot anti-spam — harus kosong. */
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  website?: string;
}

export class ParentTitipanDto {
  @IsUUID()
  candidateId!: string;

  @IsUUID()
  academicYearId!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  waveId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  guardianPhone?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  infoSource?: string;
}

export class RedeemTitipanDto {
  @IsString()
  @Length(4, 40)
  formCode!: string;

  /**
   * Opsional — kode terkunci ke kandidat dari titipannya. Bila titipan
   * belum tertaut kandidat (titipan tamu), kandidat dibuat otomatis
   * dari data titipan — ortu tak perlu memilih.
   */
  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsUUID()
  waveId?: string;
}

/**
 * Daftar akun + pendaftaran sekaligus lewat kode formulir titipan
 * (alur utama): kode unik + No. HP sesuai titipan + kata sandi baru.
 * HP yang sudah punya akun → kata sandi harus cocok akun tsb.
 */
export class DaftarByCodeDto {
  @IsString()
  @Length(4, 40)
  formCode!: string;

  @IsString()
  @MinLength(9)
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}

/** Aksi massal admin titipan — verifikasi, kirim kode, ubah status, batalkan, hapus. */
export class BulkTitipanDto {
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsIn(['approve', 'send_code', 'status', 'cancel', 'delete'])
  action!: 'approve' | 'send_code' | 'status' | 'cancel' | 'delete';

  /** Wajib bila action=status — tujuan status baru. */
  @emptyToUndefined()
  @IsOptional()
  @IsIn(['PENDING', 'WAITING', 'CANCELLED'])
  status?: 'PENDING' | 'WAITING' | 'CANCELLED';

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminTitipanNoteDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Tugaskan gelombang ke entri — null/'' untuk melepas gelombang. */
  @IsOptional()
  waveId?: string | null;

  /** Ubah status manual — REGISTERED tidak bisa diubah/dituju manual. */
  @emptyToUndefined()
  @IsOptional()
  @IsIn(['PENDING', 'WAITING', 'CODE_SENT', 'CANCELLED'])
  status?: 'PENDING' | 'WAITING' | 'CODE_SENT' | 'CANCELLED';
}

/** Konfigurasi gateway WhatsApp — token write-only (tidak pernah dikembalikan). */
export class WaSettingsUpdateDto {
  @emptyToUndefined()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  enabled?: boolean;

  @emptyToUndefined()
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(200)
  gatewayUrl?: string;

  /** Kirim "" untuk menghapus token; abaikan field untuk tidak mengubah. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  gatewayToken?: string;

  @emptyToUndefined()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(3)
  @Max(300)
  intervalSeconds?: number;

  @emptyToUndefined()
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(5000)
  dailyLimit?: number;
}
