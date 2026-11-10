import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ZipArchive } from 'archiver';
import argon2 from 'argon2';
import { randomBytes, randomInt } from 'node:crypto';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import { normalizePhone } from '../identity/users/users.service';

interface ImportRow {
  nama: string;
  jenisKelamin: 'MALE' | 'FEMALE';
  tanggalLahir: Date;
  asalSekolah: string;
  namaOrtu: string;
  noHp: string;
  emailOrtu?: string;
  gelombang?: string;
}

/**
 * Import pendaftar dari Excel + export kartu pendaftaran PDF.
 *
 * Kolom Excel (sheet pertama, baris 1 = header):
 *   nama | jenis_kelamin (L/P) | tanggal_lahir | asal_sekolah |
 *   nama_ortu | no_hp | email_ortu (opsional) | gelombang (opsional)
 *
 * Tiap baris → akun ortu (dicari/dibuat dari no_hp) + calon siswa +
 * pendaftaran berstatus SUBMITTED agar langsung masuk antrean review.
 */
@Injectable()
export class SpmbImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * dry=true → hanya mem-parsing & memvalidasi (tidak menulis apa pun).
   * Mengembalikan `rows` per-baris untuk pratinjau di frontend.
   * Anti-dobel: baris ganda di file + pendaftar dengan nama & no HP ortu
   * yang sama di tahun ajaran ini dilewati.
   */
  async importExcel(buffer: Buffer, actorId: string, dry = false) {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    } catch {
      throw new BadRequestException('File Excel tidak dapat dibaca');
    }
    const year = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (!year) throw new BadRequestException('Tahun ajaran aktif tidak ada');
    const waves = await this.prisma.registrationWave.findMany({
      where: { academicYearId: year.id },
    });
    const defaultWave = waves.find((w) => w.isActive) ?? waves[0] ?? null;

    const parentRole = await this.prisma.role.findUniqueOrThrow({
      where: { key: 'spmb_parent' },
    });
    interface RowResult {
      row: number;
      sheet: string;
      nama: string;
      noHp: string;
      status: 'BARU' | 'LEWATI';
      msg: string;
    }
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
      rows: [] as RowResult[],
    };
    // Kunci dedup dalam file: no_hp ortu + nama calon.
    const seen = new Set<string>();

    // Semua sheet diproses — nama sheet = gelombang bila cocok.
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const sheetWave =
        waves.find((w) => w.name.toLowerCase() === sheetName.toLowerCase()) ??
        defaultWave;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
      });
      if (rows.length === 0) continue;

      for (const [i, raw] of rows.entries()) {
        const line = i + 2; // header = baris 1
        const push = (status: RowResult['status'], msg: string, r?: Partial<RowResult>) =>
          results.rows.push({
            row: line,
            sheet: sheetName,
            nama: r?.nama ?? '',
            noHp: r?.noHp ?? '',
            status,
            msg,
          });
        try {
          const row = this.parseRow(raw, line);
          const wave = row.gelombang
            ? waves.find(
                (w) => w.name.toLowerCase() === row.gelombang!.toLowerCase(),
              )
            : sheetWave;

          const key = `${row.noHp}|${row.nama.toLowerCase()}`;
          if (seen.has(key)) {
            results.skipped++;
            push('LEWATI', 'ganda di file — baris sebelumnya sudah memuat data ini', {
              nama: row.nama,
              noHp: row.noHp,
            });
            continue;
          }
          seen.add(key);

          // Akun ortu — cari by no_hp; buat baru (password acak) jika belum ada.
          let parent = await this.prisma.user.findUnique({
            where: { phone: row.noHp },
          });

          // Sudah ada pendaftaran calon (nama sama) dari ortu ini di TA ini?
          if (parent) {
            const dup = await this.prisma.registration.findFirst({
              where: {
                academicYearId: year.id,
                parentId: parent.id,
                candidate: {
                  name: { equals: row.nama, mode: 'insensitive' },
                },
              },
              select: { number: true },
            });
            if (dup) {
              results.skipped++;
              push('LEWATI', `sudah terdaftar (${dup.number})`, {
                nama: row.nama,
                noHp: row.noHp,
              });
              continue;
            }
          }

          if (dry) {
            results.created++;
            push('BARU', parent ? 'akun ortu sudah ada — dipakai' : 'akun ortu baru dibuat', {
              nama: row.nama,
              noHp: row.noHp,
            });
            continue;
          }

          if (!parent) {
            parent = await this.prisma.user.create({
              data: {
                name: row.namaOrtu.toUpperCase(),
                phone: row.noHp,
                email: row.emailOrtu ?? null,
                passwordHash: await argon2.hash(
                  randomBytes(24).toString('hex'),
                ),
                roles: { create: { roleId: parentRole.id } },
              },
            });
          }

          const candidate = await this.prisma.candidate.create({
            data: {
              parentId: parent.id,
              name: row.nama.toUpperCase(),
              gender: row.jenisKelamin,
              birthDate: row.tanggalLahir,
              previousSchool: row.asalSekolah,
            },
          });
          await this.prisma.registration.create({
            data: {
              number: `SPMB-${year.name.split('/')[0]}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`,
              candidateId: candidate.id,
              parentId: parent.id,
              academicYearId: year.id,
              waveId: wave?.id ?? null,
              pathway: 'reguler',
              status: 'SUBMITTED',
              submittedAt: new Date(),
            },
          });
          results.created++;
          push('BARU', 'terdaftar', { nama: row.nama, noHp: row.noHp });
        } catch (e) {
          results.skipped++;
          const msg = e instanceof Error ? e.message : 'error';
          results.errors.push(`[${sheetName}] baris ${line}: ${msg}`);
          push('LEWATI', msg);
        }
      }
    }
    if (results.rows.length === 0) {
      throw new BadRequestException(
        'File hanya berisi header — isi data pendaftar lalu import ulang.',
      );
    }
    return results;
  }

  /**
   * Export data pendaftar ke Excel — satu sheet per gelombang
   * (bila waveId diisi, hanya gelombang itu).
   */
  async exportXlsx(waveId: string | undefined, academicYearId?: string) {
    const year = academicYearId
      ? await this.prisma.academicYear.findUnique({
          where: { id: academicYearId },
        })
      : await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new NotFoundException('Tahun ajaran tidak ditemukan');

    const waves = await this.prisma.registrationWave.findMany({
      where: {
        academicYearId: year.id,
        ...(waveId ? { id: waveId } : {}),
      },
      orderBy: { order: 'asc' },
    });

    const regs = await this.prisma.registration.findMany({
      where: {
        academicYearId: year.id,
        ...(waveId ? { waveId } : {}),
      },
      include: {
        candidate: true,
        parent: { select: { name: true, phone: true, email: true } },
      },
      orderBy: { number: 'asc' },
    });

    const wb = XLSX.utils.book_new();
    for (const wave of waves) {
      const rows = regs
        .filter((r) => r.waveId === wave.id)
        .map((r) => ({
          'No. Pendaftaran': r.number,
          Nama: r.candidate.name,
          'Jenis Kelamin':
            r.candidate.gender === 'MALE' ? 'Laki-laki' : 'Perempuan',
          'Tempat Lahir': r.candidate.birthPlace ?? '',
          'Tanggal Lahir': r.candidate.birthDate
            ? r.candidate.birthDate.toISOString().slice(0, 10)
            : '',
          'Asal Sekolah': r.candidate.previousSchool ?? '',
          NISN: r.candidate.nisn ?? '',
          Alamat: r.candidate.address ?? '',
          'Nilai TKA': r.candidate.tkaScore ?? '',
          Jalur: r.pathwayDetail ?? r.pathway,
          'Diskon DSP (%)': r.discountPercent,
          Status: r.status,
          'Nama Orang Tua': r.parent.name,
          'No. HP Ortu': r.parent.phone ?? '',
          'Email Ortu': r.parent.email ?? '',
        }));
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, wave.name.slice(0, 31));
    }
    // Pendaftar tanpa gelombang tetap ter-export.
    const rest = regs.filter((r) => !r.waveId);
    if (rest.length > 0) {
      const ws = XLSX.utils.json_to_sheet(
        rest.map((r) => ({
          'No. Pendaftaran': r.number,
          Nama: r.candidate.name,
          Status: r.status,
          'No. HP Ortu': r.parent.phone ?? '',
        })),
      );
      XLSX.utils.book_append_sheet(wb, ws, 'Tanpa Gelombang');
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Export daftar titipan — semua status, terurut antrean. */
  async exportTitipanXlsx(academicYearId?: string, waveId?: string) {
    const entries = await this.prisma.titipanEntry.findMany({
      where: {
        ...(academicYearId ? { academicYearId } : {}),
        ...(waveId ? { waveId } : {}),
      },
      include: {
        academicYear: { select: { name: true } },
        wave: { select: { name: true } },
      },
      orderBy: [{ academicYearId: 'asc' }, { queueNo: 'asc' }],
    });
    // registrationId disimpan sebagai id polos (bukan relasi) — ambil nomornya.
    const regIds = entries.map((e) => e.registrationId).filter((x): x is string => !!x);
    const regs = await this.prisma.registration.findMany({
      where: { id: { in: regIds } },
      select: { id: true, number: true },
    });
    const regNo = new Map(regs.map((r) => [r.id, r.number]));
    const STATUS: Record<string, string> = {
      PENDING: 'Menunggu verifikasi',
      QUEUED: 'Dalam antrean',
      CODE_SENT: 'Kode terkirim',
      REGISTERED: 'Sudah daftar',
      CANCELLED: 'Dibatalkan',
    };
    const ws = XLSX.utils.json_to_sheet(
      entries.map((e) => ({
        'No. Antre': e.queueNo,
        'Tahun Ajaran': e.academicYear.name,
        Gelombang: e.wave?.name ?? '',
        'Nama Calon Siswa': e.candidateName,
        'Tempat Lahir': e.birthPlace ?? '',
        'Tanggal Lahir': e.birthDate ? e.birthDate.toISOString().slice(0, 10) : '',
        'Asal Sekolah': e.previousSchool ?? '',
        Alamat: e.address ?? '',
        'No. HP Wali': e.guardianPhone ?? '',
        Status: STATUS[e.status] ?? e.status,
        'Kode Formulir': e.formCode ?? '',
        'No. Pendaftaran': e.registrationId ? (regNo.get(e.registrationId) ?? '') : '',
        'Tanggal Titip': e.createdAt.toISOString().slice(0, 10),
      })),
    );
    ws['!cols'] = [{ wch: 9 }, { wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 26 }, { wch: 15 }, { wch: 18 }, { wch: 13 }, { wch: 18 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Titipan');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Export akun orang tua beserta jumlah pendaftarannya. */
  async exportParentsXlsx(academicYearId?: string, waveId?: string) {
    const regFilter: { waveId?: string; academicYearId?: string } = {};
    if (waveId) regFilter.waveId = waveId;
    if (academicYearId) regFilter.academicYearId = academicYearId;
    const parents = await this.prisma.user.findMany({
      where: {
        roles: { some: { role: { key: 'spmb_parent' } } },
        ...(Object.keys(regFilter).length
          ? { registrations: { some: regFilter } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        name: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { registrations: true, candidates: true } },
      },
    });
    const ws = XLSX.utils.json_to_sheet(
      parents.map((p) => ({
        'Nama Orang Tua': p.name,
        'No. HP': p.phone ?? '',
        Email: p.email ?? '',
        Status: p.status,
        'Jumlah Anak Terdaftar': p._count.candidates,
        'Jumlah Pendaftaran': p._count.registrations,
        'Terdaftar Sejak': p.createdAt.toISOString().slice(0, 10),
        'Login Terakhir': p.lastLoginAt ? p.lastLoginAt.toISOString().slice(0, 10) : '',
      })),
    );
    ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 26 }, { wch: 10 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Akun Orang Tua');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /**
   * Export seluruh dokumen pendaftar di satu gelombang — semua status,
   * selama pendaftar punya berkas terunggah. Zip berisi satu folder
   * per siswa agar berkas tidak bercampur.
   */
  async exportDocumentsZip(waveId: string): Promise<Buffer> {
    const regs = await this.prisma.registration.findMany({
      where: {
        waveId,
        documents: { some: {} },
      },
      include: {
        candidate: true,
        documents: { orderBy: { type: 'asc' } },
      },
      orderBy: { number: 'asc' },
    });
    if (regs.length === 0) {
      throw new NotFoundException(
        'Belum ada berkas terunggah pada gelombang ini',
      );
    }

    const archive = new ZipArchive({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    let added = 0;
    const missing: string[] = [];
    for (const reg of regs) {
      const folder = `${reg.number} - ${reg.candidate.name}`.replace(
        /[\\/:*?"<>|]/g,
        '_',
      );
      let idx = 0;
      for (const doc of reg.documents) {
        try {
          const buf = await this.storage.getObjectBuffer(doc.storageKey);
          idx += 1;
          archive.append(buf, {
            name: `${folder}/${doc.type}_${idx}_${doc.fileName}`,
          });
          added += 1;
        } catch {
          missing.push(`${folder}/${doc.type} — ${doc.fileName}`);
        }
      }
    }
    if (added === 0) {
      throw new BadRequestException(
        'Berkas tidak ditemukan di penyimpanan — semua dokumen gagal diambil.',
      );
    }
    if (missing.length > 0) {
      archive.append(
        `Berkas yang gagal diambil dari storage (${missing.length}):\n\n${missing.join('\n')}\n`,
        { name: '_GAGAL-DIUNDUH.txt' },
      );
    }
    await archive.finalize();
    return done;
  }

  private parseRow(raw: Record<string, unknown>, line: number): ImportRow {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const v = raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()];
        if (v !== undefined && v !== '') return v;
      }
      return '';
    };
    const nama = String(get('nama', 'name')).trim();
    const jk = String(get('jenis_kelamin', 'jk', 'gender'))
      .trim()
      .toUpperCase();
    const tgl = get('tanggal_lahir', 'tgl_lahir', 'birth_date');
    const asal = String(
      get('asal_sekolah', 'previous_school', 'sekolah_asal'),
    ).trim();
    const ortu = String(
      get('nama_ortu', 'nama_orang_tua', 'parent_name'),
    ).trim();
    const hp = String(get('no_hp', 'no hp', 'phone', 'hp')).trim();
    const email = String(get('email_ortu', 'email')).trim();
    const gel = String(get('gelombang', 'wave')).trim();

    if (!nama) throw new BadRequestException('kolom nama kosong');
    const jenisKelamin =
      jk === 'L' || jk === 'MALE' || jk === 'LAKI-LAKI'
        ? 'MALE'
        : jk === 'P' || jk === 'FEMALE' || jk === 'PEREMPUAN'
          ? 'FEMALE'
          : null;
    if (!jenisKelamin) {
      throw new BadRequestException(`jenis_kelamin tidak dikenal: '${jk}'`);
    }
    const tanggalLahir =
      tgl instanceof Date ? tgl : new Date(String(tgl));
    if (Number.isNaN(tanggalLahir.getTime())) {
      throw new BadRequestException(`tanggal_lahir tidak valid: '${tgl}'`);
    }
    if (!asal) throw new BadRequestException('kolom asal_sekolah kosong');
    if (!ortu) throw new BadRequestException('kolom nama_ortu kosong');
    const noHp = normalizePhone(hp);
    if (!noHp || noHp.length < 10) {
      throw new BadRequestException(`no_hp tidak valid: '${hp}' (baris ${line})`);
    }
    return {
      nama,
      jenisKelamin,
      tanggalLahir,
      asalSekolah: asal,
      namaOrtu: ortu,
      noHp,
      ...(email ? { emailOrtu: email.toLowerCase() } : {}),
      ...(gel ? { gelombang: gel } : {}),
    };
  }

  /** Export kartu pendaftaran satu peserta → PDF stream. */
  async exportPdf(id: string): Promise<{
    doc: PDFKit.PDFDocument;
    fileName: string;
  }> {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        candidate: true,
        parent: { select: { name: true, phone: true, email: true } },
        wave: true,
        academicYear: true,
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    doc.fontSize(16).text('KARTU PENDAFTARAN SPMB', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text('SMP Muhammadiyah 3 Kota Bandung', {
      align: 'center',
    });
    doc.text(`Tahun Ajaran ${reg.academicYear.name}`, { align: 'center' });
    doc.moveDown();
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown();
    doc.fontSize(12);
    const row = (label: string, value: string) =>
      doc.text(`${label.padEnd(22)}: ${value}`);
    row('No. Pendaftaran', reg.number);
    row('Gelombang', reg.wave?.name ?? '-');
    row('Nama Calon', reg.candidate.name);
    row(
      'Jenis Kelamin',
      reg.candidate.gender === 'MALE' ? 'Laki-laki' : 'Perempuan',
    );
    row(
      'Tanggal Lahir',
      reg.candidate.birthDate
        ? new Date(reg.candidate.birthDate).toLocaleDateString('id-ID')
        : '-',
    );
    row('Asal Sekolah', reg.candidate.previousSchool ?? '-');
    row('Jalur', reg.pathway);
    row('Orang Tua', reg.parent.name);
    row('No. HP', reg.parent.phone ?? '-');
    doc.moveDown();
    doc
      .fontSize(9)
      .text(
        'Simpan kartu ini untuk cek status dan proses daftar ulang.',
        { align: 'center' },
      );
    doc.end();
    return { doc, fileName: `kartu-${reg.number}.pdf` };
  }
}
