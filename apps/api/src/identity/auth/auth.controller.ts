import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
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
}
