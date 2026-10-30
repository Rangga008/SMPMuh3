import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '@smpmuh3/types';
import { PERMISSIONS } from '@smpmuh3/types';
import { AuditService } from '../audit/audit.service';
import { Public } from '../identity/decorators/public.decorator';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { SchoolService } from './school.service';

const emptyToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

export class UpdateSchoolDto {
  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  tagline?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp?: string | null;

  @emptyToNull()
  @IsOptional()
  @IsEmail()
  email?: string | null;
}

@Controller({ path: 'school', version: '1' })
export class SchoolController {
  constructor(
    private readonly school: SchoolService,
    private readonly audit: AuditService,
  ) {}

  /** Profil publik untuk situs SPMB — tanpa auth. */
  @Public()
  @Get('public')
  getPublic() {
    return this.school.getPublic();
  }

  /** Logo publik — stream dari storage. */
  @Public()
  @Get('logo')
  async getLogo(@Res({ passthrough: true }) res: Response) {
    const { buf, mime } = await this.school.getLogo();
    res.set({ 'Content-Type': mime, 'Cache-Control': 'public, max-age=300' });
    return new StreamableFile(buf);
  }

  @Get()
  @RequirePermission(PERMISSIONS.SCHOOL_READ)
  get() {
    return this.school.get();
  }

  @Patch()
  @RequirePermission(PERMISSIONS.SCHOOL_MANAGE)
  async update(@Body() dto: UpdateSchoolDto, @CurrentUser() me: AuthUser) {
    const school = await this.school.update(dto);
    await this.audit.log({
      actorId: me.id,
      action: 'school.update',
      entity: 'school',
      entityId: school.id,
    });
    return school;
  }

  @Post('logo')
  @RequirePermission(PERMISSIONS.SCHOOL_MANAGE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @CurrentUser() me: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 3 * 1024 * 1024 })
        .addFileTypeValidator({
          fileType: /image\/(png|jpeg|webp|svg\+xml)/,
        })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    if (!file.mimetype.startsWith('image/')) {
      throw new NotFoundException('Hanya file gambar yang diperbolehkan');
    }
    const school = await this.school.uploadLogo(file);
    await this.audit.log({
      actorId: me.id,
      action: 'school.logo_upload',
      entity: 'school',
      entityId: school.id,
    });
    return school;
  }
}
