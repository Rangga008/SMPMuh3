import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsIn(['MALE', 'FEMALE'])
  gender?: 'MALE' | 'FEMALE';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  birthPlace?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'nisn must be 10 digits' })
  nisn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  previousSchool?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class UpdateCandidateDto extends CreateCandidateDto {}

export class UpdateRegistrationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  pathway!: string;
}

export class StatusLookupDto {
  @IsString()
  @Length(6, 40)
  number!: string;

  @IsString()
  @Length(3, 160)
  email!: string;
}

/** Document types allowed for registration uploads. */
export const REGISTRATION_DOC_TYPES = [
  'form',
  'kk',
  'akta',
  'ijazah',
  'foto',
  'lainnya',
] as const;

export type RegistrationDocType = (typeof REGISTRATION_DOC_TYPES)[number];

export class UploadDocumentDto {
  @IsEnum(REGISTRATION_DOC_TYPES, {
    message: `type must be one of ${REGISTRATION_DOC_TYPES.join(', ')}`,
  })
  type!: RegistrationDocType;
}
