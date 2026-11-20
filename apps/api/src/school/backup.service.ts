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
      // Batas dekompresi — gzip bomb (file kecil → SQL raksasa) jangan
      // sampai menghabiskan memori proses API.
      const MAX_SQL = 512 * 1024 * 1024;
      const sql = name.endsWith('.gz')
        ? await new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];
            let size = 0;
            const gun = createGunzip();
            gun.on('data', (c: Buffer) => {
              size += c.length;
              if (size > MAX_SQL) {
                gun.destroy();
                reject(new BadRequestException('Hasil dekompresi melebihi 512MB.'));
                return;
              }
              chunks.push(c);
            });
            gun.on('end', () => resolve(Buffer.concat(chunks)));
            gun.on('error', () =>
              reject(new BadRequestException('File .gz rusak / bukan gzip.')),
            );
            gun.end(file.buffer);
          })
        : file.buffer;
      if (sql.length > MAX_SQL) {
        throw new BadRequestException('File SQL melebihi 512MB.');
      }
      if (!sql.includes('PostgreSQL database dump')) {
        throw new BadRequestException(
          'File bukan dump pg_dump yang valid — gunakan file dari Unduh Backup.',
        );
      }
      // File dieksekusi psql sebagai superuser — SQL upload jangan boleh
      // membawa perintah berbahaya (RCE OS via \!/COPY PROGRAM, eskalasi
      // via CREATE ROLE/GRANT, eksekusi kode via DO/FUNCTION, dst.).
      this.assertSafeDump(sql.toString('utf8'));
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

  /**
   * Validasi isi dump sebelum dijalankan psql. Dump sah dari `pg_dump` fitur
   * Unduh Backup hanya berisi SET/DDL schema + COPY data — tidak pernah
   * mengandung meta-perintah psql maupun pernyataan privilege/OS ini.
   */
  private assertSafeDump(sqlText: string) {
    // Meta-perintah psql: hanya `\.` (akhir data COPY) dan pasangan
    // \restrict/\unrestrict (fitur keamanan pg_dump PG18) yang sah.
    for (const line of sqlText.split('\n')) {
      const t = line.trim();
      if (t.startsWith('\\') && !/^(\\\.|\\restrict\b|\\unrestrict\b)/.test(t)) {
        throw new BadRequestException(
          'Dump mengandung meta-perintah psql yang tidak diizinkan.',
        );
      }
    }
    // Komentar baris dibuang sebelum scan — komentar pg_dump sah dan boleh
    // menyebut kata apa pun; pernyataan berbahaya hanya dinilai dari kode.
    const code = sqlText
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    const banned: [RegExp, string][] = [
      [/\bCOPY\s+[^;\n]*\bPROGRAM\b/i, 'COPY ... PROGRAM (eksekusi perintah OS)'],
      [/\bCOPY\s+[^;\n]*\b(?:TO|FROM)\s*'/i, 'COPY ... TO/FROM file server'],
      [/\bALTER\s+SYSTEM\b/i, 'ALTER SYSTEM'],
      [/\bDO\s*(?:\$|\bLANGUAGE\b)/i, 'blok DO (eksekusi kode)'],
      [/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER|RULE|AGGREGATE|OPERATOR|CAST)\b/i, 'objek executable (FUNCTION/TRIGGER/dsb)'],
      [/\bSECURITY\s+DEFINER\b/i, 'SECURITY DEFINER'],
      [/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|USER|TABLESPACE|SERVER|FOREIGN\s+SERVER|PUBLICATION|SUBSCRIPTION)\b/i, 'DDL role/server/tablespace'],
      // GRANT/REVOKE objek (… ON TABLE/SCHEMA …) sah dari pg_dump; yang
      // diblok hanya grant ROLE (tanpa ON) — eskalasi hak ke role lain.
      [/\b(?:GRANT|REVOKE)\b(?![^;]*\bON\b)[^;]*;/i, 'GRANT/REVOKE role'],
      [/\bSET\s+(?:SESSION\s+AUTHORIZATION|ROLE)\b/i, 'SET ROLE/AUTHORIZATION'],
      [/\bLOAD\b/i, 'LOAD modul'],
      [/\bCREATE\s+EXTENSION\b/i, 'CREATE EXTENSION'],
      [/\b(?:pg_read_server_file|pg_write_server_file|pg_execute_server_program|lo_import|lo_export|dblink)\b/i, 'fungsi akses file/program server'],
    ];
    for (const [re, label] of banned) {
      if (re.test(code)) {
        throw new BadRequestException(
          `Dump mengandung pernyataan berbahaya (${label}) — restore ditolak.`,
        );
      }
    }
  }
}
