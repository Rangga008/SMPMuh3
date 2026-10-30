import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  name!: string;

  /** Nomor HP wajib — dipakai untuk login & pengiriman kwitansi. */
  @IsString()
  @Matches(/^\+?\d[\d\s-]{7,18}\d$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class ForgotPasswordDto {
  /** Email atau nomor HP akun. */
  @IsString()
  @Length(3, 160)
  identifier!: string;
}

export class ResetPasswordDto {
  @IsString()
  @Length(32, 128)
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
