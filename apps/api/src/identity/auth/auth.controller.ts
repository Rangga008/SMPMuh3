import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { AuthTokens, AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  ChangeMyPasswordDto,
  ForgotPasswordDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
} from './dto/account.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.register(dto.name, dto.phone, dto.email, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<void> {
    return this.auth.forgotPassword(dto.identifier, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.login(dto.identifier, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMeDto,
  ): Promise<AuthUser> {
    return this.auth.updateMe(user.id, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changeMyPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeMyPasswordDto,
  ): Promise<void> {
    return this.auth.changeMyPassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Get('me/employee')
  myEmployee(@CurrentUser() user: AuthUser) {
    return this.auth.myEmployee(user.id);
  }

  /** Pegawai mengubah kontak/alamatnya sendiri (identitas tetap dikelola admin). */
  @Patch('me/employee')
  updateMyEmployee(
    @CurrentUser() user: AuthUser,
    @Body() dto: { email?: string; phone?: string; address?: string },
  ) {
    return this.auth.updateMyEmployee(user.id, dto);
  }

  @Post('me/employee/photo')
  @UseInterceptors(FileInterceptor('file'))
  uploadMyEmployeePhoto(@CurrentUser() user: AuthUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('File foto wajib.');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      throw new BadRequestException('Foto harus JPG, PNG, atau WebP.');
    }
    return this.auth.uploadMyEmployeePhoto(user.id, file);
  }

  /** Foto profil pegawai — publik agar <img> langsung bisa menampilkannya. */
  @Get('employees/:id/photo')
  @Public()
  async employeePhoto(@Param('id') id: string, @Res() res: Response) {
    const f = await this.auth.employeePhoto(id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(f.buf);
  }
}
