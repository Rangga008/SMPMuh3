import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type { Request, Response } from 'express';
import type { ApiError } from '@smpmuh3/types';

/** Nama field DTO → label Indonesia agar pesan validasi bisa dibaca user. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Nama',
  candidateName: 'Nama calon siswa',
  candidateId: 'Calon murid',
  gender: 'Jenis kelamin',
  birthDate: 'Tanggal lahir',
  birthPlace: 'Tempat lahir',
  motherName: 'Nama ibu kandung',
  fatherName: 'Nama ayah',
  parentPhone: 'No. HP orang tua',
  guardianPhone: 'No. HP orang tua',
  nisn: 'NISN',
  nik: 'NIK',
  nis: 'NIS',
  previousSchool: 'Sekolah asal',
  address: 'Alamat',
  infoSource: 'Sumber informasi',
  academicYearId: 'Tahun ajaran',
  waveId: 'Gelombang',
  formCode: 'Kode formulir',
  phone: 'No. HP',
  email: 'Email',
  password: 'Kata sandi',
  identifier: 'Email/No. HP',
  tkaScore: 'Nilai TKA',
  website: 'Website',
  label: 'Nama',
  amount: 'Nominal',
  percent: 'Persen',
  minScore: 'Nilai minimal',
  category: 'Kelompok',
  fieldType: 'Tipe jawaban',
  options: 'Pilihan',
  startDate: 'Tanggal mulai',
  endDate: 'Tanggal selesai',
  status: 'Status',
  note: 'Catatan',
  ids: 'Daftar data',
  action: 'Aksi',
  employeeId: 'Pegawai',
  studentId: 'Siswa',
  classId: 'Kelas/rombel',
  date: 'Tanggal',
  type: 'Jenis',
  title: 'Judul',
  description: 'Keterangan',
  nip: 'NIP',
};

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^must be longer than or equal to (\d+) characters/i, (m) => `minimal ${m[1]} karakter`],
  [/^must be shorter than or equal to (\d+) characters/i, (m) => `maksimal ${m[1]} karakter`],
  [/^must be exactly (\d+) characters/i, (m) => `harus ${m[1]} karakter`],
  [/^should not be empty/i, () => 'wajib diisi'],
  [/^must be a valid ISO 8601 date string/i, () => 'format tanggal tidak valid (YYYY-MM-DD)'],
  [/^must be a UUID/i, () => 'format tidak valid'],
  [/^must be an email/i, () => 'format email tidak valid'],
  [/^must be an integer number/i, () => 'harus berupa angka bulat'],
  [/^must be a number/i, () => 'harus berupa angka'],
  [/^must be a string/i, () => 'harus berupa teks'],
  [/^must be a boolean/i, () => 'harus ya/tidak'],
  [/^must not be less than (-?[\d.]+)/i, (m) => `tidak boleh kurang dari ${m[1]}`],
  [/^must not be greater than (-?[\d.]+)/i, (m) => `tidak boleh lebih dari ${m[1]}`],
  [/^must be one of the following values: (.*)/i, (m) => `pilihan tidak valid — pilihan: ${m[1]}`],
  [/^must be a valid enum value/i, () => 'pilihan tidak valid'],
  [/^must match .*regular expression/i, () => 'format tidak sesuai'],
  [/^must be an array/i, () => 'harus berupa daftar'],
  [/^must be an object/i, () => 'format tidak valid'],
  [/^must be a valid URL/i, () => 'format URL tidak valid'],
];

/** Terjemahkan pesan class-validator → "Field: alasan" bahasa Indonesia. */
function translateValidation(msg: string): string {
  const foreign = msg.match(/^property (\w+) should not exist/i);
  if (foreign) {
    return `Kolom "${foreign[1]}" tidak dikenal — hubungi admin bila ini field baru.`;
  }
  const m = msg.match(/^(\w+)\s+(.*)$/s);
  if (!m) return msg;
  const field = m[1] ?? '';
  const rest = m[2] ?? '';
  const label = FIELD_LABELS[field] ?? field;
  for (const [re, fn] of RULES) {
    const hit = rest.match(re);
    if (hit) return `${label}: ${fn(hit)}.`;
  }
  // Pesan custom dari decorator: bila diawali nama field yang dikenal,
  // terjemahkan labelnya ("nik harus 16 digit" → "NIK: harus 16 digit").
  if (field && FIELD_LABELS[field]) {
    return `${FIELD_LABELS[field]}: ${rest.replace(/\.*$/, '')}.`;
  }
  return msg;
}

/**
 * Global error envelope:
 *   { error: { code, message, details? }, requestId }
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = exception.name
        .replace(/Exception$/, '')
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toUpperCase();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        if (Array.isArray(b['message'])) {
          const fields = (b['message'] as string[]).map((m) =>
            translateValidation(String(m)),
          );
          message =
            fields.length === 1
              ? fields[0]!
              : `Periksa isian Anda — ${fields.join(' · ')}`;
          details = { fields };
        } else {
          message = String(b['message'] ?? exception.message);
          if (b['details'] !== undefined) details = b['details'];
        }
      }
    } else if (exception instanceof PrismaClientKnownRequestError) {
      // Error DB dikenal → jadi jawaban bermakna, bukan "Internal error".
      const e = exception;
      if (e.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        code = 'DUPLICATE';
        message = 'Data sudah ada (duplikat) — periksa kembali isian Anda.';
      } else if (e.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        code = 'IN_USE';
        message = 'Data masih dipakai oleh data lain — tidak bisa diubah/dihapus.';
      } else if (e.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        code = 'NOT_FOUND';
        message = 'Data tidak ditemukan — mungkin sudah dihapus.';
      } else {
        this.logger.error(`Prisma ${e.code}: ${e.message}`);
        message = 'Terjadi kesalahan data — coba lagi atau hubungi admin.';
      }
    } else {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ApiError = {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      requestId: req.id,
    };

    res.status(status).json(payload);
  }
}
