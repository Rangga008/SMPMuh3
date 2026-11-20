import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { randomUUID } from 'node:crypto';
import { normalizePhone } from '../identity/users/users.service';
import { genStudentPassword } from '../students/students.service';
import {
  AttendanceRowDto,
  CollectionDto,
  ExamRoomDto,
  ExamSeatDto,
  QuestionDto,
  PassageDto,
  SaveAnswersDto,
  SaveAttendanceDto,
  ScheduleBlockDto,
  SubmissionDto,
  UniformDayDto,
} from './dto/ops.dto';
import { sanitizeHtml } from './question-docx';
import { parseXlsx } from '../core/xlsx-guard';

/**
 * Sanitasi mendalam untuk payload JSON soal (prompt/opsi/kunci) — setiap
 * string HTML disaring ke whitelist tag aman sebelum disimpan, sehingga
 * editor/impor tak bisa menyimpan <script>/handler on* yang nanti dieksekusi
 * di sesi admin kurikulum, superadmin, maupun aplikasi ujian siswa.
 */
const sanitizeDeep = (v: unknown, depth = 0): unknown => {
  if (v == null || depth > 6) return v;
  if (typeof v === 'string') return sanitizeHtml(v);
  if (Array.isArray(v)) return v.map((x) => sanitizeDeep(x, depth + 1));
  if (typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, sanitizeDeep(x, depth + 1)]),
    );
  return v;
};

const WIB = 'Asia/Jakarta';
const toDateOnly = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Tanggal tidak valid');
  return d;
};

@Injectable()
export class OpsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  // ================= ScheduleBlock (ishoma/pembiasaan) =================
  listBlocks(academicYearId: string) {
    return this.prisma.scheduleBlock.findMany({
      where: { academicYearId },
      orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
    });
  }

  createBlock(dto: ScheduleBlockDto) {
    if (!dto.day && !dto.date) throw new BadRequestException('Isi hari (rutin) atau tanggal spesifik.');
    return this.prisma.scheduleBlock.create({
      data: {
        label: dto.label,
        day: dto.day ?? null,
        date: dto.date ? toDateOnly(dto.date) : null,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        academicYearId: dto.academicYearId,
      },
    });
  }

  async deleteBlock(id: string) {
    await this.prisma.scheduleBlock.delete({ where: { id } });
    return { ok: true };
  }

  /** Jadwal lengkap satu kelas per hari — entries mapel + blok non-mapel. */
  async classTimetable(classId: string) {
    const cls = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      include: { academicYear: true },
    });
    const [entries, blocks] = await Promise.all([
      this.prisma.scheduleEntry.findMany({
        where: { assignment: { classId, academicYearId: cls.academicYearId } },
        include: {
          assignment: {
            include: { subject: true, employee: { select: { name: true } } },
          },
        },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.scheduleBlock.findMany({
        where: { academicYearId: cls.academicYearId, day: { not: null } },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
    ]);
    const days: Record<number, { type: 'lesson' | 'block'; start: number; end: number; label: string; code?: string | undefined; teacher?: string | undefined; room?: string | undefined }[]> = {};
    for (const e of entries) {
      (days[e.day] ??= []).push({
        type: 'lesson', start: e.startMinute, end: e.endMinute,
        label: e.assignment.subject.name, code: e.assignment.subject.code,
        teacher: e.assignment.employee.name, room: e.room ?? undefined,
      });
    }
    for (const b of blocks) {
      if (b.day) (days[b.day] ??= []).push({ type: 'block', start: b.startMinute, end: b.endMinute, label: b.label });
    }
    for (const d of Object.values(days)) d.sort((a, b) => a.start - b.start);
    return { class: cls, days };
  }

  /** Matriks jadwal sekolah per hari — semua kelas × segmen waktu, sel berisi
   *  nomor guru (legenda Daftar Guru). Dipakai export Excel & halaman cetak. */
  async timetableMatrix(academicYearId: string) {
    const classes = await this.prisma.class.findMany({
      where: { academicYearId },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    });
    const [entries, blocks] = await Promise.all([
      this.prisma.scheduleEntry.findMany({
        where: { assignment: { academicYearId } },
        include: {
          assignment: {
            include: { subject: { select: { name: true, code: true } }, employee: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.scheduleBlock.findMany({
        where: { academicYearId, day: { not: null } },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
    ]);
    // Legenda guru — nomor urut per nama.
    const byEmp = new Map<string, { name: string; subjects: Set<string>; dayCounts: Record<number, number> }>();
    for (const e of entries) {
      const emp = e.assignment.employee;
      const rec = byEmp.get(emp.id) ?? { name: emp.name, subjects: new Set<string>(), dayCounts: {} };
      rec.subjects.add(e.assignment.subject.name);
      rec.dayCounts[e.day] = (rec.dayCounts[e.day] ?? 0) + 1;
      byEmp.set(emp.id, rec);
    }
    const teachers = [...byEmp.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, r], i) => ({
        no: i + 1, id, name: r.name,
        subject: [...r.subjects].join(', '),
        dayCounts: r.dayCounts,
        total: Object.values(r.dayCounts).reduce((a, b) => a + b, 0),
      }));
    const tno = new Map(teachers.map((t) => [t.id, t.no]));
    // Mapel unik per kelas (untuk legenda "Mapel per Kelas" di export).
    const classSubjects = new Map<string, { subject: string; teacherNo: number; teacher: string }[]>();
    for (const e of entries) {
      const cid = e.assignment.classId;
      const sub = e.assignment.subject.name;
      const arr = classSubjects.get(cid) ?? [];
      if (!arr.some((x) => x.subject === sub)) {
        arr.push({
          subject: sub,
          teacherNo: tno.get(e.assignment.employee.id) ?? 0,
          teacher: e.assignment.employee.name,
        });
        classSubjects.set(cid, arr);
      }
    }
    for (const arr of classSubjects.values()) arr.sort((a, b) => a.subject.localeCompare(b.subject));
    const days = [1, 2, 3, 4, 5, 6].map((day) => {
      const ents = entries.filter((e) => e.day === day);
      const blks = blocks.filter((b) => b.day === day);
      const bounds = new Set<number>();
      for (const e of ents) { bounds.add(e.startMinute); bounds.add(e.endMinute); }
      for (const b of blks) { bounds.add(b.startMinute); bounds.add(b.endMinute); }
      const sorted = [...bounds].sort((a, b) => a - b);
      const rows: {
        start: number; end: number;
        block: { id: string; label: string } | null;
        cells: ({ entryId: string; teacherNo: number; subject: string; teacher: string } | null)[];
      }[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const s = sorted[i]!; const en = sorted[i + 1]!;
        const blk = blks.find((b) => b.startMinute <= s && b.endMinute >= en) ?? null;
        const cells = classes.map((c) => {
          const e = ents.find((x) => x.assignment.classId === c.id && x.startMinute <= s && x.endMinute >= en);
          return e
            ? {
                entryId: e.id, teacherNo: tno.get(e.assignment.employee.id) ?? 0,
                subject: e.assignment.subject.name, teacher: e.assignment.employee.name,
              }
            : null;
        });
        rows.push({ start: s, end: en, block: blk ? { id: blk.id, label: blk.label } : null, cells });
      }
      return { day, rows };
    });
    return { classes, teachers, days, classSubjects };
  }

  /**
   * Export jadwal ke Excel — format matriks dua kolom (seperti cetak resmi):
   * kolom kiri SENIN–KAMIS, kolom kanan JUMAT–SABTU lalu DAFTAR GURU.
   * Semua kelas jadi kolom; sel berisi nomor guru; blok non-mapel
   * (Ishoma/Istirahat/dst) tampil sebagai baris tergabung.
   */
  async timetableXlsx(classId: string | undefined, academicYearId: string) {
    const mx = await this.timetableMatrix(academicYearId);
    const [school, semester, year] = await Promise.all([
      this.prisma.school.findFirst({ select: { name: true, npsn: true } }),
      this.prisma.semester.findFirst({
        where: { academicYearId, isActive: true },
        select: { name: true },
      }),
      this.prisma.academicYear.findUnique({
        where: { id: academicYearId },
        select: { name: true },
      }),
    ]);
    const classIds = classId ? mx.classes.filter((c) => c.id === classId).map((c) => c.id) : mx.classes.map((c) => c.id);
    const classes = mx.classes.filter((c) => classIds.includes(c.id));
    const classIdx = classes.map((c) => mx.classes.findIndex((x) => x.id === c.id));
    const nCls = classes.length;
    const DAY_NAMES = ['', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];
    const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
    const W = 3 + nCls; // lebar blok hari: NO|WAKTU|JAM|KELAS×n

    const rows: (string | number)[][] = [];
    const merges: XLSX.Range[] = [];
    const cell = (r: number, c: number, v: string | number) => {
      while (rows.length <= r) rows.push([]);
      const row = rows[r]!;
      while (row.length <= c) row.push('');
      row[c] = v;
    };
    const merge = (r: number, c1: number, c2: number) =>
      merges.push({ s: { r, c: c1 }, e: { r, c: c2 } });

    // ---- Kop — selebar blok jadwal + kolom legenda ----
    const totalW = Math.max(W, 15);
    cell(0, 0, (school?.name ?? 'SMP MUHAMMADIYAH 3 KOTA BANDUNG').toUpperCase());
    merge(0, 0, totalW - 1);
    cell(1, 0, 'JADWAL PELAJARAN');
    merge(1, 0, totalW - 1);
    cell(
      2,
      0,
      `${semester ? `SEMESTER ${semester.name.toUpperCase()}` : 'SEMESTER'} - TAHUN AJARAN ${year?.name ?? ''}`,
    );
    merge(2, 0, totalW - 1);
    cell(4, 0, '1. JADWAL');

    // ---- Tulis blok hari mulai dari baris & kolom tertentu → tinggi blok ----
    const writeDay = (day: (typeof mx.days)[number], r0: number, c0: number): number => {
      let r = r0;
      cell(r, c0, DAY_NAMES[day.day] ?? `HARI ${day.day}`);
      merge(r, c0, c0 + W - 1);
      r += 1;
      // Header kolom: NO | WAKTU | JAM | KELAS (merged) lalu nama kelas.
      cell(r, c0, 'NO');
      cell(r, c0 + 1, 'WAKTU');
      cell(r, c0 + 2, 'JAM');
      cell(r, c0 + 3, 'KELAS');
      merge(r, c0 + 3, c0 + W - 1);
      r += 1;
      classes.forEach((c, i) => cell(r, c0 + 3 + i, c.name));
      r += 1;
      let period = 0;
      for (const row of day.rows) {
        if (row.block) {
          cell(r, c0 + 1, `${mm(row.start)}-${mm(row.end)}`);
          cell(r, c0 + 3, row.block.label);
          merge(r, c0 + 3, c0 + W - 1);
        } else {
          period += 1;
          cell(r, c0, period);
          cell(r, c0 + 1, `${mm(row.start)}-${mm(row.end)}`);
          cell(r, c0 + 2, period);
          classIdx.forEach((ci, i) => {
            const cellData = ci >= 0 ? row.cells[ci] : null;
            if (cellData) cell(r, c0 + 3 + i, cellData.teacherNo);
          });
        }
        r += 1;
      }
      return r; // baris bebas setelah blok
    };

    // ---- Semua hari ditulis berturut-turut di kolom kiri (SENIN–SABTU) ----
    const allDays = mx.days.filter((d) => d.rows.length);
    let rr = 6;
    for (const d of allDays) {
      rr = writeDay(d, rr, 0) + 1;
    }

    // ---- 2. Daftar Guru (kolom kiri, lanjut di bawah jadwal) ----
    const gc = 0;
    rr += 1;
    cell(rr, gc, '2. DAFTAR GURU');
    rr += 2;
    // Header 2 baris: 'JUMLAH JAM PERHARI' tergabung di atas kolom hari.
    cell(rr, gc + 8, 'JUMLAH JAM PERHARI');
    merge(rr, gc + 8, gc + 13);
    rr += 1;
    cell(rr, gc, 'NO');
    cell(rr, gc + 1, 'NAMA');
    merge(rr, gc + 1, gc + 2);
    cell(rr, gc + 3, 'MATA PELAJARAN');
    merge(rr, gc + 3, gc + 7);
    ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'JML'].forEach((h, i) => cell(rr, gc + 8 + i, h));
    rr += 1;
    for (const t of mx.teachers) {
      cell(rr, gc, t.no);
      cell(rr, gc + 1, t.name);
      merge(rr, gc + 1, gc + 2);
      cell(rr, gc + 3, t.subject);
      merge(rr, gc + 3, gc + 7);
      const cnt = [t.dayCounts[1] ?? 0, t.dayCounts[2] ?? 0, t.dayCounts[3] ?? 0, t.dayCounts[4] ?? 0, t.dayCounts[5] ?? 0, t.dayCounts[6] ?? 0, t.total];
      cnt.forEach((v, i) => cell(rr, gc + 8 + i, v));
      rr += 1;
    }

    // ---- 3. Mapel per kelas: kolom KELAS | NO | MATA PELAJARAN | GURU ----
    rr += 1;
    cell(rr, gc, '3. KODE MAPEL PER KELAS');
    rr += 1;
    cell(rr, gc, 'KELAS');
    cell(rr, gc + 1, 'NO');
    cell(rr, gc + 2, 'MATA PELAJARAN');
    merge(rr, gc + 2, gc + 4);
    cell(rr, gc + 5, 'GURU (NO)');
    merge(rr, gc + 5, gc + 8);
    rr += 1;
    for (const c of classes) {
      const subs = mx.classSubjects.get(c.id) ?? [];
      const r0 = rr;
      subs.forEach((s, i) => {
        cell(rr, gc + 1, i + 1);
        cell(rr, gc + 2, s.subject);
        merge(rr, gc + 2, gc + 4);
        cell(rr, gc + 5, `${s.teacher} (${s.teacherNo})`);
        merge(rr, gc + 5, gc + 8);
        rr += 1;
      });
      if (subs.length) {
        cell(r0, gc, c.name);
        if (subs.length > 1) merges.push({ s: { r: r0, c: gc }, e: { r: rr - 1, c: gc } });
      } else {
        cell(rr, gc, c.name);
        cell(rr, gc + 2, '—');
        rr += 1;
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 5 }, { wch: 13 }, { wch: 5 }, ...new Array(nCls).fill({ wch: 6 }) as { wch: number }[],
      // kolom ekstra untuk legenda guru/mapel (di luar lebar kolom kelas)
      { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jadwal');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ================= Butir soal & analisis =================
  /** Parser Excel/CSV import soal — dipakai ops.controller & cbt.controller.
   *  Tipe: PG/PGK/BS/BSK (B-S kompleks). Kolom A–E = pilihan/pernyataan,
   *  Kunci: PG→huruf · PGK→huruf-koma · BS→B/S · BSK→B,S per pernyataan. */
  parseQuestionWorkbook(file: Express.Multer.File): QuestionDto[] {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      throw new BadRequestException('Hanya file Excel (.xlsx/.xls) atau CSV.');
    }
    let wb: XLSX.WorkBook;
    try {
      wb = parseXlsx(file.buffer);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('File tidak dapat dibaca.');
    }
    const ws = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!ws) throw new BadRequestException('File tidak punya sheet.');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const hi = rows.findIndex((r) => String(r[0] ?? '').trim().toLowerCase() === 'no');
    if (hi < 0) throw new BadRequestException('Kolom header tidak ditemukan — pakai template yang disediakan.');
    const typeOf = (v: string) => {
      const t = v.toUpperCase().replace(/[\s-]+/g, '_');
      if (/^(PG|MCQ|PILIHAN_GANDA)$/.test(t)) return 'MCQ';
      if (/^(PGK|MCQ_COMPLEX|PILIHAN_GANDA_KOMPLEKS)/.test(t)) return 'MCQ_COMPLEX';
      if (/^(BS|B_S|TRUE_FALSE|BENAR_SALAH)$/.test(t)) return 'TRUE_FALSE';
      if (/^(BSK|B_S_K|BENAR_SALAH_KOMPLEKS|TRUE_FALSE_COMPLEX|TFK)/.test(t)) return 'TRUE_FALSE_COMPLEX';
      return '';
    };
    const letterIdx = (s: string) => 'ABCDE'.indexOf(s.trim().toUpperCase());
    const questions: QuestionDto[] = [];
    const errors: string[] = [];
    rows.slice(hi + 1).forEach((r, i) => {
      const line = hi + 2 + i;
      const no = Number(String(r[0] ?? '').trim());
      const cells = (j: number) => String(r[j] ?? '').trim();
      if (!cells(0) && !cells(1) && !cells(2)) return; // baris kosong
      if (/^contoh/i.test(cells(0))) return; // baris contoh template
      const type = typeOf(cells(1));
      const prompt = cells(2);
      if (!Number.isInteger(no) || no < 1) { errors.push(`Baris ${line}: nomor soal tidak valid.`); return; }
      if (!type) { errors.push(`Baris ${line}: tipe "${cells(1)}" tidak dikenal (PG/PGK/BS/BSK).`); return; }
      if (!prompt) { errors.push(`Baris ${line}: teks soal kosong.`); return; }
      const weight = Math.max(1, Math.round(Number(cells(10)) || 1));
      const choices = [3, 4, 5, 6, 7].map((j) => cells(j)).filter(Boolean);
      let options: unknown;
      let key: unknown;
      if (type === 'MCQ' || type === 'MCQ_COMPLEX') {
        if (choices.length < 2) { errors.push(`Baris ${line}: pilihan jawaban minimal 2.`); return; }
        options = { choices };
        const letters = cells(9).split(/[,;\s]+/).filter(Boolean);
        const idx = letters.map(letterIdx).filter((x) => x >= 0 && x < choices.length);
        if (type === 'MCQ') {
          if (idx.length !== 1) { errors.push(`Baris ${line}: kunci PG harus tepat satu huruf A–E.`); return; }
          key = idx[0];
        } else {
          if (idx.length < 1) { errors.push(`Baris ${line}: kunci PGK minimal satu huruf.`); return; }
          key = [...new Set(idx)];
        }
      } else if (type === 'TRUE_FALSE') {
        const k = cells(9).toUpperCase();
        if (!/^(B|BENAR|S|SALAH|TRUE|FALSE)$/.test(k)) {
          errors.push(`Baris ${line}: kunci BS harus B/Benar atau S/Salah.`); return;
        }
        key = /^(B|BENAR|TRUE)$/.test(k);
      } else {
        // BSK — kolom A–E = pernyataan-pernyataan; kunci = B/S per pernyataan dipisah koma.
        if (choices.length < 2) { errors.push(`Baris ${line}: BSK butuh ≥2 pernyataan di kolom A–E.`); return; }
        options = { statements: choices };
        const marks = cells(9).split(/[,;\s]+/).filter(Boolean).map((m) => m.toUpperCase());
        if (marks.length !== choices.length || marks.some((m) => !/^(B|BENAR|S|SALAH|TRUE|FALSE)$/.test(m))) {
          errors.push(`Baris ${line}: kunci BSK = B/S per pernyataan (${choices.length} buah), dipisah koma — mis. B,S,B.`); return;
        }
        key = marks.map((m) => /^(B|BENAR|TRUE)$/.test(m));
      }
      const passageCode = cells(11).toUpperCase() || undefined;
      questions.push({ number: no, type: type as QuestionDto['type'], weight, prompt, options, key, ...(passageCode ? { passageCode } : {}) });
    });
    if (errors.length) throw new BadRequestException(errors.slice(0, 8).join(' '));
    if (!questions.length) throw new BadRequestException('Tidak ada baris soal yang valid.');
    const dup = new Set<number>();
    for (const q of questions) {
      if (dup.has(q.number)) throw new BadRequestException(`Nomor soal ${q.number} ganda.`);
      dup.add(q.number);
    }
    return questions;
  }

  /** Bacaan dari sheet "Bacaan" di workbook Excel — kolom: Kode | Teks. */
  parsePassageSheet(file: Express.Multer.File): PassageDto[] {
    try {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      const ws = wb.Sheets['Bacaan'];
      if (!ws) return [];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
      const out: PassageDto[] = [];
      for (const r of rows) {
        const code = String(r[0] ?? '').trim().toUpperCase();
        const text = String(r[1] ?? '').trim();
        if (!code || /^kode$/i.test(code) || !text) continue;
        out.push({ code, content: `<p>${text.replace(/\n+/g, '</p><p>')}</p>` });
      }
      return out;
    } catch { return []; }
  }

  /** Parse Word (.docx) — tabel soal + tabel BACAAN; gambar diupload ke storage. */
  async parseQuestionDocx(file: Express.Multer.File): Promise<{ questions: QuestionDto[]; passages: PassageDto[] }> {
    const { parseQuestionDocxBuffer } = await import('./question-docx.js');
    const parsed = await parseQuestionDocxBuffer(file.buffer);
    if (parsed.errors.length) throw new BadRequestException(parsed.errors.slice(0, 8).join(' '));
    if (!parsed.questions.length) throw new BadRequestException('Tidak ada soal valid di file Word.');
    const upload = async (imgs: { ref: string; buf: Buffer; ext: string; mime: string }[], html: string) => {
      const media: { key: string; name: string }[] = [];
      const urls = new Map<string, string>();
      for (const img of imgs) {
        const key = `qmedia/${randomUUID()}.${img.ext}`;
        await this.storage.putObject(key, img.buf, img.mime);
        media.push({ key, name: `${img.ref}.${img.ext}` });
        urls.set(`{{media:${img.ref}}}`, `/cbt/media/${key}`);
      }
      let out = html;
      for (const [mk, url] of urls) out = out.split(mk).join(url);
      return { html: out, media, urls };
    };
    // Ganti marker {{media:ref}} di seluruh string JSON opsi (jawaban boleh berupa gambar).
    const fixMarkers = (v: unknown, urls: Map<string, string>): unknown => {
      if (!urls.size || v === undefined || v === null) return v;
      if (typeof v === 'string') {
        let s = v;
        for (const [mk, url] of urls) s = s.split(mk).join(url);
        return s;
      }
      if (Array.isArray(v)) return v.map((x) => fixMarkers(x, urls));
      if (typeof v === 'object') {
        return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fixMarkers(x, urls)]));
      }
      return v;
    };
    const passages: PassageDto[] = [];
    for (const p of parsed.passages) {
      const r = await upload(p.images, p.content);
      passages.push({ code: p.code, content: r.html, media: r.media });
    }
    const questions: QuestionDto[] = [];
    for (const q of parsed.questions) {
      const r = await upload(q.images, q.prompt);
      questions.push({
        number: q.number, type: q.type, weight: q.weight, prompt: r.html,
        ...(q.options !== undefined ? { options: fixMarkers(q.options, r.urls) as QuestionDto['options'] } : {}),
        ...(q.key !== undefined ? { key: q.key } : {}),
        ...(q.passageCode ? { passageCode: q.passageCode } : {}),
        ...(r.media.length ? { media: r.media } : {}),
      });
    }
    return { questions, passages };
  }

  /** Unggah satu gambar untuk disisipkan di soal/opsi/bacaan — hasil: key + url sisip. */
  async uploadQuestionMedia(file: Express.Multer.File) {
    const mime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.mimetype];
    if (!mime) throw new BadRequestException('Gambar harus JPG/PNG/WebP/GIF.');
    const key = `qmedia/${randomUUID()}.${mime}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return { key, url: `/cbt/media/${key}` };
  }

  async setQuestions(assessmentId: string, questions: QuestionDto[], passages?: PassageDto[]) {
    await this.prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.deleteMany({ where: { assessmentId } });
      const created = await tx.assessmentQuestion.createMany({
        data: questions.map((q) => ({
          assessmentId, number: q.number, type: q.type as never,
          weight: q.weight ?? 1,
          key: q.key === undefined ? Prisma.JsonNull : (sanitizeDeep(q.key) as Prisma.InputJsonValue),
          prompt: q.prompt ? sanitizeHtml(q.prompt) : null,
          options: q.options === undefined ? Prisma.JsonNull : (sanitizeDeep(q.options) as Prisma.InputJsonValue),
          passageCode: q.passageCode ?? null,
          media: q.media === undefined ? Prisma.JsonNull : (q.media as Prisma.InputJsonValue),
        })),
      });
      if (passages?.length) {
        const codes = new Set(passages.map((p) => p.code));
        await tx.assessmentPassage.deleteMany({ where: { assessmentId, code: { notIn: [...codes] } } });
        for (const [i, p] of passages.entries()) {
          const content = sanitizeHtml(p.content);
          await tx.assessmentPassage.upsert({
            where: { assessmentId_code: { assessmentId, code: p.code } },
            update: { content, sortOrder: i, ...(p.media ? { media: p.media as Prisma.InputJsonValue } : {}) },
            create: { assessmentId, code: p.code, content, sortOrder: i, media: p.media === undefined ? Prisma.JsonNull : (p.media as Prisma.InputJsonValue) },
          });
        }
      }
      return { count: created.count, passages: passages?.length ?? 0 };
    });
  }

  listQuestions(assessmentId: string) {
    return this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { number: 'asc' },
      include: { _count: { select: { answers: true } } },
    });
  }

  // ---- Soal per-ujian (model baru — asesmen hanya payung periode) ----

  listExamQuestions(examId: string) {
    return this.prisma.assessmentQuestion.findMany({
      where: { examId },
      orderBy: { number: 'asc' },
      include: { _count: { select: { answers: true } } },
    });
  }

  /** Simpan seluruh butir soal satu ujian — bacaan tetap milik asesmen induk
   *  (exam.assessmentId) agar semua ujian se-payung bisa merujuk kode bacaan. */
  async setExamQuestions(examId: string, questions: QuestionDto[], passages?: PassageDto[]) {
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId }, select: { id: true, assessmentId: true } });
    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.deleteMany({ where: { examId } });
      const created = await tx.assessmentQuestion.createMany({
        data: questions.map((q) => ({
          examId, assessmentId: null, number: q.number, type: q.type as never,
          weight: q.weight ?? 1,
          key: q.key === undefined ? Prisma.JsonNull : (sanitizeDeep(q.key) as Prisma.InputJsonValue),
          prompt: q.prompt ? sanitizeHtml(q.prompt) : null,
          options: q.options === undefined ? Prisma.JsonNull : (sanitizeDeep(q.options) as Prisma.InputJsonValue),
          passageCode: q.passageCode ?? null,
          media: q.media === undefined ? Prisma.JsonNull : (q.media as Prisma.InputJsonValue),
        })),
      });
      if (passages?.length) {
        const codes = new Set(passages.map((p) => p.code));
        await tx.assessmentPassage.deleteMany({ where: { assessmentId: exam.assessmentId, code: { notIn: [...codes] } } });
        for (const [i, p] of passages.entries()) {
          const content = sanitizeHtml(p.content);
          await tx.assessmentPassage.upsert({
            where: { assessmentId_code: { assessmentId: exam.assessmentId, code: p.code } },
            update: { content, sortOrder: i, ...(p.media ? { media: p.media as Prisma.InputJsonValue } : {}) },
            create: { assessmentId: exam.assessmentId, code: p.code, content, sortOrder: i, media: p.media === undefined ? Prisma.JsonNull : (p.media as Prisma.InputJsonValue) },
          });
        }
      }
      return { count: created.count, passages: passages?.length ?? 0 };
    });
  }

  listPassages(assessmentId: string) {
    return this.prisma.assessmentPassage.findMany({ where: { assessmentId }, orderBy: { sortOrder: 'asc' } });
  }

  /** Simpan daftar bacaan — upsert per kode, yang tidak ada di daftar dihapus. */
  async setPassages(assessmentId: string, passages: PassageDto[]) {
    await this.prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
    const codes = new Set(passages.map((p) => p.code));
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentPassage.deleteMany({ where: { assessmentId, code: { notIn: [...codes] } } });
      for (const [i, p] of passages.entries()) {
        const content = sanitizeHtml(p.content);
        await tx.assessmentPassage.upsert({
          where: { assessmentId_code: { assessmentId, code: p.code } },
          update: { content, sortOrder: i, ...(p.media !== undefined ? { media: p.media as Prisma.InputJsonValue } : {}) },
          create: { assessmentId, code: p.code, content, sortOrder: i, media: p.media === undefined ? Prisma.JsonNull : (p.media as Prisma.InputJsonValue) },
        });
      }
    });
    return { count: passages.length };
  }

  /** Template Excel import soal — dipakai asesmen & ujian; `counts` → baris
   *  kosong bernomor per tipe (generator), tanpa counts → contoh terisi. */
  questionTemplateXlsx(counts?: { pg?: number; pgk?: number; bs?: number; bsk?: number }): Buffer {
    const n = (v?: number) => Math.min(200, Math.max(0, Math.floor(v || 0)));
    const rows: string[][] = [
      ['TEMPLATE IMPORT SOAL — isi kolom Soal, A–E, Kunci mulai BARIS 6 (baris keterangan jangan diubah)'],
      ['Tipe : PG = pilihan ganda · PGK = pilihan ganda kompleks (centang ≥1) · BS = benar/salah · BSK = benar/salah kompleks (beberapa pernyataan)'],
      ['Kunci: PG → satu huruf (C) · PGK → huruf dipisah koma (A,C) · BS → B atau S · BSK → B/S per pernyataan dipisah koma (B,S,B)'],
      ['Kolom A–E: PG/PGK = pilihan jawaban · BSK = daftar pernyataan'],
      [],
      ['No', 'Tipe', 'Soal', 'A', 'B', 'C', 'D', 'E', '', 'Kunci', 'Bobot'],
    ];
    let no = 1;
    if (counts) {
      for (const [tipe, cnt] of [['PG', n(counts.pg)], ['PGK', n(counts.pgk)], ['BS', n(counts.bs)], ['BSK', n(counts.bsk)]] as const) {
        for (let i = 0; i < cnt; i++) rows.push([String(no++), tipe, '', '', '', '', '', '', '', '', '1']);
      }
      if (no === 1) rows.push(['1', 'PG', '', '', '', '', '', '', '', '', '', '1']);
    } else {
      rows.push(
        ['CONTOH 1 (hapus)', 'PG', 'Ibu kota Indonesia adalah…', 'Surabaya', 'Bandung', 'Jakarta', 'Medan', '', '', 'C', '1'],
        ['CONTOH 2 (hapus)', 'PGK', 'Pilih semua bilangan prima:', '2', '4', '5', '9', '', '', '', 'A,C', '2'],
        ['CONTOH 3 (hapus)', 'BS', 'Indonesia merdeka tahun 1945.', '', '', '', '', '', '', 'B', '1'],
        ['CONTOH 4 (hapus)', 'BSK', 'Tentukan benar/salah tiap pernyataan:', 'Air mendidih pada 100°C', 'Es lebih padat dari air', 'Bandung di Jawa Barat', '', '', '', 'B,S,B', '2', ''],
        ['CONTOH 5 (hapus)', 'PG', 'Berdasarkan bacaan B1, tokoh utama cerita adalah…', 'Siti', 'Budi', 'Andi', 'Rina', '', '', 'A', '1', 'B1'],
      );
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 4 }, { wch: 7 }, { wch: 44 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 2 }, { wch: 10 }, { wch: 6 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Soal');
    const bacaan = XLSX.utils.aoa_to_sheet([
      ['Kode', 'Teks'],
      ['B1', '(contoh — hapus) Siti adalah siswa kelas 9 yang rajin. Setiap pagi ia berangkat ke sekolah naik sepeda. Ia gemar membaca buku cerita di perpustakaan.'],
    ]);
    bacaan['!cols'] = [{ wch: 8 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, bacaan, 'Bacaan');
    const guide = XLSX.utils.json_to_sheet([
      { kolom: 'No', wajib: 'YA', keterangan: 'Nomor urut soal — mulai 1, jangan dobel' },
      { kolom: 'Tipe', wajib: 'YA', keterangan: 'PG / PGK / BS / BSK — juga menerima MCQ / MCQ_COMPLEX / TRUE_FALSE / TRUE_FALSE_COMPLEX' },
      { kolom: 'Soal', wajib: 'YA', keterangan: 'Teks pertanyaan' },
      { kolom: 'A–E', wajib: 'PG, PGK & BSK', keterangan: 'PG/PGK: pilihan jawaban (min. 2, maks. 5) · BSK: daftar pernyataan (min. 2, maks. 5)' },
      { kolom: 'Kunci', wajib: 'YA', keterangan: 'PG: satu huruf · PGK: huruf-koma (A,C) · BS: B/S · BSK: B/S per pernyataan, koma (B,S,B)' },
      { kolom: 'Bobot', wajib: 'tidak', keterangan: 'Bobot nilai soal — kosong = 1' },
      { kolom: 'Bacaan', wajib: 'tidak', keterangan: 'Kode bacaan dari sheet "Bacaan" (mis. B1) — soal menampilkan bacaan di atasnya' },
    ]);
    guide['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Template Word import soal — tabel per soal + bacaan, contoh semua tipe. */
  questionTemplateDocx(): Promise<Buffer> {
    return import('./question-docx.js').then((m) => m.buildQuestionTemplateDocx());
  }

  async saveAnswers(questionId: string, dto: SaveAnswersDto) {
    const q = await this.prisma.assessmentQuestion.findUniqueOrThrow({ where: { id: questionId } });
    return this.prisma.$transaction(async (tx) => {
      for (const r of dto.rows) {
        await tx.studentAnswer.upsert({
          where: { questionId_studentId: { questionId: q.id, studentId: r.studentId } },
          update: {
            answer: r.answer === undefined ? Prisma.JsonNull : (r.answer as Prisma.InputJsonValue),
            score: r.score, isCorrect: r.isCorrect ?? null,
          },
          create: {
            questionId: q.id, studentId: r.studentId,
            answer: r.answer === undefined ? Prisma.JsonNull : (r.answer as Prisma.InputJsonValue),
            score: r.score, isCorrect: r.isCorrect ?? null,
          },
        });
      }
      return { saved: dto.rows.length };
    });
  }

  /** Analisis butir: per soal — jumlah benar, % ketepatan, rata-rata skor. */
  async questionAnalysis(assessmentId: string) {
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { number: 'asc' },
      include: { answers: { select: { studentId: true, score: true, isCorrect: true, answer: true } } },
    });
    const rows = questions.map((q) => {
      const total = q.answers.length;
      const correct = q.answers.filter((a) => a.isCorrect === true).length;
      const avgScore = total ? q.answers.reduce((s, a) => s + a.score, 0) / total : 0;
      return {
        id: q.id, number: q.number, type: q.type, weight: q.weight,
        prompt: q.prompt, key: q.key,
        answered: total, correct,
        correctPct: total ? Math.round((correct / total) * 100) : null,
        avgScore: Math.round(avgScore * 100) / 100,
        difficulty: total ? (avgScore / q.weight >= 0.75 ? 'Mudah' : avgScore / q.weight >= 0.4 ? 'Sedang' : 'Sukar') : null,
      };
    });
    return { questions: rows };
  }

  /** Rekap jawaban siswa per soal — matriks siswa × butir. */
  async answerMatrix(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { class: true, subject: true },
    });
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId }, orderBy: { number: 'asc' },
    });
    const qIds = questions.map((q) => q.id);
    const [students, answers, enrolls] = await Promise.all([
      assessment.classId
        ? this.prisma.enrollment.findMany({
            where: { classId: assessment.classId, academicYearId: assessment.academicYearId, student: { status: 'ACTIVE' } },
            include: { student: { select: { id: true, name: true, nis: true } } },
            orderBy: { student: { name: 'asc' } },
          }).then((es) => es.map((e) => e.student))
        : this.prisma.student.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, take: 500 }),
      this.prisma.studentAnswer.findMany({ where: { questionId: { in: qIds } } }),
      this.prisma.enrollment.findMany({
        where: { academicYearId: assessment.academicYearId },
        select: { studentId: true, class: { select: { id: true, name: true, gradeLevel: true } } },
      }),
    ]);
    const clsOf = new Map(enrolls.map((e) => [e.studentId, e.class]));
    const map = new Map(answers.map((a) => [`${a.questionId}:${a.studentId}`, a]));
    return {
      assessment: { id: assessment.id, name: assessment.name, subject: assessment.subject?.name ?? null, class: assessment.class?.name },
      questions: questions.map((q) => ({ id: q.id, number: q.number, type: q.type, weight: q.weight, key: q.key })),
      students: students.map((s) => ({
        id: s.id, name: s.name, nis: s.nis,
        classId: clsOf.get(s.id)?.id ?? null,
        className: clsOf.get(s.id)?.name ?? null,
        cells: questions.map((q) => {
          const a = map.get(`${q.id}:${s.id}`);
          return a ? { score: a.score, isCorrect: a.isCorrect, answer: a.answer } : null;
        }),
        total: questions.reduce((acc, q) => acc + (map.get(`${q.id}:${s.id}`)?.score ?? 0), 0),
      })),
    };
  }

  /** Ledger nilai: per kelas × siswa × mapel — rata-rata tiap mapel. */
  async gradeLedger(classId: string, academicYearId: string) {
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const students = await this.prisma.enrollment.findMany({
      where: { classId, academicYearId, student: { status: 'ACTIVE' } },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
    const grades = await this.prisma.grade.findMany({
      where: {
        OR: [{ assessment: { academicYearId } }, { exam: { academicYearId } }],
        studentId: { in: students.map((s) => s.studentId) },
      },
      include: {
        assessment: { include: { subject: { select: { id: true, name: true, code: true } } } },
        exam: { include: { subject: { select: { id: true, name: true, code: true } } } },
      },
    });
    // Mapel kolom diambil dari nilai + asesmen kelas + SEMUA ujian bermapel
    // yang mencakup kelas ini — kolom tetap tampil walau nilai belum diisi.
    const [assessments, exams] = await Promise.all([
      this.prisma.assessment.findMany({
        where: { academicYearId, OR: [{ classId }, { classId: null }], subjectId: { not: null } },
        select: { subject: { select: { id: true, name: true, code: true } } },
      }),
      this.prisma.exam.findMany({
        where: { academicYearId, subjectId: { not: null } },
        select: { classIds: true, subject: { select: { id: true, name: true, code: true } } },
      }),
    ]);
    const subjects = new Map<string, { id: string; name: string; code: string }>();
    for (const a of assessments) if (a.subject) subjects.set(a.subject.id, a.subject);
    for (const e of exams) if (e.subject && (e.classIds as string[]).includes(classId)) subjects.set(e.subject.id, e.subject);
    const cell = new Map<string, number[]>();
    for (const g of grades) {
      const sub = g.exam?.subject ?? g.assessment?.subject;
      if (!sub) continue;
      subjects.set(sub.id, sub);
      const key = `${g.studentId}:${sub.id}`;
      (cell.get(key) ?? cell.set(key, []).get(key)!).push(g.score);
    }
    const subjectList = [...subjects.values()].sort((a, b) => a.code.localeCompare(b.code));
    return {
      class: cls,
      subjects: subjectList,
      students: students.map((e) => ({
        id: e.student.id, name: e.student.name, nis: e.student.nis,
        scores: subjectList.map((sub) => {
          const arr = cell.get(`${e.student.id}:${sub.id}`) ?? [];
          return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        }),
      })),
    };
  }

  /** Ledger nilai satu kelas → sheet Excel (siswa × mapel). */
  async gradeLedgerXlsx(classId: string, academicYearId: string) {
    const l = await this.gradeLedger(classId, academicYearId);
    const rows: (string | number)[][] = [
      [`DAFTAR NILAI — ${l.class.name}`],
      [],
      ['NO', 'NIS', 'SISWA', ...l.subjects.map((s) => s.code)],
      ...l.students.map((s, i) => [i + 1, s.nis ?? '', s.name, ...s.scores.map((sc) => sc ?? '')]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 30 }, ...l.subjects.map(() => ({ wch: 8 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, l.class.name.slice(0, 31));
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Statistik mapel satu kelas → sheet Excel. */
  async classSubjectStatsXlsx(classId: string, academicYearId: string) {
    const stats = await this.classSubjectStats(classId, academicYearId);
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const rows: (string | number)[][] = [
      [`STATISTIK MAPEL — ${cls.name}`],
      [],
      ['KODE', 'MATA PELAJARAN', 'PENILAIAN', 'RATA-RATA', 'MIN', 'MAX'],
      ...stats.map((s) => [s.subject.code, s.subject.name, s.count, s.avg ?? '', s.min ?? '', s.max ?? '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 11 }, { wch: 11 }, { wch: 7 }, { wch: 7 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statistik');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Rekap absen satu kelas per rentang tanggal → sheet Excel. */
  async attendanceRecapClassXlsx(classId: string, from: string, to: string) {
    const r = await this.attendanceRecap(classId, from, to);
    const rows: (string | number)[][] = [
      [`REKAP ABSEN — ${r.class.name} · ${from} s.d. ${to} (${r.daysTaken} hari)`],
      [],
      ['NO', 'NIS', 'SISWA', 'HADIR', 'SAKIT', 'IZIN', 'ALPHA', '% HADIR'],
      ...r.students.map((s, i) => [i + 1, s.nis ?? '', s.name, s.present, s.sick, s.permit, s.absent, s.presentPct != null ? `${s.presentPct}%` : '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 12 }, { wch: 30 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, r.class.name.slice(0, 31));
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Rekap nilai leger format "Buku Daya Serap" — satu workbook per tahun ajaran:
      - sheet per rombel: leger siswa × mapel + Jml + Rata-rata + Rangking kelas
      - sheet "Rekap Perkelas": rata-rata mapel per rombel, berkelompok jenjang
      - sheet "Daya Serap": per rombel — RATA-RATA / TERTINGGI / TERENDAH per mapel. */
  async dayaSerapXlsx(academicYearId: string, gradeLevel?: number, semesterLabel?: string) {
    const year = await this.prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } });
    const classes = await this.prisma.class.findMany({
      where: { academicYearId, ...(gradeLevel ? { gradeLevel } : {}) },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const ledgers = await Promise.all(classes.map((c) => this.gradeLedger(c.id, academicYearId)));
    // Kolom mapel gabungan semua kelas — urut kode agar konsisten antar sheet.
    const subjects = new Map<string, { id: string; name: string; code: string }>();
    for (const l of ledgers) for (const s of l.subjects) subjects.set(s.id, s);
    const subjectList = [...subjects.values()].sort((a, b) => a.code.localeCompare(b.code));
    const n = subjectList.length;
    const r1 = (v: number | null) => (v == null ? '' : Math.round(v * 10) / 10);
    const semLabel = semesterLabel?.trim() || 'SEMESTER';
    const kopRows = (kelasLabel?: string): (string | number)[][] => [
      ['NILAI LEGER/RAPORT'],
      [semLabel],
      [`TAHUN PELAJARAN ${year.name}`],
      ...(kelasLabel ? [[`KELAS/LEVEL :`, '', kelasLabel]] : []),
      [],
      ['SATUAN PENDIDIKAN SMP MUHAMMADIYAH 3 BANDUNG'],
    ];

    const wb = XLSX.utils.book_new();
    type ClsAgg = {
      cls: (typeof classes)[number];
      subjectAvg: (number | null)[];
      subjectMax: (number | null)[];
      subjectMin: (number | null)[];
      totalAvg: number | null;
      count: number;
    };
    const aggs: ClsAgg[] = [];

    // --- Sheet per rombel: leger + ranking ---
    for (const l of ledgers) {
      const idx = l.subjects.map((s) => subjectList.findIndex((x) => x.id === s.id));
      const rows = l.students.map((st) => {
        const cells = subjectList.map((_, i) => ((idx[i] ?? -1) >= 0 ? st.scores[idx[i]!] ?? null : null));
        const filled = cells.filter((v): v is number => v != null);
        const jml = filled.reduce((a, b) => a + b, 0);
        return {
          name: st.name, cells, jml: filled.length ? jml : null,
          avg: filled.length ? jml / filled.length : null,
          rank: null as number | null,
        };
      });
      // Rangking kompetisi dalam kelas — total sama = peringkat sama.
      const totals = rows.map((r) => r.jml ?? -1);
      for (const r of rows) {
        r.rank = r.jml == null ? null : 1 + totals.filter((t) => t > r.jml!).length;
      }
      const sheetRows: (string | number)[][] = [
        ...kopRows(l.class.name),
        ['NO', 'NAMA PESERTA', 'NILAI MATA PELAJARAN', ...Array<string>(Math.max(0, n + 1)).fill(''), 'RATA-RATA', 'RANGKING'],
        ['', '', ...subjectList.map((s) => s.code), 'Jml', '', ''],
        ...rows.map((r, i) => [i + 1, r.name, ...r.cells.map(r1), r.jml ?? '', r1(r.avg), r.rank ?? '']),
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws['!cols'] = [{ wch: 4 }, { wch: 28 }, ...subjectList.map(() => ({ wch: 7 })), { wch: 7 }, { wch: 9 }, { wch: 9 }];
      const hr = kopRows(l.class.name).length; // baris judul header (0-indexed)
      ws['!merges'] = [
        { s: { c: 2, r: hr }, e: { c: 2 + n, r: hr } }, // "NILAI MATA PELAJARAN" melebar
        { s: { c: 0, r: hr }, e: { c: 0, r: hr + 1 } }, // NO
        { s: { c: 1, r: hr }, e: { c: 1, r: hr + 1 } }, // NAMA PESERTA
        { s: { c: 3 + n, r: hr }, e: { c: 3 + n, r: hr + 1 } }, // RATA-RATA
        { s: { c: 4 + n, r: hr }, e: { c: 4 + n, r: hr + 1 } }, // RANGKING
      ];
      XLSX.utils.book_append_sheet(wb, ws, l.class.name.slice(0, 31));

      // Agregat untuk rekap: rata-rata/min/max per mapel dari nilai yang terisi.
      const col = (i: number) => rows.map((r) => r.cells[i]).filter((v): v is number => v != null);
      aggs.push({
        cls: l.class, count: rows.length,
        subjectAvg: subjectList.map((_, i) => { const v = col(i); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }),
        subjectMax: subjectList.map((_, i) => { const v = col(i); return v.length ? Math.max(...v) : null; }),
        subjectMin: subjectList.map((_, i) => { const v = col(i); return v.length ? Math.min(...v) : null; }),
        totalAvg: (() => { const v = rows.map((r) => r.avg).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })(),
      });
    }

    // --- Sheet "Rekap Perkelas": rata-rata mapel per rombel per jenjang ---
    const gradeGroups = new Map<number, ClsAgg[]>();
    for (const a of aggs) (gradeGroups.get(a.cls.gradeLevel) ?? gradeGroups.set(a.cls.gradeLevel, []).get(a.cls.gradeLevel)!).push(a);
    const rekapRows: (string | number)[][] = [
      ...kopRows(),
      ['NO', 'KELAS/LEVEL', 'NILAI MATA PELAJARAN', ...Array<string>(Math.max(0, n + 1)).fill(''), 'RATA-RATA', 'RANGKING'],
      ['', '', ...subjectList.map((s) => s.code), 'Jml', '', ''],
    ];
    for (const [lvl, group] of [...gradeGroups.entries()].sort((a, b) => a[0] - b[0])) {
      const avgs = group.map((g) => g.totalAvg ?? -1);
      group.forEach((g, i) => {
        rekapRows.push([i + 1, g.cls.name, ...g.subjectAvg.map(r1), r1(g.subjectAvg.reduce((a: number, b) => a + (b ?? 0), 0)), r1(g.totalAvg), g.totalAvg == null ? '' : 1 + avgs.filter((x) => x > g.totalAvg!).length]);
      });
      const sumCol = (arr: (number | null)[][]) => subjectList.map((_, i) => arr.reduce((a, b) => a + (b[i] ?? 0), 0));
      const avgCol = (arr: (number | null)[][]) => subjectList.map((_, i) => { const v = arr.map((x) => x[i]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
      rekapRows.push(['JUMLAH', '', ...sumCol(group.map((g) => g.subjectAvg)).map(r1), '', r1(group.reduce((a, g) => a + (g.totalAvg ?? 0), 0)), '']);
      rekapRows.push(['RATA-RATA', `Kelas ${lvl}`, ...avgCol(group.map((g) => g.subjectAvg)).map(r1), '', r1(group.length ? group.reduce((a, g) => a + (g.totalAvg ?? 0), 0) / group.length : null), '']);
    }
    const wsR = XLSX.utils.aoa_to_sheet(rekapRows);
    wsR['!cols'] = [{ wch: 9 }, { wch: 12 }, ...subjectList.map(() => ({ wch: 7 })), { wch: 8 }, { wch: 9 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, wsR, 'Rekap Perkelas');

    // --- Sheet "Daya Serap": per rombel — rata-rata / tertinggi / terendah ---
    const dsRows: (string | number)[][] = [
      ...kopRows(),
      ['NO', 'KELAS', '', 'NILAI MATA PELAJARAN', ...Array<string>(Math.max(0, n)).fill(''), 'RATA-RATA'],
      ['', '', '', ...subjectList.map((s) => s.code), 'Jml', ''],
    ];
    for (const [lvl, group] of [...gradeGroups.entries()].sort((a, b) => a[0] - b[0])) {
      group.forEach((g, i) => {
        dsRows.push([i + 1, g.cls.name, 'RATA-RATA', ...g.subjectAvg.map(r1), r1(g.subjectAvg.reduce((a: number, b) => a + (b ?? 0), 0)), r1(g.totalAvg)]);
        dsRows.push(['', '', 'TERTINGGI', ...g.subjectMax.map(r1), '', '']);
        dsRows.push(['', '', 'TERENDAH', ...g.subjectMin.map(r1), '', '']);
      });
      dsRows.push(['JENJANG', `Kelas ${lvl}`, 'RATA-RATA', ...subjectList.map((_, i) => { const v = group.map((g) => g.subjectAvg[i]).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }).map(r1), '', '']);
      dsRows.push([]);
    }
    const wsD = XLSX.utils.aoa_to_sheet(dsRows);
    wsD['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 12 }, ...subjectList.map(() => ({ wch: 7 })), { wch: 8 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, wsD, 'Daya Serap');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Statistik per mapel dalam satu kelas: avg/min/max + jumlah penilai.
      Nilai dibaca dari Grade — menempel ke ujian (baru) maupun asesmen (lama). */
  async classSubjectStats(classId: string, academicYearId: string) {
    const students = await this.prisma.enrollment.findMany({
      where: { classId, academicYearId, student: { status: 'ACTIVE' } },
      select: { studentId: true },
    });
    const grades = await this.prisma.grade.findMany({
      where: {
        studentId: { in: students.map((s) => s.studentId) },
        OR: [{ assessment: { academicYearId } }, { exam: { academicYearId } }],
      },
      include: {
        assessment: { select: { subject: { select: { id: true, name: true, code: true } } } },
        exam: { select: { subject: { select: { id: true, name: true, code: true } } } },
      },
    });
    const perSubject = new Map<string, { subject: { id: string; name: string; code: string }; scores: number[] }>();
    for (const g of grades) {
      const sub = g.exam?.subject ?? g.assessment?.subject;
      if (!sub) continue;
      const entry = perSubject.get(sub.id) ?? perSubject.set(sub.id, { subject: sub, scores: [] }).get(sub.id)!;
      entry.scores.push(g.score);
    }
    return [...perSubject.values()].map(({ subject, scores }) => ({
      subject,
      count: scores.length,
      avg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
    })).sort((a, b) => a.subject.code.localeCompare(b.subject.code));
  }

  // ================= Absen siswa harian oleh guru =================
  /** Jadwal mengajar guru login hari ini — untuk dipilih saat absen. */
  async teacherToday(userId: string, dateIso?: string) {
    const emp = await this.prisma.employee.findUnique({ where: { userId } });
    if (!emp) throw new NotFoundException('Akun belum tertaut pegawai.');
    const date = dateIso ? toDateOnly(dateIso) : new Date();
    const dow = new Date(date.toLocaleString('en-US', { timeZone: WIB })).getDay() || 7; // 1=Sen
    const year = await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new BadRequestException('Tahun ajaran aktif tidak ada.');
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { employeeId: emp.id, academicYearId: year.id },
      include: { class: true, subject: true, schedules: true },
    });
    const today = assignments
      .filter((a) => a.schedules.some((s) => s.day === dow))
      .flatMap((a) => a.schedules.filter((s) => s.day === dow).map((s) => ({
        assignmentId: a.id, class: a.class, subject: a.subject,
        startMinute: s.startMinute, endMinute: s.endMinute, room: s.room,
      })))
      .sort((a, b) => a.startMinute - b.startMinute);
    return { employee: emp, date, dayOfWeek: dow, sessions: today, year };
  }

  /** Siswa satu kelas + status absen tanggal tsb — prefill PRESENT utk auto-absen. */
  async classAttendance(classId: string, dateIso: string) {
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const date = toDateOnly(dateIso);
    const [students, records] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, academicYearId: cls.academicYearId, student: { status: 'ACTIVE' } },
        include: { student: { select: { id: true, name: true, nis: true } } },
        orderBy: { student: { name: 'asc' } },
      }),
      this.prisma.attendanceRecord.findMany({ where: { classId, date } }),
    ]);
    const map = new Map(records.map((r) => [r.studentId, r]));
    let takenByName: string | null = null;
    const takerId = records.find((r) => r.takenBy)?.takenBy;
    if (takerId) {
      const u = await this.prisma.user.findUnique({
        where: { id: takerId }, select: { email: true, employee: { select: { name: true } } },
      });
      takenByName = u?.employee?.name ?? u?.email ?? null;
    }
    return {
      class: cls, date, taken: records.length > 0, takenBy: takenByName,
      students: students.map((e) => ({
        id: e.student.id, name: e.student.name, nis: e.student.nis,
        status: map.get(e.student.id)?.status ?? 'PRESENT',
        note: map.get(e.student.id)?.note ?? null,
        revised: !!map.get(e.student.id)?.revisedAt,
      })),
    };
  }

  async saveAttendance(dto: SaveAttendanceDto, takenById?: string) {
    const date = toDateOnly(dto.date);
    // Validasi keanggotaan — unik key studentId+date berarti baris liar bisa
    // menimpa absen siswa rombel LAIN. Tolak studentId yang bukan anggota.
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: dto.classId } });
    const members = await this.prisma.enrollment.findMany({
      where: { classId: dto.classId, academicYearId: cls.academicYearId },
      select: { studentId: true },
    });
    const memberSet = new Set(members.map((m) => m.studentId));
    const stray = dto.rows.filter((r) => !memberSet.has(r.studentId));
    if (stray.length) {
      throw new BadRequestException(
        `${stray.length} siswa bukan anggota rombel ${cls.name} — muat ulang daftar absen.`,
      );
    }
    const existing = await this.prisma.attendanceRecord.findMany({
      where: { classId: dto.classId, date },
      select: { studentId: true, status: true },
    });
    const before = new Map(existing.map((r) => [r.studentId, r.status]));
    return this.prisma.$transaction(async (tx) => {
      for (const r of dto.rows) {
        // Frontend memakai kode PERMIT; enum DB bernama PERMITTED — normalkan.
        const status = (r.status === 'PERMIT' ? 'PERMITTED' : r.status) as never;
        const prior = before.get(r.studentId);
        const revising = prior !== undefined && prior !== status;
        await tx.attendanceRecord.upsert({
          where: { studentId_date: { studentId: r.studentId, date } },
          update: {
            status, note: r.note ?? null,
            ...(revising ? { revisedBy: takenById ?? null, revisedAt: new Date() } : {}),
            ...(prior === undefined ? { takenBy: takenById ?? null, classId: dto.classId } : { classId: dto.classId }),
          },
          create: {
            studentId: r.studentId, classId: dto.classId, date,
            status, note: r.note ?? null, takenBy: takenById ?? null,
          },
        });
      }
      return { saved: dto.rows.length, date };
    });
  }

  /** Hapus absen satu rombel di satu tanggal — seluruh kelas, atau satu siswa
      saja bila `studentId` diisi (salah absen / koreksi). */
  async clearClassAttendance(classId: string, dateIso: string, actorId?: string, studentId?: string) {
    const date = toDateOnly(dateIso);
    const res = await this.prisma.attendanceRecord.deleteMany({
      where: { classId, date, ...(studentId ? { studentId } : {}) },
    });
    await this.audit.log({
      actorId, action: studentId ? 'attendance.student-clear' : 'attendance.class-clear',
      entity: 'class', entityId: classId,
      metadata: { date: dateIso, removed: res.count, ...(studentId ? { studentId } : {}) },
    });
    return { removed: res.count, date };
  }

  /** Sinkron ulang Grade dari attempt ujian yang sudah SUBMITTED — untuk data
      lama yang dinilai sebelum Grade otomatis ditulis. */
  async syncExamGrades(examId: string) {
    const exam = await this.prisma.exam.findUniqueOrThrow({
      where: { id: examId },
      include: { assessment: { select: { id: true, maxScore: true } } },
    });
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, status: 'SUBMITTED' },
      select: { studentId: true, score: true, maxScore: true },
    });
    const scale = exam.assessment.maxScore || 100;
    let synced = 0;
    for (const a of attempts) {
      if (a.score == null || a.maxScore == null || a.maxScore <= 0) continue;
      const gradeScore = Math.round((a.score / a.maxScore) * scale);
      // Nilai menempel ke UJIAN (model baru) — assessmentId ikut diisi agar
      // pembaca ledger lama tetap menjangkaunya.
      await this.prisma.grade.upsert({
        where: { examId_studentId: { examId, studentId: a.studentId } },
        update: { score: gradeScore, assessmentId: exam.assessmentId },
        create: { examId, assessmentId: exam.assessmentId, studentId: a.studentId, score: gradeScore },
      });
      synced++;
    }
    return { synced, total: attempts.length };
  }

  /** Ikhtisar harian seluruh rombel — untuk dasbor kesiswaan:
      per kelas: sudah/belum diabsen, siapa pengabsen, jumlah per status. */
  async attendanceDailyOverview(dateIso: string, academicYearId?: string) {
    const date = toDateOnly(dateIso);
    const year = academicYearId
      ? await this.prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } })
      : await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new BadRequestException('Tahun ajaran tidak ada.');
    const classes = await this.prisma.class.findMany({
      where: { academicYearId: year.id },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { enrollments: { where: { student: { status: 'ACTIVE' } } } } },
      },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { classId: { in: classes.map((c) => c.id) }, date },
    });
    // Nama pengabsen: takenBy menyimpan userId → petakan ke nama pegawai/akun.
    const takerIds = [...new Set(records.flatMap((r) => [r.takenBy, r.revisedBy]).filter((x): x is string => !!x))];
    const users = takerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: takerIds } }, select: { id: true, email: true, employee: { select: { name: true } } } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.employee?.name ?? u.email]));
    const byClass = new Map<string, typeof records>();
    for (const r of records) {
      const arr = byClass.get(r.classId) ?? [];
      arr.push(r);
      byClass.set(r.classId, arr);
    }
    const cnt = (arr: typeof records, s: string) => arr.filter((r) => r.status === s).length;
    const rows = classes.map((c) => {
      const arr = byClass.get(c.id) ?? [];
      const taken = arr.length > 0;
      const reviser = arr.find((r) => r.revisedBy);
      return {
        classId: c.id, name: c.name, gradeLevel: c.gradeLevel,
        students: c._count.enrollments,
        taken,
        takenBy: taken ? (nameOf.get(arr[0]!.takenBy ?? '') ?? null) : null,
        revisedBy: reviser ? (nameOf.get(reviser.revisedBy ?? '') ?? null) : null,
        present: cnt(arr, 'PRESENT'), sick: cnt(arr, 'SICK'),
        permit: cnt(arr, 'PERMITTED') + cnt(arr, 'PERMIT' as never),
        absent: cnt(arr, 'ABSENT'),
        recorded: arr.length,
      };
    });
    const total = (k: 'present' | 'sick' | 'permit' | 'absent' | 'students' | 'recorded') =>
      rows.reduce((a, r) => a + r[k], 0);
    return {
      date, academicYear: { id: year.id, name: year.name },
      classes: rows,
      summary: {
        classes: rows.length, takenClasses: rows.filter((r) => r.taken).length,
        students: total('students'), recorded: total('recorded'),
        present: total('present'), sick: total('sick'), permit: total('permit'), absent: total('absent'),
      },
    };
  }

  /** Riwayat absen satu siswa + rekap jumlah per status. */
  async studentAttendanceHistory(studentId: string, academicYearId?: string) {
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { id: true, name: true, nis: true, nisn: true },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
      take: 400,
      include: { class: { select: { id: true, name: true, gradeLevel: true, academicYearId: true } } },
    });
    const filtered = academicYearId ? records.filter((r) => r.class.academicYearId === academicYearId) : records;
    const c = (st: string) => filtered.filter((r) => r.status === st).length;
    return {
      student: s,
      counts: { present: c('PRESENT'), sick: c('SICK'), permit: c('PERMITTED'), absent: c('ABSENT'), total: filtered.length },
      records: filtered.map((r) => ({ date: r.date, status: r.status, note: r.note, class: r.class.name, revised: !!r.revisedAt })),
    };
  }

  /** Laporan absensi fleksibel — scope: studentIds | classIds | gradeLevels | (kosong = semua).
      mode: 'day' (tanggal tunggal) | 'range' (dari–sampai) | 'month' (kalender penuh,
      tanggal libur/Minggu ditandai) | 'months' (agregat jumlah per bulan dalam rentang). */
  async attendanceReport(query: {
    academicYearId?: string | undefined; studentIds?: string[] | undefined; classIds?: string[] | undefined; gradeLevels?: number[] | undefined;
    mode: 'day' | 'range' | 'month' | 'months'; date?: string | undefined; from?: string | undefined; to?: string | undefined; year?: number | undefined; month?: number | undefined;
  }) {
    const year = query.academicYearId
      ? await this.prisma.academicYear.findUniqueOrThrow({ where: { id: query.academicYearId } })
      : await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new BadRequestException('Tahun ajaran tidak ada.');
    const classes = await this.prisma.class.findMany({
      where: {
        academicYearId: year.id,
        ...(query.classIds?.length ? { id: { in: query.classIds } } : {}),
        ...(query.gradeLevels?.length ? { gradeLevel: { in: query.gradeLevels } } : {}),
      },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) }, academicYearId: year.id,
        ...(query.studentIds?.length ? { studentId: { in: query.studentIds } } : {}),
      },
      include: { student: { select: { id: true, name: true, nis: true, nisn: true, gender: true, status: true } } },
      orderBy: { student: { name: 'asc' } },
    });

    // Rentang tanggal per mode.
    const pad = (n: number) => String(n).padStart(2, '0');
    let dates: string[] = []; // 'YYYY-MM-DD'
    let rangeFrom = ''; let rangeTo = '';
    if (query.mode === 'day') {
      const d = (query.date ?? '').slice(0, 10);
      if (!d) throw new BadRequestException('Tanggal wajib.');
      dates = [d]; rangeFrom = d; rangeTo = d;
    } else if (query.mode === 'range' || query.mode === 'months') {
      const f = (query.from ?? '').slice(0, 10); const t = (query.to ?? '').slice(0, 10);
      if (!f || !t || f > t) throw new BadRequestException('Rentang tanggal tidak valid.');
      rangeFrom = f; rangeTo = t;
      if (query.mode === 'range') {
        for (let d = new Date(`${f}T00:00:00`); d <= new Date(`${t}T00:00:00`); d.setDate(d.getDate() + 1)) {
          dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
        }
        if (dates.length > 62) throw new BadRequestException('Rentang maksimal 62 hari — gunakan mode bulanan.');
      }
    } else {
      const y = query.year ?? 0; const m = query.month ?? 0;
      if (!y || m < 1 || m > 12) throw new BadRequestException('Bulan/tahun wajib.');
      const dim = new Date(y, m, 0).getDate();
      rangeFrom = `${y}-${pad(m)}-01`; rangeTo = `${y}-${pad(m)}-${pad(dim)}`;
      dates = Array.from({ length: dim }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
    }

    // Hari libur: Minggu + agenda kalender bertipe LIBUR dalam rentang.
    const holidayEvts = await this.prisma.academicCalendarEvent.findMany({
      where: { date: { gte: new Date(rangeFrom), lte: new Date(`${rangeTo}T23:59:59`) }, type: 'LIBUR' },
      select: { date: true, title: true },
    });
    const holidayMap = new Map(holidayEvts.map((e) => [e.date.toISOString().slice(0, 10), e.title]));
    const isHoliday = (iso: string) => new Date(`${iso}T00:00:00`).getDay() === 0 || holidayMap.has(iso);

    const records = await this.prisma.attendanceRecord.findMany({
      where: { classId: { in: classes.map((c) => c.id) }, date: { gte: new Date(rangeFrom), lte: new Date(`${rangeTo}T23:59:59`) } },
      select: { studentId: true, classId: true, date: true, status: true, note: true },
    });
    const byStudent = new Map<string, Map<string, { status: string; note: string | null }>>();
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      const m = byStudent.get(r.studentId) ?? new Map();
      m.set(key, { status: r.status, note: r.note });
      byStudent.set(r.studentId, m);
    }

    const enrByClass = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      const arr = enrByClass.get(e.classId) ?? [];
      arr.push(e);
      enrByClass.set(e.classId, arr);
    }
    const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const tally = (m?: Map<string, { status: string }>) => ({
      present: m ? [...m.values()].filter((v) => v.status === 'PRESENT').length : 0,
      sick: m ? [...m.values()].filter((v) => v.status === 'SICK').length : 0,
      permit: m ? [...m.values()].filter((v) => v.status === 'PERMITTED').length : 0,
      absent: m ? [...m.values()].filter((v) => v.status === 'ABSENT').length : 0,
    });
    // Struktur keluaran: jenjang → kelas → siswa — pemisah alami per kelas & jenjang.
    const grades = [...new Set(classes.map((c) => c.gradeLevel))].sort((a, b) => a - b);
    const groups = grades.map((g) => ({
      gradeLevel: g,
      classes: classes.filter((c) => c.gradeLevel === g).map((cls) => ({
        classId: cls.id, name: cls.name,
        students: (enrByClass.get(cls.id) ?? []).map((e) => {
          const marks = byStudent.get(e.student.id);
          return {
            id: e.student.id, name: e.student.name, nis: e.student.nis, nisn: e.student.nisn,
            gender: e.student.gender, status: e.student.status,
            cells: dates.map((d) => {
              const mark = marks?.get(d);
              return {
                date: d,
                dayName: DAY_NAMES[new Date(`${d}T00:00:00`).getDay()],
                holiday: isHoliday(d), holidayName: holidayMap.get(d) ?? null,
                status: mark?.status ?? null, note: mark?.note ?? null,
              };
            }),
            totals: tally(marks),
          };
        }),
      })).filter((c) => c.students.length > 0),
    })).filter((g) => g.classes.length > 0);
    return {
      academicYear: { id: year.id, name: year.name },
      mode: query.mode, from: rangeFrom, to: rangeTo, dates,
      holidays: dates.filter(isHoliday).map((d) => ({ date: d, name: holidayMap.get(d) ?? 'Minggu' })),
      groups,
    };
  }

  /** Rekap absen siswa per kelas — per bulan atau rentang tanggal. */
  async attendanceRecap(classId: string, fromIso: string, toIso: string) {
    const from = toDateOnly(fromIso);
    const to = toDateOnly(toIso);
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const [students, records, schoolDays] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, academicYearId: cls.academicYearId },
        include: { student: { select: { id: true, name: true, nis: true } } },
        orderBy: { student: { name: 'asc' } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { classId, date: { gte: from, lte: to } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { classId, date: { gte: from, lte: to } },
        select: { date: true }, distinct: ['date'],
      }),
    ]);
    const dayCount = schoolDays.length;
    return {
      class: cls, from, to, daysTaken: dayCount,
      students: students.map((e) => {
        const mine = records.filter((r) => r.studentId === e.student.id);
        const c = (s: string) => mine.filter((r) => r.status === s).length;
        return {
          id: e.student.id, name: e.student.name, nis: e.student.nis,
          present: c('PRESENT'), sick: c('SICK'), permit: c('PERMITTED') + c('PERMIT'), absent: c('ABSENT'),
          total: mine.length,
          presentPct: mine.length ? Math.round((c('PRESENT') / mine.length) * 100) : null,
        };
      }),
    };
  }

  /** Export absen bulanan — format Dapodik: satu sheet per kelas, kolom tanggal
   *  1..N, sel S/I/A (v = hadir), legenda + rekap L/P/jumlah di bawah. */
  async attendanceRecapXlsx(academicYearId: string, year: number, month: number) {
    const school = await this.prisma.school.findFirst();
    const ay = await this.prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } });
    const classes = await this.prisma.class.findMany({
      where: { academicYearId },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: { homeroom: { select: { name: true } } },
    });
    const daysInMonth = new Date(year, month, 0).getDate();
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const MONTHS = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const CODE: Record<string, string> = { PRESENT: 'v', SICK: 'S', PERMITTED: 'I', PERMIT: 'I', ABSENT: 'A' };
    const wb = XLSX.utils.book_new();
    for (let ci = 0; ci < classes.length; ci++) {
      const cls = classes[ci]!;
      const [students, records] = await Promise.all([
        this.prisma.enrollment.findMany({
          where: { classId: cls.id, academicYearId },
          include: { student: { select: { id: true, name: true, nis: true, nisn: true, gender: true, status: true } } },
          orderBy: { student: { name: 'asc' } },
        }),
        this.prisma.attendanceRecord.findMany({
          where: { classId: cls.id, date: { gte: new Date(from), lte: new Date(`${to}T23:59:59`) } },
        }),
      ]);
      const byStudent = new Map<string, Map<number, string>>();
      for (const r of records) {
        const d = new Date(r.date).getDate();
        const m = byStudent.get(r.studentId) ?? new Map<number, string>();
        m.set(d, CODE[r.status] ?? '');
        byStudent.set(r.studentId, m);
      }
      const rows: (string | number)[][] = [
        ['DAFTAR HADIR SISWA'],
        [(school?.name ?? '').toUpperCase()],
        [`TAHUN PELAJARAN ${ay.name}`],
        [`Nama Rombel: ${cls.name} - Wali Kelas: ${cls.homeroom?.name ?? '-'} - Bulan: ${MONTHS[month]} ${year}`],
        [],
        ['NOMOR', '', 'NAMA SISWA', 'L/P', `Bulan ${MONTHS[month]} ${year}`],
        [],
        ['URUT', 'NISN / NIS', '', '', 'Tanggal'],
        ['', '', '', '', ...Array.from({ length: daysInMonth }, (_, i) => i + 1), 'H', 'S', 'I', 'A'],
      ];
      let nL = 0; let nP = 0;
      students.forEach((e, i) => {
        const s = e.student;
        if (s.gender === 'MALE') nL++; else if (s.gender === 'FEMALE') nP++;
        const marks = byStudent.get(s.id);
        const c = (code: string) => marks ? [...marks.values()].filter((v) => v === code).length : 0;
        rows.push([
          i + 1,
          `${s.nisn ?? ''} / ${s.nis ?? ''}`,
          s.name,
          s.gender === 'MALE' ? 'L' : s.gender === 'FEMALE' ? 'P' : '',
          ...Array.from({ length: daysInMonth }, (_, d) => marks?.get(d + 1) ?? ''),
          c('v'), c('S'), c('I'), c('A'),
        ]);
      });
      rows.push(
        [],
        ['Keterangan:', 'v = Hadir', 'S = Sakit', 'I = Izin', 'A = Alpa'],
        ['Laki-Laki', '', `:  ${nL} Orang`],
        ['Perempuan', '', `:  ${nP} Orang`],
        ['Jumlah', '', `:  ${students.length} Orang`],
      );
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 10 } },
        { s: { r: 5, c: 4 }, e: { r: 5, c: 4 + daysInMonth - 1 } },
      ];
      ws['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 34 }, { wch: 4 }, ...Array.from({ length: daysInMonth }, () => ({ wch: 4 })), { wch: 4 }, { wch: 4 }, { wch: 4 }, { wch: 4 }];
      XLSX.utils.book_append_sheet(wb, ws, `${ci + 1}. ${cls.name}`.slice(0, 31));
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ================= StaffDocument (administrasi guru/SK) =================
  async uploadStaffDoc(employeeId: string, category: string, title: string, file: Express.Multer.File, uploadedBy?: string) {
    const key = `staff-docs/${employeeId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.staffDocument.create({
      data: { employeeId, category, title, storageKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, uploadedBy: uploadedBy ?? null },
    });
  }

  listStaffDocs(employeeId?: string, category?: string, q?: string) {
    return this.prisma.staffDocument.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { fileName: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { employee: { select: { id: true, name: true, nip: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async staffDocFile(id: string, u: { id: string; permissions: string[] }) {
    const doc = await this.prisma.staffDocument.findUniqueOrThrow({
      where: { id },
      include: { employee: { select: { userId: true } } },
    });
    // Berkas kepegawaian: pemilik, atau staf pengelola pegawai/bidang.
    const manage =
      u.permissions.includes('employee.manage') ||
      u.permissions.includes('academic.manage') ||
      u.permissions.includes('tatausaha.manage');
    if (doc.employee.userId !== u.id && !manage) {
      throw new ForbiddenException('Berkas ini bukan milik Anda.');
    }
    const buf = await this.storage.getObjectBuffer(doc.storageKey);
    return { buf, mime: doc.mimeType, name: doc.fileName };
  }

  async deleteStaffDoc(id: string) {
    const doc = await this.prisma.staffDocument.findUniqueOrThrow({ where: { id } });
    await this.storage.deleteObject(doc.storageKey).catch(() => undefined);
    await this.prisma.staffDocument.delete({ where: { id } });
    return { ok: true };
  }

  // ================= DocCollection (kisi-kisi batch) =================
  async createCollection(dto: CollectionDto, userId: string) {
    const col = await this.prisma.docCollection.create({
      data: {
        title: dto.title, category: dto.category ?? 'KISI_KISI',
        description: dto.description ?? null,
        deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
        academicYearId: dto.academicYearId ?? null,
        createdBy: userId,
        items: { create: dto.employeeIds.map((eid) => ({ employeeId: eid })) },
      },
      include: { items: { include: { employee: { select: { id: true, name: true, phone: true } } } } },
    });
    return col;
  }

  listCollections(academicYearId?: string) {
    return this.prisma.docCollection.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        items: { include: { employee: { select: { id: true, name: true, phone: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getCollection(id: string) {
    return this.prisma.docCollection.findUniqueOrThrow({
      where: { id },
      include: {
        items: { include: { employee: { select: { id: true, name: true, phone: true, nip: true } } }, orderBy: { employee: { name: 'asc' } } },
      },
    });
  }

  /** Guru mengumpulkan berkasnya sendiri. */
  async submitCollectionItem(collectionId: string, userId: string, file: Express.Multer.File, note?: string) {
    const emp = await this.prisma.employee.findUnique({ where: { userId } });
    if (!emp) throw new NotFoundException('Akun belum tertaut pegawai.');
    const item = await this.prisma.docCollectionItem.findUnique({
      where: { collectionId_employeeId: { collectionId, employeeId: emp.id } },
    });
    if (!item) throw new NotFoundException('Anda tidak ditugaskan pada pengumpulan ini.');
    const key = `collections/${collectionId}/${emp.id}-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.docCollectionItem.update({
      where: { id: item.id },
      data: { submittedAt: new Date(), storageKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, note: note ?? null },
    });
  }

  async collectionItemFile(itemId: string, u: { id: string; permissions: string[] }) {
    const item = await this.prisma.docCollectionItem.findUniqueOrThrow({
      where: { id: itemId },
      include: {
        employee: { select: { userId: true } },
        collection: { select: { createdBy: true } },
      },
    });
    if (!item.storageKey) throw new NotFoundException('Belum ada berkas.');
    // Pengumpul (pemilik berkas), pembuat pengumpulan, atau pengelola kurikulum.
    const allowed =
      item.employee.userId === u.id ||
      item.collection.createdBy === u.id ||
      u.permissions.includes('academic.manage');
    if (!allowed) {
      throw new ForbiddenException('Berkas ini bukan milik Anda.');
    }
    const buf = await this.storage.getObjectBuffer(item.storageKey);
    return { buf, mime: item.mimeType ?? 'application/octet-stream', name: item.fileName ?? 'file' };
  }

  // ================= ProgramSubmission (RKS/program → KS) =================
  async createSubmission(dto: SubmissionDto, userId: string, file?: Express.Multer.File) {
    let storageKey: string | null = null;
    if (file) {
      storageKey = `submissions/${dto.department}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    }
    return this.prisma.programSubmission.create({
      data: {
        department: dto.department, kind: dto.kind, title: dto.title,
        description: dto.description ?? null,
        rab: dto.rab === undefined ? Prisma.JsonNull : (dto.rab as Prisma.InputJsonValue),
        amountTotal: dto.amountTotal ?? 0,
        storageKey, fileName: file?.originalname ?? null,
        submittedBy: userId,
      },
    });
  }

  async listSubmissions(department: string | undefined, status: string | undefined, u?: { id: string; permissions: string[] }) {
    // Non-pengelola hanya melihat pengajuan miliknya atau satu bidangnya.
    let scope: Record<string, unknown> = {};
    if (u && !u.permissions.includes('academic.manage')) {
      const emp = await this.prisma.employee.findUnique({ where: { userId: u.id }, select: { department: true } });
      scope = {
        OR: [
          { submittedBy: u.id },
          ...(emp?.department ? [{ department: emp.department }] : []),
        ],
      };
    }
    return this.prisma.programSubmission.findMany({
      where: {
        ...scope,
        ...(department ? { department } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewSubmission(id: string, action: 'APPROVED' | 'REJECTED', note: string | undefined, userId: string) {
    const sub = await this.prisma.programSubmission.findUniqueOrThrow({ where: { id } });
    if (sub.status !== 'PENDING') throw new ConflictException('Pengajuan sudah direview.');
    return this.prisma.programSubmission.update({
      where: { id },
      data: { status: action, reviewedBy: userId, reviewedAt: new Date(), reviewNote: note ?? null },
    });
  }

  async submissionFile(id: string, u: { id: string; permissions: string[] }) {
    const sub = await this.prisma.programSubmission.findUniqueOrThrow({ where: { id } });
    if (!sub.storageKey) throw new NotFoundException('Tidak ada berkas.');
    // Pengaju sendiri atau pengelola kurikulum (reviewer) — isi RAB sensitif.
    if (sub.submittedBy !== u.id && !u.permissions.includes('academic.manage')) {
      throw new ForbiddenException('Berkas ini bukan milik Anda.');
    }
    const buf = await this.storage.getObjectBuffer(sub.storageKey);
    return { buf, mime: 'application/octet-stream', name: sub.fileName ?? 'file' };
  }

  // ================= Arsip — tersekat per bidang =================
  listArchiveCategories(section: string) {
    return this.prisma.archiveCategory.findMany({
      where: { section },
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
  }
  createArchiveCategory(name: string, section: string) {
    return this.prisma.archiveCategory.create({ data: { name: name.trim(), section } });
  }
  updateArchiveCategory(id: string, name: string) {
    return this.prisma.archiveCategory.update({ where: { id }, data: { name: name.trim() } });
  }
  deleteArchiveCategory(id: string) {
    // Arsip di dalamnya TIDAK ikut terhapus — jadi "tanpa kategori" (SetNull).
    return this.prisma.archiveCategory.delete({ where: { id } });
  }
  /** Bidang pemilik kategori — untuk cek izin sebelum ubah/hapus. */
  async archiveCategorySection(id: string) {
    const c = await this.prisma.archiveCategory.findUniqueOrThrow({ where: { id }, select: { section: true } });
    return c.section;
  }
  /** Bidang pemilik arsip — untuk cek izin lihat/ubah/hapus. */
  async archiveItemSection(id: string) {
    const it = await this.prisma.archiveItem.findUniqueOrThrow({ where: { id }, select: { section: true } });
    return it.section;
  }
  async uploadArchiveItem(dto: { title: string; section: string; categoryId?: string; refNumber?: string; date?: string }, file: Express.Multer.File, uploadedBy?: string) {
    const key = `archive/${dto.section.toLowerCase()}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.archiveItem.create({
      data: {
        title: dto.title, section: dto.section, categoryId: dto.categoryId ?? null,
        refNumber: dto.refNumber ?? null, date: dto.date ? toDateOnly(dto.date) : null,
        storageKey: key, fileName: file.originalname, mimeType: file.mimetype,
        sizeBytes: file.size, uploadedBy: uploadedBy ?? null,
      },
    });
  }
  listArchiveItems(section: string, categoryId?: string, q?: string) {
    return this.prisma.archiveItem.findMany({
      where: {
        section,
        ...(categoryId ? { categoryId } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { refNumber: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { category: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }
  async archiveFile(id: string) {
    const item = await this.prisma.archiveItem.findUniqueOrThrow({ where: { id } });
    const buf = await this.storage.getObjectBuffer(item.storageKey);
    return { buf, mime: item.mimeType, name: item.fileName, section: item.section };
  }
  async updateArchiveItem(id: string, dto: { title?: string; categoryId?: string | null; refNumber?: string | null; date?: string | null }, file?: Express.Multer.File) {
    const item = await this.prisma.archiveItem.findUniqueOrThrow({ where: { id } });
    let storageKey = item.storageKey; let fileName = item.fileName; let mimeType = item.mimeType; let sizeBytes = item.sizeBytes;
    if (file) {
      const key = `archive/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await this.storage.putObject(key, file.buffer, file.mimetype);
      await this.storage.deleteObject(item.storageKey).catch(() => {});
      storageKey = key; fileName = file.originalname; mimeType = file.mimetype; sizeBytes = file.size;
    }
    return this.prisma.archiveItem.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.refNumber !== undefined ? { refNumber: dto.refNumber } : {}),
        ...(dto.date !== undefined ? { date: dto.date ? toDateOnly(dto.date) : null } : {}),
        storageKey, fileName, mimeType, sizeBytes,
      },
    });
  }
  async deleteArchiveItem(id: string) {
    const item = await this.prisma.archiveItem.findUniqueOrThrow({ where: { id } });
    await this.prisma.archiveItem.delete({ where: { id } });
    await this.storage.deleteObject(item.storageKey).catch(() => {});
    return { deleted: true };
  }

  // ================= PolicyDocument (tata tertib, form mutasi) =================
  async uploadPolicy(kind: string, title: string, file: Express.Multer.File, uploadedBy?: string) {
    const key = `policy/${kind}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.policyDocument.create({
      data: { kind, title, storageKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, uploadedBy: uploadedBy ?? null },
    });
  }
  listPolicies(kind?: string) {
    return this.prisma.policyDocument.findMany({
      where: kind ? { kind } : {},
      orderBy: { createdAt: 'desc' },
    });
  }
  async policyFile(id: string) {
    const doc = await this.prisma.policyDocument.findUniqueOrThrow({ where: { id } });
    const buf = await this.storage.getObjectBuffer(doc.storageKey);
    return { buf, mime: doc.mimeType, name: doc.fileName };
  }

  // ================= UniformSchedule =================
  listUniforms() {
    return this.prisma.uniformSchedule.findMany({ orderBy: { day: 'asc' } });
  }
  upsertUniform(dto: UniformDayDto) {
    return this.prisma.uniformSchedule.upsert({
      where: { day: dto.day },
      update: { name: dto.name, note: dto.note ?? null },
      create: { day: dto.day, name: dto.name, note: dto.note ?? null },
    });
  }

  // ================= ExamRoom/Seat → kartu peserta =================
  async createExamRoom(dto: ExamRoomDto) {
    // Nama ruang default dari prasarana bila dipilih & nama kosong.
    let name = dto.name;
    if (dto.prasaranaId && !name.trim()) {
      const p = await this.prisma.prasarana.findUnique({ where: { id: dto.prasaranaId } });
      if (p) name = p.name;
    }
    // Nama ruang unik per periode — cegah baris ganda saat klik berulang/typo.
    const dup = await this.prisma.examRoom.findFirst({
      where: { academicYearId: dto.academicYearId, period: dto.period, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (dup) throw new ConflictException(`Ruang "${dup.name}" sudah ada untuk periode ${dto.period}.`);
    return this.prisma.examRoom.create({ data: { name: name.trim(), period: dto.period, academicYearId: dto.academicYearId, capacity: dto.capacity ?? 24, prasaranaId: dto.prasaranaId ?? null } });
  }
  async listExamRooms(academicYearId: string, period?: string) {
    // Backfill kode peserta untuk kursi lama yang belum punya.
    const missing = await this.prisma.examSeat.findMany({
      where: { room: { academicYearId }, code: null },
      select: { id: true, room: { select: { period: true } }, class: { select: { gradeLevel: true } } },
    });
    for (const s of missing) {
      await this.prisma.examSeat.update({
        where: { id: s.id },
        data: { code: await this.nextSeatCode(academicYearId, s.room.period, s.class?.gradeLevel) },
      });
    }
    return this.prisma.examRoom.findMany({
      where: { academicYearId, ...(period ? { period } : {}) },
      include: {
        prasarana: { select: { id: true, name: true } },
        seats: {
          include: {
            student: { select: { id: true, name: true, nis: true } },
            class: { select: { id: true, name: true } },
          },
          orderBy: { seatNo: 'asc' },
        },
        _count: { select: { seats: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async assignSeat(roomId: string, dto: ExamSeatDto) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId } });
    const seatCount = await this.prisma.examSeat.count({ where: { roomId } });
    if (seatCount >= room.capacity) throw new ConflictException(`Ruang ${room.name} penuh (${room.capacity}).`);
    // Ujian serentak: siswa hanya punya SATU kursi per periode — tolak bila
    // sudah duduk di ruang lain pada periode yang sama.
    const dup = await this.prisma.examSeat.findFirst({
      where: { room: { academicYearId: room.academicYearId, period: room.period }, studentId: dto.studentId },
      include: { room: { select: { name: true } } },
    });
    if (dup) throw new ConflictException(`Siswa sudah duduk di ${dup.room.name} untuk periode ini.`);
    const cls = dto.classId ? await this.prisma.class.findUnique({ where: { id: dto.classId }, select: { gradeLevel: true } }) : null;
    return this.prisma.examSeat.create({
      data: { roomId, studentId: dto.studentId, classId: dto.classId ?? null, seatNo: dto.seatNo ?? seatCount + 1, code: await this.nextSeatCode(room.academicYearId, room.period, cls?.gradeLevel) },
    });
  }

  /** Urutan absen rombel = urutan daftar kelas (NIS lalu nama) — nomor absen
   *  siswa = posisi 1-based dalam daftar ini. */
  private async classRoster(classId: string, academicYearId: string) {
    return this.prisma.enrollment.findMany({
      where: { classId, academicYearId, student: { status: 'ACTIVE' } },
      orderBy: [{ student: { nis: 'asc' } }, { student: { name: 'asc' } }],
      select: { studentId: true },
    });
  }

  /** Absen rombel yang masih bebas di periode ruang — untuk picker di UI. */
  async rombelAvailability(roomId: string) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId } });
    const classes = await this.prisma.class.findMany({
      where: { academicYearId: room.academicYearId },
      select: { id: true, name: true, gradeLevel: true },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const taken = await this.prisma.examSeat.findMany({
      where: { room: { academicYearId: room.academicYearId, period: room.period } },
      select: { studentId: true, room: { select: { name: true } } },
    });
    const seatedAt = new Map(taken.map((t) => [t.studentId, t.room.name]));
    const out: { classId: string; name: string; gradeLevel: number | null; total: number; freeAbsen: number[]; seatedAbsen: number[] }[] = [];
    for (const c of classes) {
      const roster = await this.classRoster(c.id, room.academicYearId);
      const freeAbsen: number[] = [];
      const seatedAbsen: number[] = [];
      roster.forEach((r, i) => (seatedAt.has(r.studentId) ? seatedAbsen : freeAbsen).push(i + 1));
      out.push({ classId: c.id, name: c.name, gradeLevel: c.gradeLevel, total: roster.length, freeAbsen, seatedAbsen });
    }
    return out;
  }

  /** Tempatkan rombel ke ruang — ujian serentak: siswa yang sudah duduk di
   *  ruang lain SE-PERIODE dilewati, jadi satu kelas bisa dipecah antar-ruang
   *  tanpa duplikat. Rentang nomor absen opsional: absenFrom..absenTo
   *  (1-based, inklusif; absenTo kosong = sampai sisa). */
  async assignClassToRoom(roomId: string, classId: string, absenFrom?: number, absenTo?: number) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId }, include: { _count: { select: { seats: true } } } });
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const roster = await this.classRoster(classId, cls.academicYearId);
    const from = Math.max(1, absenFrom ?? 1);
    const to = Math.min(roster.length, absenTo ?? roster.length);
    const picked = roster.slice(from - 1, to);
    const existing = await this.prisma.examSeat.findMany({
      where: {
        room: { academicYearId: room.academicYearId, period: room.period },
        studentId: { in: picked.map((s) => s.studentId) },
      },
      select: { studentId: true },
    });
    const skip = new Set(existing.map((e) => e.studentId));
    const free = room.capacity - room._count.seats;
    const toAdd = picked.filter((s) => !skip.has(s.studentId)).slice(0, Math.max(free, 0));
    let seat = room._count.seats;
    for (const s of toAdd) {
      await this.prisma.examSeat.create({
        data: { roomId, studentId: s.studentId, classId, seatNo: ++seat, code: await this.nextSeatCode(room.academicYearId, room.period, cls.gradeLevel) },
      });
    }
    const inRangeSkipped = picked.length - toAdd.length;
    return { added: toAdd.length, skipped: inRangeSkipped, free: free - toAdd.length };
  }

  /** Susun ulang NOMOR MEJA ruang — kode peserta tak berubah (ikut kursi).
   *  sequential: urut per kelas lalu nomor peserta (blok per rombel).
   *  zigzag: meja berselang-seling antar-kelas (meja 1 kelas A, meja 2 kelas B…). */
  async renumberRoom(roomId: string, mode: 'sequential' | 'zigzag') {
    const seats = await this.prisma.examSeat.findMany({
      where: { roomId },
      include: { class: { select: { name: true } } },
    });
    const byCode = (a: (typeof seats)[number], b: (typeof seats)[number]) =>
      (a.code ?? '').localeCompare(b.code ?? '', 'id', { numeric: true });
    let ordered: typeof seats;
    if (mode === 'zigzag') {
      const groups = new Map<string, typeof seats>();
      for (const s of seats) {
        const k = s.class?.name ?? '—';
        groups.set(k, [...(groups.get(k) ?? []), s]);
      }
      const queues = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'id', { numeric: true }))
        .map(([, list]) => list.sort(byCode));
      ordered = [];
      let i = 0;
      while (ordered.length < seats.length) {
        const q = queues[i % queues.length]!;
        const next = q.shift();
        if (next) ordered.push(next);
        i++;
      }
    } else {
      ordered = [...seats].sort(
        (a, b) =>
          (a.class?.name ?? '—').localeCompare(b.class?.name ?? '—', 'id', { numeric: true }) || byCode(a, b),
      );
    }
    for (let i = 0; i < ordered.length; i++) {
      const s = ordered[i]!;
      if (s.seatNo !== i + 1) {
        await this.prisma.examSeat.update({ where: { id: s.id }, data: { seatNo: i + 1 } });
      }
    }
    return { count: ordered.length, mode };
  }

  /** Kode peserta: {jenjang:2d}-{kode sekolah}-{urut:3d}, mis. "07-145-001" —
   *  jenjang dari rombel si siswa, kode tengah = schools.exam_code (tetap),
   *  urut berlanjut lintas ruang dalam satu periode. Tercetak di kartu &
   *  kartu meja (sinkron CBT). */
  private async nextSeatCode(academicYearId: string, period: string, gradeLevel: number | null | undefined) {
    const grade = String(gradeLevel ?? 0).padStart(2, '0');
    const mid = (await this.prisma.school.findFirst({ select: { examCode: true } }))?.examCode?.trim() || '145';
    const count = await this.prisma.examSeat.count({ where: { room: { academicYearId, period } } });
    for (let i = count + 1; ; i++) {
      const code = `${grade}-${mid}-${String(i).padStart(3, '0')}`;
      const clash = await this.prisma.examSeat.findUnique({ where: { code } });
      if (!clash) return code;
    }
  }

  /** Konfigurasi kode peserta ujian — kode sekolah (segmen tengah) tetap. */
  async getExamConfig() {
    const school = await this.prisma.school.findFirst({ select: { examCode: true, name: true } });
    return { examCode: school?.examCode ?? '145' };
  }
  async updateExamConfig(examCode: string) {
    const code = examCode.trim() || '145';
    const school = await this.prisma.school.findFirst();
    if (school) await this.prisma.school.update({ where: { id: school.id }, data: { examCode: code } });
    return { examCode: code };
  }

  async updateExamRoom(id: string, dto: { name?: string; period?: string; capacity?: number; prasaranaId?: string | null }) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({ where: { id }, include: { _count: { select: { seats: true } } } });
    if (dto.capacity !== undefined && dto.capacity < room._count.seats) {
      throw new ConflictException(`Kapasitas tak boleh di bawah jumlah peserta (${room._count.seats}).`);
    }
    if (dto.name !== undefined) {
      const period = dto.period ?? room.period;
      const dup = await this.prisma.examRoom.findFirst({
        where: {
          academicYearId: room.academicYearId,
          period,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (dup) throw new ConflictException(`Ruang "${dup.name}" sudah ada untuk periode ${period}.`);
    }
    return this.prisma.examRoom.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.period !== undefined ? { period: dto.period } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.prasaranaId !== undefined ? { prasaranaId: dto.prasaranaId } : {}),
      },
    });
  }
  async deleteExamRoom(id: string) {
    await this.prisma.examRoom.findUniqueOrThrow({ where: { id } });
    return this.prisma.examRoom.delete({ where: { id } });
  }
  async removeExamSeat(seatId: string) {
    const seat = await this.prisma.examSeat.findUniqueOrThrow({ where: { id: seatId } });
    return this.prisma.examSeat.delete({ where: { id: seat.id } });
  }
  /** Kartu ujian serentak — satu kartu per siswa memuat SEMUA jadwal ujiannya
   *  (ujian yang mencakup rombelnya di tahun ajaran ini, difilter periode ruang)
   *  + kursi tetap & nomor peserta + kartu meja di sebelahnya. */
  async examCards(roomId: string, _linkId?: string) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        academicYear: true,
        seats: {
          include: {
            student: { select: { id: true, name: true, nis: true, nisn: true, gender: true, password: true } },
            class: { select: { id: true, name: true } },
          },
          orderBy: { seatNo: 'asc' },
        },
      },
    });
    // Jadwal ujian tiap kelas — semua ujian yang mencakup rombel itu di tahun
    // ajaran ruang; difilter ke ujian yang judul/asesmennya memuat teks periode
    // (mis. "ASAS"), fallback semua ujian rombel bila tak ada yang cocok.
    const exams = await this.prisma.exam.findMany({
      where: { academicYearId: room.academicYearId },
      select: { id: true, title: true, startAt: true, endAt: true, durationMin: true, classIds: true, assessment: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
    });
    const needle = room.period.trim().toLowerCase();
    const inPeriod = (e: (typeof exams)[number]) =>
      needle ? (e.title.toLowerCase().includes(needle) || e.assessment.name.toLowerCase().includes(needle)) : true;
    const examsForClass = (classId: string | null) => {
      const mine = exams.filter((e) => (e.classIds as string[]).includes(classId ?? ''));
      const scoped = mine.filter(inPeriod);
      return (scoped.length ? scoped : mine).map((e) => ({
        examTitle: e.title, startAt: e.startAt, endAt: e.endAt, durationMin: e.durationMin,
      }));
    };
    // Password CBT — buat malas bila belum ada (satu password semua ujian).
    const credentials: Record<string, string> = {};
    for (const seat of room.seats) {
      let pw = seat.student.password;
      if (!pw) {
        pw = genStudentPassword();
        await this.prisma.student.update({ where: { id: seat.studentId }, data: { password: pw } });
        await this.prisma.examCredential.updateMany({ where: { studentId: seat.studentId }, data: { password: pw } });
      }
      credentials[seat.studentId] = pw;
    }
    const school = await this.prisma.school.findFirst();
    return {
      room: { id: room.id, name: room.name, period: room.period, academicYear: room.academicYear },
      school,
      cards: room.seats.map((seat) => ({
        seatId: seat.id,
        student: { id: seat.student.id, name: seat.student.name, nis: seat.student.nis },
        className: seat.class?.name ?? null,
        seatNo: seat.seatNo,
        code: seat.code,
        password: credentials[seat.studentId] ?? null,
        rows: examsForClass(seat.classId),
      })),
    };
  }

  /** Checklist hadir satu peserta (pengawas) — checklist saja, tak mengunci CBT. */
  async setSeatPresent(seatId: string, present: boolean | null) {
    return this.prisma.examSeat.update({ where: { id: seatId }, data: { present } });
  }

  /** Checklist hadir massal satu ruang: yang terdaftar → hadir, sisanya → tidak. */
  async setRoomAttendance(roomId: string, presentIds: string[]) {
    const ids = new Set(presentIds);
    return this.prisma.$transaction(async (tx) => {
      await tx.examSeat.updateMany({ where: { roomId }, data: { present: false } });
      const res = await tx.examSeat.updateMany({ where: { roomId, studentId: { in: [...ids] } }, data: { present: true } });
      return { present: res.count };
    });
  }

  /** Roster satu periode — semua ruang + peserta berikut jenjang/L-P.
   *  Dipakai cetak: daftar peserta per ruang, rekap kelas×ruang, daftar semua
   *  peserta (mirror format Excel: REKAP, R.XX, SEMUA PESERTA). */
  async examRoomRoster(academicYearId: string, period: string) {
    const rooms = await this.prisma.examRoom.findMany({
      where: { academicYearId, period },
      include: {
        seats: {
          include: {
            student: { select: { id: true, name: true, nis: true, gender: true } },
            class: { select: { id: true, name: true, gradeLevel: true } },
          },
          orderBy: { seatNo: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    const school = await this.prisma.school.findFirst();
    const academicYear = await this.prisma.academicYear.findUnique({ where: { id: academicYearId }, select: { name: true } });
    return { period, academicYear, school, rooms };
  }

  /** Data calon peserta ujian (US-1/US-2) — per rombel jenjang tertentu (default kelas akhir 9). */
  async usCandidates(academicYearId: string, gradeLevel?: number) {
    const year = await this.prisma.academicYear.findUniqueOrThrow({ where: { id: academicYearId } });
    const classes = await this.prisma.class.findMany({
      where: { academicYearId, ...(gradeLevel ? { gradeLevel } : {}) },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
      include: { homeroom: { select: { name: true } } },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId: { in: classes.map((c) => c.id) }, academicYearId },
      include: {
        student: {
          select: {
            id: true, name: true, nis: true, nisn: true, gender: true,
            birthPlace: true, birthDate: true, status: true,
            fatherName: true, motherName: true, recordDetails: true,
            password: true, diplomaNo: true, ijazahTakenAt: true,
            transcriptTakenAt: true, continuationDetail: true,
            parent: { select: { name: true } },
            continuation: { select: { id: true, name: true } },
            examSeats: {
              select: { code: true, room: { select: { academicYearId: true } } },
            },
          },
        },
      },
      orderBy: { student: { name: 'asc' } },
    });
    const studentIds = enrollments.map((e) => e.studentId);
    // Tahun rapor per jenjang (kelas 7/8/9) — dari riwayat enrollment siswa.
    const history = await this.prisma.enrollment.findMany({
      where: { studentId: { in: studentIds } },
      select: {
        studentId: true,
        class: { select: { gradeLevel: true } },
        academicYear: { select: { name: true } },
      },
    });
    const raporYear = new Map<string, Record<number, string>>();
    for (const h of history) {
      const rec = raporYear.get(h.studentId) ?? {};
      rec[h.class.gradeLevel] = h.academicYear.name;
      raporYear.set(h.studentId, rec);
    }
    const religionOf = (rd: unknown) => {
      const r = (rd as Record<string, unknown> | null)?.['agama'];
      return typeof r === 'string' && r ? r : 'Islam';
    };
    const byClass = new Map(enrollments.reduce((a, e) => {
      const arr = a.get(e.classId) ?? []; arr.push(e); return a.set(e.classId, arr);
    }, new Map<string, typeof enrollments>()));
    const school = await this.prisma.school.findFirst();
    return {
      school, academicYear: { id: year.id, name: year.name },
      classes: classes.map((c) => {
        const students = (byClass.get(c.id) ?? []).map((e) => {
          const s = e.student;
          const { examSeats, ...rest } = s;
          return {
            ...rest,
            agama: religionOf(s.recordDetails),
            absenceNo: e.absenceNo,
            examCode: examSeats.find((x) => x.room.academicYearId === academicYearId)?.code ?? null,
            rapor: raporYear.get(s.id) ?? {},
          };
        });
        return {
          id: c.id, name: c.name, gradeLevel: c.gradeLevel, homeroom: c.homeroom?.name ?? null,
          students,
          total: students.length,
          male: students.filter((s) => s.gender === 'MALE').length,
          female: students.filter((s) => s.gender === 'FEMALE').length,
        };
      }),
    };
  }

  // ---------- Kelulusan & pasca-lulus kelas 9 ----------

  listGraduationCategories() {
    return this.prisma.graduationCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  createGraduationCategory(dto: { name: string }) {
    return this.prisma.graduationCategory.create({
      data: { name: dto.name.trim(), sortOrder: 99 },
    });
  }

  async updateGraduationCategory(id: string, dto: { name?: string; isActive?: boolean; sortOrder?: number }) {
    await this.prisma.graduationCategory.findUniqueOrThrow({ where: { id } });
    return this.prisma.graduationCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async deleteGraduationCategory(id: string) {
    const used = await this.prisma.student.count({ where: { continuationId: id } });
    if (used) throw new BadRequestException(`Kategori masih dipakai ${used} siswa — nonaktifkan saja.`);
    await this.prisma.graduationCategory.delete({ where: { id } });
    return { deleted: true };
  }

  /** Update data kelulusan siswa: no absen rombel, no ijazah, status ambil
      ijazah/transkrip, kategori & detail pasca-lulus. */
  async updateGraduation(studentId: string, dto: {
    academicYearId?: string; absenceNo?: number | null; diplomaNo?: string | null;
    ijazahTaken?: boolean; transcriptTaken?: boolean;
    continuationId?: string | null; continuationDetail?: string | null;
  }) {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const data: Record<string, unknown> = {};
    if (dto.diplomaNo !== undefined) data.diplomaNo = dto.diplomaNo || null;
    if (dto.ijazahTaken !== undefined) data.ijazahTakenAt = dto.ijazahTaken ? new Date() : null;
    if (dto.transcriptTaken !== undefined) data.transcriptTakenAt = dto.transcriptTaken ? new Date() : null;
    if (dto.continuationId !== undefined) data.continuationId = dto.continuationId || null;
    if (dto.continuationDetail !== undefined) data.continuationDetail = dto.continuationDetail || null;
    const [student] = await this.prisma.$transaction([
      this.prisma.student.update({ where: { id: studentId }, data: data as never }),
      ...(dto.absenceNo !== undefined && dto.academicYearId
        ? [this.prisma.enrollment.updateMany({
            where: { studentId, academicYearId: dto.academicYearId },
            data: { absenceNo: dto.absenceNo },
          })]
        : []),
    ]);
    return student;
  }

  // ================= Mutasi: upload surat =================
  async mutationLetter(mutationId: string, file: Express.Multer.File) {
    await this.prisma.studentMutation.findUniqueOrThrow({ where: { id: mutationId } });
    const key = `mutations/${mutationId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.studentMutation.update({
      where: { id: mutationId },
      data: { storageKey: key, fileName: file.originalname, mimeType: file.mimetype },
    });
  }

  async mutationLetterFile(mutationId: string) {
    const m = await this.prisma.studentMutation.findUniqueOrThrow({ where: { id: mutationId } });
    if (!m.storageKey) throw new NotFoundException('Belum ada surat terlampir.');
    const buf = await this.storage.getObjectBuffer(m.storageKey);
    return { buf, mime: m.mimeType ?? 'application/octet-stream', name: m.fileName ?? 'surat' };
  }

  // ================= Buku induk =================
  async updateStudentRecord(id: string, dto: Record<string, unknown>) {
    const FIELDS = [
      'previousSchool', 'healthNotes', 'fatherName', 'motherName',
      'parentOccupation', 'parentPhone', 'intelligenceNotes', 'leavingNotes', 'otherNotes',
      'nik',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = dto[f];
      if (v !== undefined) data[f] = typeof v === 'string' ? v || null : v;
    }
    if (typeof data.parentPhone === 'string' && data.parentPhone) {
      data.parentPhone = normalizePhone(data.parentPhone as string);
    }
    if (dto.recordDetails !== undefined) data.recordDetails = dto.recordDetails;
    const updated = await this.prisma.student.update({ where: { id }, data: data as never });
    // Sinkron ke akun orang tua yang tertaut — jalur edit di halaman induk
    // harus sama hasilnya dengan modal "Orang Tua / Wali" di kesiswaan.
    const parentSync: Record<string, string> = {};
    if (typeof data.parentPhone === 'string' && data.parentPhone) parentSync.phone = data.parentPhone;
    if (typeof data.fatherName === 'string' && data.fatherName) parentSync.name = data.fatherName;
    if (Object.keys(parentSync).length) {
      const s = await this.prisma.student.findUnique({ where: { id }, select: { parentId: true } });
      if (s?.parentId) {
        if (parentSync.phone) {
          const clash = await this.prisma.user.findUnique({ where: { phone: parentSync.phone }, select: { id: true } });
          if (clash && clash.id !== s.parentId) delete parentSync.phone; // HP dipakai akun lain — jangan timpa
        }
        if (Object.keys(parentSync).length) {
          await this.prisma.user.update({ where: { id: s.parentId }, data: parentSync });
        }
      }
    }
    return updated;
  }

  async studentRecord(id: string) {
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      include: {
        parent: { select: { name: true, phone: true, email: true } },
        candidate: { select: { previousSchool: true, address: true, birthPlace: true, birthDate: true } },
        enrollments: { include: { class: { select: { name: true, gradeLevel: true } }, academicYear: { select: { name: true } } }, orderBy: { academicYear: { name: 'desc' } } },
        attendances: { take: 90, orderBy: { date: 'desc' } },
        achievements: { orderBy: { createdAt: 'desc' } },
        violations: { orderBy: { date: 'desc' } },
        ekskulMemberships: {
          include: { extracurricular: { select: { name: true, isActive: true } } },
          orderBy: { joinedAt: 'desc' },
        },
      },
    });
    return s;
  }

  /** Pas foto siswa — disimpan di storage, kolom photo_key siswa diperbarui. */
  async uploadStudentPhoto(id: string, file: Express.Multer.File) {
    await this.prisma.student.findUniqueOrThrow({ where: { id } });
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = `students/${id}/photo.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    await this.prisma.student.update({ where: { id }, data: { photoKey: key } });
    return { photoKey: key };
  }

  async studentPhoto(id: string) {
    const s = await this.prisma.student.findUniqueOrThrow({ where: { id } });
    if (!s.photoKey) throw new NotFoundException('Belum ada pas foto.');
    const buf = await this.storage.getObjectBuffer(s.photoKey);
    const mime = s.photoKey.endsWith('.png') ? 'image/png' : s.photoKey.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return { buf, mime, name: `pas-foto-${s.nis ?? s.id}.${s.photoKey.split('.').pop()}` };
  }

  // ================= Sarpras — sarana & prasarana =================
  saranaTypes() {
    return this.prisma.saranaType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  }
  createSaranaType(dto: { label: string; code?: string; isActive?: boolean; sortOrder?: number }) {
    const code = (dto.code || dto.label).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'JENIS';
    return this.prisma.saranaType.create({
      data: { code, label: dto.label.trim(), isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0 },
    });
  }
  async updateSaranaType(id: string, dto: { label?: string; isActive?: boolean; sortOrder?: number }) {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return this.prisma.saranaType.update({ where: { id }, data });
  }
  async deleteSaranaType(id: string) {
    const n = await this.prisma.saranaItem.count({ where: { typeId: id } });
    if (n > 0) throw new ConflictException(`Jenis masih dipakai ${n} sarana — nonaktifkan saja atau pindahkan dulu.`);
    await this.prisma.saranaType.delete({ where: { id } });
    return { deleted: true };
  }

  saranas() {
    return this.prisma.saranaItem.findMany({
      where: { isActive: true },
      include: { type: true },
      orderBy: [{ type: { sortOrder: 'asc' } }, { location: 'asc' }, { createdAt: 'asc' }],
    });
  }
  createSarana(dto: { typeId: string; location?: string; ownership?: string; spec?: string; qty?: number; good?: number; bad?: number; photo?: string }) {
    return this.prisma.saranaItem.create({
      data: {
        typeId: dto.typeId,
        location: dto.location || null,
        ownership: dto.ownership || null,
        spec: dto.spec || null,
        qty: dto.qty ?? 0,
        good: dto.good ?? 0,
        bad: dto.bad ?? 0,
        photo: dto.photo || null,
      },
      include: { type: true },
    });
  }
  updateSarana(id: string, dto: Partial<{ typeId: string; location: string; ownership: string; spec: string; qty: number; good: number; bad: number; photo: string; isActive: boolean }>) {
    const data: Record<string, unknown> = {};
    for (const f of ['typeId', 'qty', 'good', 'bad', 'isActive'] as const) {
      if (dto[f] !== undefined) data[f] = dto[f];
    }
    for (const f of ['location', 'ownership', 'spec', 'photo'] as const) {
      if (dto[f] !== undefined) data[f] = dto[f] || null;
    }
    return this.prisma.saranaItem.update({ where: { id }, data, include: { type: true } });
  }
  async deleteSarana(id: string) {
    await this.prisma.saranaItem.update({ where: { id }, data: { isActive: false } });
    return { deleted: true };
  }

  prasaranas() {
    return this.prisma.prasarana.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }
  createPrasarana(dto: { name: string; note?: string; length?: number; width?: number; ownership?: string; photo?: string }) {
    return this.prisma.prasarana.create({
      data: { name: dto.name.trim(), note: dto.note || null, length: dto.length ?? null, width: dto.width ?? null, ownership: dto.ownership || null, photo: dto.photo || null },
    });
  }
  updatePrasarana(id: string, dto: Partial<{ name: string; note: string; length: number; width: number; ownership: string; photo: string; isActive: boolean }>) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    for (const f of ['note', 'ownership', 'photo'] as const) if (dto[f] !== undefined) data[f] = dto[f] || null;
    for (const f of ['length', 'width'] as const) if (dto[f] !== undefined) data[f] = dto[f] ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.prasarana.update({ where: { id }, data });
  }

  /** Foto sarpras (ruangan/barang) — simpan di prefix sarpras/, layani via /ops/sarpras-media. */
  async uploadSarprasMedia(file: Express.Multer.File) {
    const mime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file.mimetype];
    if (!mime) throw new BadRequestException('Gambar harus JPG/PNG/WebP/GIF.');
    const key = `sarpras/${randomUUID()}.${mime}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return { key, url: `/ops/sarpras-media/${key.split('/')[1]}` };
  }
  /** Baca foto sarpras — auth di controller (SARPRAS_READ). */
  async sarprasMedia(file: string) {
    if (!/^[\w.-]+$/.test(file)) throw new BadRequestException('Nama file tidak valid.');
    const key = `sarpras/${file}`;
    const buf = await this.storage.getObjectBuffer(key);
    const mime = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : file.endsWith('.gif') ? 'image/gif' : 'image/jpeg';
    return { buf, mime };
  }
  async deletePrasarana(id: string) {
    await this.prisma.prasarana.update({ where: { id }, data: { isActive: false } });
    return { deleted: true };
  }

  /** Ekspor Excel format Dapodik — header sekolah + tabel sarana/prasarana. */
  private async schoolHead() {
    const s = await this.prisma.school.findFirst();
    return { name: (s?.name ?? 'SMP Muhammadiyah 3').toUpperCase(), address: s?.address ?? '' };
  }
  async saranaXlsx() {
    const head = await this.schoolHead();
    const rows = await this.prisma.saranaItem.findMany({
      where: { isActive: true }, include: { type: true },
      orderBy: [{ type: { sortOrder: 'asc' } }, { location: 'asc' }],
    });
    const data: (string | number)[][] = [
      ['Sarana'], [head.name], [head.address], [`Tanggal Unduh: ${new Date().toLocaleString('id-ID')}`], [],
      ['No', 'Jenis Sarana', 'Letak', 'Kepemilikan', 'Spesifikasi', 'Jumlah', 'Laik', 'Tidak Laik'],
      ...rows.map((r, i) => [i + 1, r.type.label, r.location ?? '', r.ownership ?? '', r.spec ?? '', r.qty, r.good, r.bad]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 9 }, { wch: 9 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sarana');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
  async prasaranaXlsx() {
    const head = await this.schoolHead();
    const rows = await this.prisma.prasarana.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const data: (string | number)[][] = [
      ['Prasarana'], [head.name], [head.address], [`Tanggal Unduh: ${new Date().toLocaleString('id-ID')}`], [],
      ['No', 'Nama Prasarana', 'Keterangan', 'Panjang', 'Lebar', 'Status Kepemilikan'],
      ...rows.map((r, i) => [i + 1, r.name, r.note ?? '', r.length ?? '', r.width ?? '', r.ownership ?? '']),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 34 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Prasarana');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ================= Import Dapodik =================
  /** Template Excel import siswa — sheet Data (keterangan + header + contoh),
   *  Petunjuk, dan daftar Rombel tahun ajaran aktif agar kolom `kelas`
   *  terisi nama yang valid. Parser mencari baris header (`nama` di kolom
   *  pertama) jadi baris keterangan di atas aman. */
  async studentImportTemplateXlsx(academicYearId: string) {
    const classes = await this.prisma.class.findMany({
      where: { academicYearId },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    const header = [
      'nama', 'nis', 'nisn', 'nik', 'jk', 'tempat_lahir', 'tanggal_lahir',
      'alamat', 'sekolah_asal', 'nama_ayah', 'nama_ibu', 'hp_ortu', 'password', 'kelas',
    ];
    const ws = XLSX.utils.aoa_to_sheet([
      ['TEMPLATE IMPORT SISWA'],
      ['• Isi data mulai baris 9 (baris contoh 8-9 boleh ditimpa/dihapus). Nama kolom di baris 7 JANGAN diubah.'],
      ['• kolom "kelas": isi nama rombel PERSIS seperti di sheet "Rombel" — kosong/salah tulis = siswa masuk tanpa rombel.'],
      ['• kolom "hp_ortu": tulis 08… — otomatis menautkan akun orang tua bila sudah ada (untuk WhatsApp/login ortu).'],
      ['• kolom "nis"/"nisn": opsional — baris dengan NIS/NISN yang sudah terdaftar akan dilewati, bukan ditimpa.'],
      ['• kolom "password": password CBT siswa (mis. KP7D2X) — kosong = dibuat otomatis. Tercetak di kartu ujian.'],
      [],
      header,
      ['Ahmad Contoh', '1001', '0012345678', '3201234567890001', 'L', 'Bandung', '2012-05-14', 'Jl. Contoh No. 1', 'SD Muhammadiyah 1', 'Bapak Contoh', 'Ibu Contoh', '081234567890', 'KP7D2X', classes[0]?.name ?? '7A'],
      ['Siti Contoh', '1002', '0012345679', '3201234567890002', 'P', 'Bandung', '2012-08-21', 'Jl. Contoh No. 2', 'SDN 01 Bandung', 'Bapak Contoh', 'Ibu Contoh', '081234567891', '', classes[0]?.name ?? '7A'],
    ]);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length + 4, 14) }));
    const wsGuide = XLSX.utils.aoa_to_sheet([
      ['PETUNJUK IMPORT SISWA'],
      [],
      ['Kolom', 'Keterangan'],
      ['nama', 'Wajib'],
      ['nis / nisn', 'Opsional — baris dengan NIS/NISN yang sudah terdaftar dilewati'],
      ['nik', 'Opsional, 16 digit'],
      ['jk', 'L atau P (boleh juga "gender")'],
      ['tempat_lahir / tanggal_lahir', 'Format tanggal bebas (YYYY-MM-DD disarankan)'],
      ['nama_ayah / nama_ibu', 'Boleh juga "nama_ortu" untuk satu nama wali'],
      ['hp_ortu', 'Format 08… — bila cocok akun ortu, siswa otomatis tertaut'],
      ['kelas', 'Harus SAMA dengan nama rombel di sheet "Rombel" — nama lain diabaikan (siswa tetap masuk tanpa rombel)'],
      ['password', 'Password CBT siswa untuk login ujian — kosong = dibuat otomatis; tercetak di kartu peserta'],
    ]);
    wsGuide['!cols'] = [{ wch: 30 }, { wch: 90 }];
    const wsRombel = XLSX.utils.aoa_to_sheet([
      ['Daftar rombel tahun ajaran ini — pakai nama persis seperti ini di kolom "kelas":'],
      [],
      ...classes.map((c) => [c.name]),
    ]);
    wsRombel['!cols'] = [{ wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data Siswa');
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk');
    XLSX.utils.book_append_sheet(wb, wsRombel, 'Rombel');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Import siswa — kolom: nama, nis, nisn, nik, kelas, gender, tempat_lahir,
   *  tanggal_lahir, alamat, nama_ayah (atau nama_ortu), nama_ibu, hp_ortu,
   *  sekolah_asal. HP ortu disimpan canonical (62…) dan bila cocok dengan
   *  akun ortu yang sudah ada, siswa otomatis tertaut (parentId). */
  async importStudents(
    buffer: Buffer,
    academicYearId: string,
    classMap: Record<string, string>,
    dry = false,
    forceClassId?: string,
  ) {
    const wb = parseXlsx(buffer);
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    // Template punya baris keterangan di atas — cari baris header (kolom
    // pertama == "nama") agar file lama (header di baris 1) tetap jalan.
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const headerIdx = grid.findIndex(
      (row) => String(row[0] ?? '').trim().toLowerCase() === 'nama',
    );
    if (headerIdx < 0) {
      throw new BadRequestException('Kolom "nama" tidak ditemukan — pakai template unduhan.');
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerIdx,
      defval: '',
    });
    // Rombel tujuan dari dropdown — bila dipilih, semua baris masuk ke sana
    // mengabaikan kolom "kelas" di file.
    const forceClass = forceClassId
      ? await this.prisma.class.findUnique({ where: { id: forceClassId }, select: { id: true, name: true } })
      : null;
    type Row = {
      row: number; name: string; ok: boolean; msg: string;
      nis?: string | null; nisn?: string | null; kelas?: string | null; hp?: string | null;
    };
    const results: Row[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowNo = headerIdx + i + 2;
      const name = String(r['nama'] ?? r['name'] ?? '').trim();
      if (!name) { results.push({ row: rowNo, name: `baris ${rowNo}`, ok: false, msg: 'Nama kosong' }); continue; }
      const nis = String(r['nis'] ?? '').trim() || null;
      const nisn = String(r['nisn'] ?? '').trim() || null;
      const nik = String(r['nik'] ?? '').trim() || null;
      const className = String(r['kelas'] ?? '').trim();
      const hpRaw = String(r['hp_ortu'] ?? r['no_hp'] ?? r['phone'] ?? '').trim();
      const hp = hpRaw ? normalizePhone(hpRaw) : '';
      const hpLocal = hp ? `0${hp.slice(2)}` : null;
      const classId = forceClass ? forceClass.id : classMap[className.toLowerCase()];
      const kelasLabel = forceClass ? forceClass.name : classId ? className : null;
      try {
        if (nis && (await this.prisma.student.findUnique({ where: { nis } }))) {
          results.push({ row: rowNo, name, ok: false, msg: `NIS ${nis} sudah ada`, nis, nisn, hp: hpLocal, kelas: kelasLabel }); continue;
        }
        if (nisn && (await this.prisma.student.findUnique({ where: { nisn } }))) {
          results.push({ row: rowNo, name, ok: false, msg: `NISN ${nisn} sudah ada`, nis, nisn, hp: hpLocal, kelas: kelasLabel }); continue;
        }
        const msgBase = classId
          ? `Masuk rombel ${kelasLabel}`
          : className
            ? `Kelas "${className}" tak dikenal — masuk tanpa rombel`
            : 'Masuk tanpa rombel';
        if (dry) {
          results.push({ row: rowNo, name, ok: true, msg: msgBase, nis, nisn, hp: hpLocal, kelas: kelasLabel });
          continue;
        }
        // Tautkan akun ortu yang sudah ada (mis. dari pendaftaran SPMB) by HP.
        const parent = hp
          ? await this.prisma.user.findUnique({ where: { phone: hp }, select: { id: true } })
          : null;
        // Siswa + enrollment atomik per baris — gagal di tengah tak
        // menyisakan siswa tanpa rombel / rombel tanpa siswa.
        await this.prisma.$transaction(async (tx) => {
          const student = await tx.student.create({
            data: {
              name, nis, nisn, nik,
              gender: String(r['gender'] ?? r['jk'] ?? '').toUpperCase().startsWith('P') ? 'FEMALE' : String(r['gender'] ?? r['jk'] ?? '') ? 'MALE' : null,
              birthPlace: String(r['tempat_lahir'] ?? '').trim() || null,
              birthDate: r['tanggal_lahir'] ? toDateOnly(String(r['tanggal_lahir'])) : null,
              address: String(r['alamat'] ?? '').trim() || null,
              previousSchool: String(r['sekolah_asal'] ?? '').trim() || null,
              fatherName:
                String(r['nama_ayah'] ?? '').trim() ||
                String(r['nama_ortu'] ?? r['nama_orang_tua'] ?? '').trim() || null,
              motherName: String(r['nama_ibu'] ?? '').trim() || null,
              parentPhone: hp || null,
              parentId: parent?.id ?? null,
              // Password CBT dari kolom "password" — kosong = auto-generate.
              password: String(r['password'] ?? '').trim().toUpperCase() || genStudentPassword(),
            },
          });
          if (classId) {
            await tx.enrollment.create({ data: { studentId: student.id, classId, academicYearId } });
          }
        });
        results.push({ row: rowNo, name, ok: true, msg: msgBase, nis, nisn, hp: hpLocal, kelas: kelasLabel });
      } catch (e) {
        results.push({ row: rowNo, name, ok: false, msg: e instanceof Error ? e.message.slice(0, 80) : 'gagal', nis, nisn, hp: hpLocal, kelas: kelasLabel });
      }
    }
    return { total: rows.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

}
