import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
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
import { PATHWAYS, PRESTASI_SUBTYPES, REGISTRATION_DOC_TYPES } from '@smpmuh3/types';
import type { RegistrationDocType } from '@smpmuh3/types';

export class CreateCandidateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsIn(['MALE', 'FEMALE'])
  gender!: 'MALE' | 'FEMALE';

  @IsDateString()
  birthDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  previousSchool!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  birthPlace?: string;

  @emptyToUndefined()
  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'nisn must be 10 digits' })
  nisn?: string;

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
  @IsIn(PRESTASI_SUBTYPES)
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
