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

export class RequestPasswordOtpDto {
  /** Email atau nomor HP akun — OTP dikirim ke nomor HP akun bila ditemukan. */
  @IsString()
  @Length(3, 160)
  identifier!: string;
}

export class ResetPasswordOtpDto {
  @IsString()
  @Length(3, 160)
  identifier!: string;

  /** OTP 6 digit dari WhatsApp. */
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code harus 6 digit angka' })
  code!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

/** Profil mandiri — pengguna mengubah data akunnya sendiri. */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?\d[\d\s-]{7,18}\d$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ChangeMyPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
