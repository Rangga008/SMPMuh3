import {
  Controller,
  Get,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '@smpmuh3/types';
import { PERMISSIONS } from '@smpmuh3/types';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { BackupService } from './backup.service';

/** Cadangan & pemulihan database — hanya pemegang kelola sekolah (admin penuh). */
@Controller({ path: 'school/backup', version: '1' })
export class BackupController {
  constructor(
    private readonly backup: BackupService,
    private readonly audit: AuditService,
  ) {}

  @Get('stats')
  @RequirePermission(PERMISSIONS.SCHOOL_MANAGE)
  stats() {
    return this.backup.stats();
  }

  /** Unduh seluruh database sebagai .sql.gz (pg_dump --clean --if-exists). */
  @Get('download')
  @RequirePermission(PERMISSIONS.SCHOOL_MANAGE)
  async download(@CurrentUser() me: AuthUser, @Res({ passthrough: true }) res: Response) {
    const stream = await this.backup.dumpStream();
    const stamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-');
    res.set({
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="smpmuh3-backup-${stamp}.sql.gz"`,
      'Cache-Control': 'no-store',
    });
    await this.audit.log({
      actorId: me.id,
      action: 'backup.download',
      entity: 'school',
    });
    return new StreamableFile(stream);
  }

  /** Pulihkan database dari file .sql/.sql.gz — MENIMPA semua data. */
  @Post('restore')
  @RequirePermission(PERMISSIONS.SCHOOL_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 512 * 1024 * 1024 } }),
  )
  async restore(
    @CurrentUser() me: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 512 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
  ) {
    await this.backup.restore(file);
    await this.audit.log({
      actorId: me.id,
      action: 'backup.restore',
      entity: 'school',
    });
    return { ok: true };
  }
}
