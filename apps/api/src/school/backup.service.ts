import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createGzip, createGunzip } from 'node:zlib';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { PrismaService } from '../core/prisma/prisma.service';
import { EnvService } from '../core/config/env.service';
import { StorageService } from '../core/storage/storage.service';

export interface BackupStats {
  dbBytes: number;
  /** Per-prefix storage objects, mis. qmedia/, archive/, attendance/ */
  storage: { prefix: string; files: number; bytes: number }[];
  storageFiles: number;
  storageBytes: number;
}

/**
 * Cadangan & pemulihan database — membungkus pg_dump/psql CLI postgres.
 * Dump dibuat dengan --clean --if-exists sehingga file yang sama bisa
 * dipulihkan menimpa skema yang ada tanpa langkah drop manual.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly env: EnvService,
    private readonly storage: StorageService,
  ) {}

  async stats(): Promise<BackupStats> {
    const [db] = await this.prisma.$queryRaw<{ bytes: bigint }[]>`
      SELECT pg_database_size(current_database()) AS bytes`;
    let storage: BackupStats['storage'] = [];
    try {
      const byPrefix = await this.storage.listStatsByPrefix();
      storage = Object.entries(byPrefix)
        .map(([prefix, s]) => ({ prefix, ...s }))
        .sort((a, b) => b.bytes - a.bytes);
    } catch (e) {
      this.logger.warn(
        `Statistik storage gagal: ${e instanceof Error ? e.message : e}`,
      );
    }
    return {
      dbBytes: Number(db?.bytes ?? 0),
      storage,
      storageFiles: storage.reduce((t, s) => t + s.files, 0),
      storageBytes: storage.reduce((t, s) => t + s.bytes, 0),
    };
  }

  /** Stream dump SQL ter-gzip — pg_dump → gzip → HTTP response. */
  async dumpStream(): Promise<Readable> {
    const url = this.env.databaseUrl;
    const dump = spawn(
      'pg_dump',
      [
        url,
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--format=plain',
        '--encoding=UTF8',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    dump.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    dump.on('error', (e) => {
      this.logger.error(`pg_dump gagal dijalankan: ${e.message}`);
    });
    const exitCode = new Promise<number>((resolve) =>
      dump.on('close', (code) => resolve(code ?? 1)),
    );
    const gzip = createGzip({ level: 6 });
    dump.stdout.pipe(gzip);
    // Laporkan kegagalan pg_dump ke stream supaya download tidak
    // diam-diam menghasilkan file korup.
    void exitCode.then((code) => {
      if (code !== 0) gzip.destroy(new Error(`pg_dump keluar kode ${code}: ${stderr}`));
    });
    return gzip;
  }

  /**
   * Pulihkan database dari file .sql / .sql.gz — satu transaksi penuh
   * (--single-transaction) sehingga gagal di tengah → rollback utuh.
   */
  async restore(file: Express.Multer.File): Promise<void> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File backup kosong.');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.sql') && !name.endsWith('.sql.gz')) {
      throw new BadRequestException(
        'Format harus .sql atau .sql.gz dari fitur Unduh Backup.',
      );
    }
    const dir = await mkdtemp(join(tmpdir(), 'smpmuh3-restore-'));
    const sqlPath = join(dir, 'restore.sql');
    try {
      // Dekompres ke file — psql membaca dari file, bukan stdin, agar
      // --single-transaction dan penanganan error konsisten.
      const sql = name.endsWith('.gz')
        ? await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            const gun = createGunzip();
            gun.on('data', (c: Buffer) => chunks.push(c));
            gun.on('end', () => resolve(Buffer.concat(chunks)));
            gun.on('error', () =>
              reject(new BadRequestException('File .gz rusak / bukan gzip.')),
            );
            gun.end(file.buffer);
          })
        : file.buffer;
      if (!sql.includes('PostgreSQL database dump')) {
        throw new BadRequestException(
          'File bukan dump pg_dump yang valid — gunakan file dari Unduh Backup.',
        );
      }
      await writeFile(sqlPath, sql);

      const code = await new Promise<number>((resolve) => {
        const psql = spawn(
          'psql',
          [
            this.env.databaseUrl,
            '--single-transaction',
            '-v',
            'ON_ERROR_STOP=1',
            '-f',
            sqlPath,
            '-q',
          ],
          { stdio: ['ignore', 'ignore', 'pipe'] },
        );
        let stderr = '';
        psql.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
        psql.on('error', (e) => {
          this.logger.error(`psql gagal dijalankan: ${e.message}`);
          resolve(127);
        });
        psql.on('close', (c) => {
          if (c !== 0) this.logger.error(`psql restore gagal: ${stderr}`);
          resolve(c ?? 1);
        });
      });
      if (code === 127) {
        throw new ServiceUnavailableException(
          'psql tidak tersedia di server — hubungi administrator.',
        );
      }
      if (code !== 0) {
        throw new InternalServerErrorException(
          'Pemulihan gagal — database TIDAK berubah (rollback penuh). ' +
            'Pastikan file berasal dari versi aplikasi yang kompatibel.',
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
