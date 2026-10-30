import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequirePermission } from './decorators/require-permission.decorator';
import { UsersService, normalizePhone } from './users/users.service';

const emptyToUndefined = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

export class CreateStaffUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @emptyToUndefined()
  @IsOptional()
  @IsEmail()
  email?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  roleIds!: string[];
}

export class UpdateStaffUserDto {
  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @emptyToUndefined()
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @emptyToUndefined()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @emptyToUndefined()
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';

  @emptyToUndefined()
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;
}

/**
 * Manajemen akun staf operasional & pegawai — terpisah dari akun
 * orang tua SPMB (yang dikelola di modul SPMB).
 */
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission(PERMISSIONS.IDENTITY_USER_READ)
  list() {
    return this.users.listStaff();
  }

  @Post()
  @RequirePermission(PERMISSIONS.IDENTITY_USER_MANAGE)
  async create(@Body() dto: CreateStaffUserDto, @CurrentUser() me: AuthUser) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email atau nomor HP wajib diisi salah satu.');
    }
    const identifier = dto.email
      ? await this.users.findByEmail(dto.email.toLowerCase())
      : dto.phone
        ? await this.users.findByPhone(normalizePhone(dto.phone))
        : null;
    if (identifier) {
      throw new BadRequestException('Email/HP sudah dipakai akun lain.');
    }
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.users.createStaff({
      name: dto.name.trim(),
      email: dto.email?.toLowerCase(),
      phone: dto.phone ? normalizePhone(dto.phone) : undefined,
      passwordHash,
      roleIds: dto.roleIds,
    });
    await this.audit.log({
      actorId: me.id,
      action: 'admin.user.create',
      entity: 'user',
      entityId: user.id,
      metadata: { name: user.name },
    });
    return user;
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.IDENTITY_USER_MANAGE)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffUserDto,
    @CurrentUser() me: AuthUser,
  ) {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundException('Akun tidak ditemukan');
    const updated = await this.users.updateUser(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.email !== undefined ? { email: dto.email?.toLowerCase() ?? null } : {}),
      ...(dto.phone !== undefined
        ? { phone: dto.phone ? normalizePhone(dto.phone) : null }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    });
    const result = dto.roleIds
      ? await this.users.setRoles(id, dto.roleIds)
      : updated;
    await this.audit.log({
      actorId: me.id,
      action: 'admin.user.update',
      entity: 'user',
      entityId: id,
    });
    return result;
  }

  @Post(':id/password')
  @RequirePermission(PERMISSIONS.IDENTITY_USER_MANAGE)
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() me: AuthUser,
  ) {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundException('Akun tidak ditemukan');
    await this.users.resetPassword(id, await argon2.hash(dto.password));
    await this.audit.log({
      actorId: me.id,
      action: 'admin.user.reset_password',
      entity: 'user',
      entityId: id,
    });
    return { ok: true };
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.IDENTITY_USER_MANAGE)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() me: AuthUser,
  ) {
    if (id === me.id) {
      throw new BadRequestException('Tidak bisa menghapus akun sendiri.');
    }
    const res = await this.users.deleteStaff(id);
    if (res.count === 0) {
      throw new NotFoundException('Akun staf tidak ditemukan');
    }
    await this.audit.log({
      actorId: me.id,
      action: 'admin.user.delete',
      entity: 'user',
      entityId: id,
    });
    return { ok: true };
  }
}
