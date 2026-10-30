import { IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  /** Email atau nomor HP. */
  @IsString()
  @Length(3, 160)
  identifier!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
