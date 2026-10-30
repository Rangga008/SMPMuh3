import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
} from '@smpmuh3/types';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../core/prisma/prisma.service';
import { RequirePermission } from './decorators/require-permission.decorator';

class CreateRoleDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,49}$/, {
    message: 'Key role: huruf kecil/angka/underscore, diawali huruf.',
  })
  key!: string;

  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ALL_PERMISSION_KEYS as readonly string[], { each: true })
  permissionKeys!: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsIn(ALL_PERMISSION_KEYS as readonly string[], { each: true })
  permissionKeys?: string[];
}

/**
 * Role management — role menentukan bidang pekerjaan yang bisa diakses
 * (SPMB, CBT, keuangan, operasional, dst) via permission keys.
 */
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermission(PERMISSIONS.IDENTITY_ROLE_READ)
  list() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        _count: { select: { users: true } },
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
  }

  @Get('permissions')
  @RequirePermission(PERMISSIONS.IDENTITY_ROLE_READ)
  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, description: true },
    });
  }

  @Post()
  @RequirePermission(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  async create(@Body() dto: CreateRoleDto) {
    const perms = await this.prisma.permission.findMany({
      where: { key: { in: dto.permissionKeys } },
      select: { id: true },
    });
    try {
      return await this.prisma.role.create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description ?? null,
          permissions: {
            create: perms.map((p) => ({ permissionId: p.id })),
          },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException(`Key role ${dto.key} sudah dipakai.`);
      }
      throw e;
    }
  }

  @Put(':id')
  @RequirePermission(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('Role tidak ditemukan.');
    if (role.key === 'superadmin' && dto.permissionKeys) {
      throw new BadRequestException('Permission superadmin tidak bisa diubah.');
    }
    if (dto.permissionKeys) {
      const perms = await this.prisma.permission.findMany({
        where: { key: { in: dto.permissionKeys } },
        select: { id: true },
      });
      await this.prisma.$transaction([
        this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
        this.prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: id, permissionId: p.id })),
        }),
      ]);
    }
    if (dto.name !== undefined || dto.description !== undefined) {
      await this.prisma.role.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
      });
    }
    return this.prisma.role.findUnique({ where: { id } });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: { key: true, _count: { select: { users: true } } },
    });
    if (!role) throw new BadRequestException('Role tidak ditemukan.');
    if (['superadmin', 'spmb_parent'].includes(role.key)) {
      throw new BadRequestException('Role bawaan sistem tidak bisa dihapus.');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        `Role masih dipakai ${role._count.users} akun.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
  }
}
