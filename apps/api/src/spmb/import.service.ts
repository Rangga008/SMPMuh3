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

  async importExcel(buffer: Buffer, actorId: string) {
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
    const results = { created: 0, skipped: 0, errors: [] as string[] };

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
        try {
          const row = this.parseRow(raw, line);
          const wave = row.gelombang
            ? waves.find(
                (w) => w.name.toLowerCase() === row.gelombang!.toLowerCase(),
              )
            : sheetWave;

        // Akun ortu — cari by no_hp; buat baru (password acak) jika belum ada.
        let parent = await this.prisma.user.findUnique({
          where: { phone: row.noHp },
        });
        if (!parent) {
          parent = await this.prisma.user.create({
            data: {
              name: row.namaOrtu.toUpperCase(),
              phone: row.noHp,
              email: row.emailOrtu ?? null,
              passwordHash: await argon2.hash(randomBytes(24).toString('hex')),
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
        } catch (e) {
          results.skipped++;
          results.errors.push(
            `[${sheetName}] baris ${line}: ${e instanceof Error ? e.message : 'error'}`,
          );
        }
      }
    }
    if (results.created === 0 && results.skipped === 0) {
      throw new BadRequestException('File Excel kosong');
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
        } catch {
          // Lewati berkas yang gagal diambil dari storage.
        }
      }
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
