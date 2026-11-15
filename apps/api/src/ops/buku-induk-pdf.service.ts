import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ZipArchive } from 'archiver';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';

type Details = Record<string, string>;
type RecordStudent = NonNullable<Awaited<ReturnType<BukuIndukPdfService['loadStudent']>>>;

const MAPEL_BAWAAN = [
  'Pendidikan Agama dan Budi Pekerti', 'Pendidikan Pancasila dan Kewarganegaraan',
  'Bahasa Indonesia', 'Matematika (Umum)', 'Ilmu Pengetahuan Alam (IPA)',
  'Ilmu Pengetahuan Sosial (IPS)', 'Bahasa Inggris', 'Seni Budaya',
  'Pend. Jasmani, Olahraga dan Kesehatan', 'Informatika', 'Muatan Lokal Bahasa Daerah',
];
const KEPRIBADIAN: [string, string][] = [
  ['disiplin', 'Disiplin/Ketertiban'], ['prakarsa', 'Prakarsa/Kreativitas'],
  ['tanggungJawab', 'Tanggung Jawab'], ['penyesuaian', 'Penyesuaian Diri'],
  ['emosi', 'Kemantapan Emosi'], ['kerjasama', 'Kerjasama'],
];

const tryParse = <T,>(raw: string | undefined, fb: T): T => {
  try { return raw ? (JSON.parse(raw) as T) : fb; } catch { return fb; }
};
const phoneLocal = (p?: string | null) => {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  return d.startsWith('62') ? `0${d.slice(2)}` : d.startsWith('0') ? d : `0${d}`;
};
const sanitize = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

type ExportQuery = {
  academicYearId?: string | undefined; classId?: string | undefined;
  gradeLevel?: number | undefined; studentIds?: string[] | undefined; all?: boolean | undefined;
};

@Injectable()
export class BukuIndukPdfService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async loadStudent(id: string) {
    return this.prisma.student.findUnique({
      where: { id },
      include: {
        parent: { select: { name: true, phone: true, email: true } },
        candidate: { select: { previousSchool: true, address: true, birthPlace: true, birthDate: true } },
        enrollments: { include: { class: { select: { name: true, gradeLevel: true } }, academicYear: { select: { name: true } } }, orderBy: { academicYear: { name: 'desc' } } },
        achievements: { orderBy: { createdAt: 'desc' } },
        ekskulMemberships: { include: { extracurricular: { select: { name: true } } }, orderBy: { joinedAt: 'desc' } },
      },
    });
  }

  /** Cari siswa untuk ekspor — selected / class / grade / all. */
  async resolveStudents(q: ExportQuery) {
    const where: Record<string, unknown> = { status: 'ACTIVE' };
    if (q.studentIds?.length) {
      where.id = { in: q.studentIds };
      delete where.status;
    } else {
      const enr: Record<string, unknown> = {};
      if (q.classId) enr.classId = q.classId;
      if (q.gradeLevel) enr.class = { gradeLevel: q.gradeLevel };
      if (q.academicYearId) enr.academicYearId = q.academicYearId;
      if (Object.keys(enr).length) where.enrollments = { some: enr };
    }
    const students = await this.prisma.student.findMany({ where: where as never, select: { id: true }, orderBy: { name: 'asc' } });
    const full: RecordStudent[] = [];
    for (const st of students) {
      const s = await this.loadStudent(st.id);
      if (s) full.push(s);
    }
    return full;
  }

  /** Ekspor → PDF tunggal atau ZIP berstruktur Kelas X/<rombel>/<siswa>.pdf */
  async export(q: ExportQuery) {
    const students = await this.resolveStudents(q);
    if (!students.length) throw new NotFoundException('Tidak ada siswa pada cakupan ini.');
    const school = await this.prisma.school.findFirst();

    const files: { name: string; buf: Buffer }[] = [];
    for (const s of students) {
      const enr = s.enrollments.find((e) => e.academicYearId === q.academicYearId) ?? s.enrollments[0];
      const grade = enr?.class?.gradeLevel ? `Kelas ${enr.class.gradeLevel}` : 'Tanpa Kelas';
      const cls = enr?.class?.name ?? 'Tanpa Kelas';
      const fileName = `${sanitize(`${s.nis ?? 'nonis'} - ${s.name}`)}.pdf`;
      const photo = s.photoKey ? await this.storage.getObjectBuffer(s.photoKey).catch(() => null) : null;
      const buf = await this.render(s, school, photo, enr?.academicYear?.name ?? null);
      files.push({ name: `${grade}/${cls}/${fileName}`, buf });
    }

    if (files.length === 1) {
      const only = files[0]!;
      return { buf: only.buf, mime: 'application/pdf' as const, name: only.name.split('/').pop()! };
    }
    const zip = await this.zip(files);
    return { buf: zip, mime: 'application/zip' as const, name: 'buku-induk.zip' };
  }

  private zip(files: { name: string; buf: Buffer }[]) {
    return new Promise<Buffer>((resolve, reject) => {
      const archive = new ZipArchive({ zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      archive.on('data', (c: Buffer) => chunks.push(c));
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
      for (const f of files) archive.append(f.buf, { name: f.name });
      void archive.finalize();
    });
  }

  // ===================== Render satu siswa =====================
  private render(s: RecordStudent, school: { name?: string } | null, photo: Buffer | null, yearName: string | null) {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 42, bottom: 42, left: 46, right: 46 } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const det = (s.recordDetails ?? {}) as Details;
      const g = (k: string) => det[k] ?? '';
      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const X = doc.page.margins.left;

      // ---- helpers ----
      const ensure = (h: number) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
      const sub = (label: string, val: string) => {
        const labelW = 200;
        const valW = pageW - 60 - labelW - 10;
        const h = Math.max(doc.heightOfString(label, { width: labelW }), doc.heightOfString(val || ' ', { width: valW }), 12);
        ensure(h);
        const y = doc.y;
        doc.font('Helvetica').fontSize(9).text(label, X + 60, y, { width: labelW });
        doc.text(':', X + 60 + labelW + 2, y);
        doc.text(val || '—', X + 60 + labelW + 10, y, { width: valW });
        doc.y = y + h + 1.5;
      };
      const row = (no: string | number, label: string, val: string, opts?: { sub?: { label: string; val: string }[] }) => {
        const labelW = 225;
        const valW = pageW - 22 - labelW - 10;
        const h = Math.max(doc.heightOfString(label, { width: labelW }), doc.heightOfString(val || ' ', { width: valW }), 13);
        ensure(h + (opts?.sub?.length ?? 0) * 13);
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9).text(String(no), X, y, { width: 22, align: 'right' });
        doc.font('Helvetica').text(label, X + 28, y, { width: labelW });
        doc.text(':', X + 28 + labelW + 2, y);
        doc.font('Helvetica').text(val || '—', X + 28 + labelW + 10, y, { width: valW });
        doc.y = y + h + 1.5;
        for (const sb of opts?.sub ?? []) sub(sb.label, sb.val);
      };
      const section = (title: string) => {
        ensure(30);
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(10).text(title.toUpperCase(), X, doc.y, { width: pageW, align: 'center' });
        doc.moveDown(0.3);
        doc.font('Helvetica').fontSize(9);
      };
      const table = (widths: number[], head: string[][], rows: string[][], opt?: { align?: ('left' | 'center')[] }) => {
        const drawRow = (cells: string[], isHead: boolean) => {
          const heights = cells.map((c, i) => doc.heightOfString(c || ' ', { width: widths[i]! - 8 }));
          const h = Math.max(...heights, 11) + 5;
          ensure(h);
          const y = doc.y;
          let x = X;
          cells.forEach((c, i) => {
            doc.rect(x, y, widths[i]!, h).stroke();
            doc.font(isHead ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
              .text(c, x + 4, y + 2.5, { width: widths[i]! - 8, align: isHead ? 'center' : (opt?.align?.[i] ?? 'left') });
            x += widths[i]!;
          });
          doc.y = y + h;
        };
        head.forEach((hr) => drawRow(hr, true));
        rows.forEach((r) => drawRow(r, false));
        doc.moveDown(0.3);
      };
      const letter = (t: string) => { ensure(20); doc.moveDown(0.3); doc.font('Helvetica-Bold').fontSize(9).text(t); doc.font('Helvetica'); };

      // ================= Halaman 1 — identitas =================
      doc.font('Helvetica-Bold').fontSize(13).text('LEMBAR BUKU INDUK PESERTA DIDIK SMP', X, doc.y, { width: pageW, align: 'center' });
      if (school?.name) doc.font('Helvetica').fontSize(9).text(school.name + (yearName ? ` — TA ${yearName}` : ''), X, doc.y, { width: pageW, align: 'center' });
      doc.moveDown(0.7);

      const headY = doc.y;
      const headW = pageW - 100;
      const headRow = (label: string, val: string) => {
        const y = doc.y;
        doc.font('Helvetica').fontSize(9).text(label, X, y, { width: 110 });
        doc.text(':', X + 114, y);
        doc.text(val || '—', X + 122, y, { width: headW - 122 });
        doc.y = y + 14;
      };
      headRow('Nomor Induk', s.nis ?? '');
      headRow('NISN', s.nisn ?? '');
      headRow('NIK', (s as Record<string, unknown>).nik as string ?? '');
      headRow('Waktu Diterima Di Sekolah Ini', g('waktuDiterima'));
      // Pas foto 3x4 cm
      const px = X + pageW - 88;
      doc.rect(px, headY, 80, 106).stroke();
      if (photo) { try { doc.image(photo, px + 1, headY + 1, { width: 78, height: 104, fit: [78, 104] }); } catch { /* abaikan */ } }
      else doc.fontSize(8).text('Pas Photo\n3 x 4 cm', px, headY + 38, { width: 80, align: 'center' });
      doc.y = Math.max(doc.y, headY + 110);

      const jk = s.gender === 'MALE' ? 'Laki-laki' : s.gender === 'FEMALE' ? 'Perempuan' : '';
      const ttl = [s.birthPlace ?? s.candidate?.birthPlace, (s.birthDate ?? s.candidate?.birthDate)?.toISOString().slice(0, 10)].filter(Boolean).join(', ');

      section('A. Keterangan Pribadi Siswa');
      row(1, 'Nama Lengkap', s.name);
      row(2, 'Nama Panggilan', g('panggilan'));
      row(3, 'Jenis Kelamin', jk);
      row(4, 'Tempat dan Tanggal Lahir', ttl);
      row(5, 'Agama', g('agama') || 'Islam');
      row(6, 'Kewarganegaraan', g('kewarganegaraan') || 'Indonesia');
      row(7, 'Anak ke', g('anakKe'));
      row(8, 'Jumlah Saudara', `Kandung : ${g('saudaraKandung') || '—'}   Tiri : ${g('saudaraTiri') || '—'}   Angkat : ${g('saudaraAngkat') || '—'}`);
      row(9, 'Anak yatim/piatu/yatim piatu', g('yatim'));
      row(10, 'Bahasa sehari-hari di rumah', g('bahasa'));

      section('B. Keterangan Tempat Tinggal Siswa');
      row(11, 'Alamat Peserta Didik', `${s.address ?? s.candidate?.address ?? ''} ${g('alamatDetail')}`.trim(), {
        sub: [{ label: 'Kode Pos', val: g('kodePos') }, { label: 'Telepon/HP pribadi', val: g('telpPribadi') }],
      });
      row(12, 'Selama bersekolah tinggal dengan', g('tinggalDengan'));
      row(13, 'Jarak dari tempat tinggal ke sekolah', g('jarakSekolah'));
      row(14, 'Ke sekolah dengan', g('transportasi'));

      section('C. Keterangan Jasmani dan Kesehatan Siswa');
      row(15, 'Berat badan', `saat diterima : ${g('beratTerima') || '—'} kg   saat meninggalkan sekolah : ${g('beratKeluar') || '—'} kg`);
      row(16, 'Tinggi badan', `saat diterima : ${g('tinggiTerima') || '—'} cm   saat meninggalkan sekolah : ${g('tinggiKeluar') || '—'} cm`);
      row(17, 'Golongan Darah', g('golDarah'));
      row(18, 'Penyakit yang pernah diderita', '');
      const penyakit = tryParse<{ jenis: string; kelas: string; tahun: string; lama: string; ket: string }[]>(det.penyakit, []);
      table([24, 150, 45, 50, 60, pageW - 329], [['No', 'Jenis Penyakit', 'Kelas', 'Tahun', 'Lama Sakit', 'Keterangan']],
        penyakit.length ? penyakit.map((p, i) => [String(i + 1), p.jenis, p.kelas, p.tahun, p.lama, p.ket]) : [['—', 'tidak ada', '', '', '', '']]);
      row(19, 'Kelainan Jasmaniah Lainnya', g('kelainan') || s.healthNotes || '');

      section('D. Keterangan tentang Pendidikan Sebelumnya');
      row(20, 'Diterima di sekolah ini sebagai siswa baru tanggal', g('diterimaTgl'), {
        sub: [
          { label: 'Asal Sekolah Dasar', val: g('asalSd') || s.previousSchool || s.candidate?.previousSchool || '' },
          { label: 'Alamat', val: g('sdAlamat') }, { label: 'Tanggal dan No. Ijazah', val: g('sdIjazah') },
        ],
      });
      row(21, 'Diterima sebagai siswa pindahan pada tanggal', g('pindahTgl'), {
        sub: [
          { label: 'Di kelas', val: g('pindahKelas') }, { label: 'Dari SMP', val: g('pindahDariSmp') },
          { label: 'Alamat', val: g('pindahSmpAlamat') }, { label: 'Asal SD/No. Ijazah', val: g('pindahAsalSd') },
          { label: 'Alasan pindah ke sekolah ini', val: g('pindahAlasan') },
        ],
      });

      section('E. Keterangan tentang Orang Tua Kandung');
      letter('22. Data orang tua kandung');
      const ortuRows: [string, string, string][] = [
        ['Nama', 'ayahNama', 'ibuNama'], ['Tempat, Tanggal Lahir', 'ayahTtl', 'ibuTtl'],
        ['Kewarganegaraan', 'ayahWarga', 'ibuWarga'], ['Pendidikan Terakhir', 'ayahPendidikan', 'ibuPendidikan'],
        ['Pekerjaan', 'ayahPekerjaan', 'ibuPekerjaan'], ['Penghasilan/ bulan', 'ayahPenghasilan', 'ibuPenghasilan'],
        ['Alamat', 'ayahAlamat', 'ibuAlamat'], ['No HP', 'ayahHp', 'ibuHp'],
      ];
      table([160, (pageW - 160) / 2, (pageW - 160) / 2], [['', 'Ayah', 'Ibu']],
        ortuRows.map(([lbl, ka, ki]) => [
          lbl,
          g(ka) || (ka === 'ayahNama' ? s.fatherName ?? '' : ka === 'ayahPekerjaan' ? s.parentOccupation ?? '' : ka === 'ayahHp' ? phoneLocal(s.parentPhone ?? s.parent?.phone) : ''),
          g(ki) || (ki === 'ibuNama' ? s.motherName ?? '' : ''),
        ]));

      section('F. Keterangan tentang Wali');
      letter('23. Data wali');
      const waliRows: [string, string, string][] = [
        ['Nama', 'waliLNama', 'waliPNama'], ['Tempat & tanggal lahir', 'waliLTtl', 'waliPTtl'],
        ['Kewarganegaraan', 'waliLWarga', 'waliPWarga'], ['Pendidikan tertinggi', 'waliLPendidikan', 'waliPPendidikan'],
        ['Pekerjaan', 'waliLPekerjaan', 'waliPPekerjaan'], ['Penghasilan/bulan/tahun', 'waliLPenghasilan', 'waliPPenghasilan'],
        ['Alamat', 'waliLAlamat', 'waliPAlamat'], ['Hubungan dengan peserta didik', 'waliLHubungan', 'waliPHubungan'],
      ];
      table([160, (pageW - 160) / 2, (pageW - 160) / 2], [['', 'Laki-laki', 'Perempuan']],
        waliRows.map(([lbl, kl, kp]) => [
          lbl,
          g(kl) || (kl === 'waliLNama' ? g('waliNama') || s.parent?.name || '' : ''),
          g(kp) || (kp === 'waliPNama' ? g('waliP2Nama') : ''),
        ]));

      section('G. Keterangan Intelegensi, Kepribadian dan Prestasi Siswa');
      row(24, 'Inteligensi (IQ)', `${g('iq') || s.intelligenceNotes || '—'}${g('iqTesTanggal') ? `   Berdasarkan tes tanggal : ${g('iqTesTanggal')}` : ''}`);
      letter('25. Kepribadian');
      const kep = tryParse<Record<string, string>>(det.kepribadian, {});
      table([24, pageW - 24 - 3 * 55, 55, 55, 55], [['No', 'Aspek yang dinilai', 'Baik', 'Cukup', 'Kurang']],
        KEPRIBADIAN.map(([k, lbl], i) => [String(i + 1), lbl, kep[k] === 'B' ? 'V' : '', kep[k] === 'C' ? 'V' : '', kep[k] === 'K' ? 'V' : '']),
        { align: ['center', 'left', 'center', 'center', 'center'] });
      letter('26. Keikutsertaan/Prestasi yang pernah dicapai dalam bidang');
      for (const [lbl, k] of [['a. Kesenian', 'prestasiKesenian'], ['b. Olahraga', 'prestasiOlahraga'], ['c. Organisasi', 'prestasiOrganisasi'], ['d. Pramuka', 'prestasiPramuka'], ['e. Karya Tulis', 'prestasiKaryaTulis'], ['f. Lainnya', 'prestasiLain']] as const) {
        sub(lbl, g(k));
      }
      if (s.ekskulMemberships.length) sub('Ekstrakurikuler (otomatis)', s.ekskulMemberships.map((m) => m.extracurricular.name).join(', '));
      if (s.achievements.length) sub('Prestasi terekam (otomatis)', s.achievements.map((a) => [a.title, a.level, a.year].filter(Boolean).join(' — ')).join('; '));
      letter('27. Penerimaan bea siswa');
      const bea = tryParse<{ tahun: string; dari: string }[]>(det.beasiswa, []);
      if (bea.length) bea.forEach((b) => sub(`Tahun ${b.tahun}`, `Dari : ${b.dari}`));
      else sub('—', 'tidak ada');

      section('H. Keterangan Kehadiran');
      letter('28. Jumlah hari kehadiran tiap semester');
      const kh = tryParse<{ kelas: string; hadir: string; hadirPct: string; sakit: string; izin: string; alpa: string; jml: string; pct: string; efektif: string }[]>(det.kehadiran, []);
      table(
        [92, 46, 40, 46, 42, 44, 50, 40, pageW - 400],
        [['Kls/smt', 'Hadir', '%', 'Sakit', 'Izin', 'Alpa', 'Jml', '%', 'Hari efektif']],
        Array.from({ length: 6 }, (_, i) => { const r = kh[i]; return r ? [`${r.kelas}/ smt ${i % 2 ? 2 : 1}`, r.hadir, r.hadirPct, r.sakit, r.izin, r.alpa, r.jml, r.pct, r.efektif] : [`/ smt ${i % 2 ? 2 : 1}`, '', '', '', '', '', '', '', '']; }),
        { align: Array(9).fill('center') },
      );

      section('I. Meninggalkan Sekolah');
      row(29, 'Tamat Belajar', `Tanggal : ${g('tamatTgl') || '—'}   No Ijazah : ${g('tamatIjazah') || '—'}`, {
        sub: [{ label: 'Melanjutkan sekolah ke', val: g('lanjutKe') }, { label: 'Alamat', val: g('lanjutAlamat') }],
      });
      row(30, 'Pindah Sekolah ke', g('pindahKeSekolah'), {
        sub: [
          { label: 'Tanggal Pindah / Dari Kelas', val: `${g('pindahKeluarTgl')} / ${g('pindahDariKelas')}` },
          { label: 'Alamat Sekolah', val: g('pindahAlamatSekolah') },
          { label: 'Alasan Pindah', val: g('pindahKeluarAlasan') || s.leavingNotes || '' },
        ],
      });
      row(31, 'Putus Sekolah', `Tanggal : ${g('putusTgl') || '—'}   Alasan : ${g('putusAlasan') || '—'}`);

      section('J. Lain-Lain');
      letter('32. Catatan penting selama siswa belajar di sekolah ini');
      ensure(40);
      doc.font('Helvetica').fontSize(9).text(g('catatan') || s.otherNotes || '—', X + 28, doc.y, { width: pageW - 28 });

      // ================= Halaman 2 — Daftar Nilai =================
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(13).text('LEMBAR BUKU INDUK — DAFTAR NILAI', X, doc.y, { width: pageW, align: 'center' });
      doc.moveDown(0.6);
      const y2 = doc.y;
      doc.fontSize(9).font('Helvetica').text('Nama Siswa', X, y2); doc.text(':', X + 80, y2); doc.font('Helvetica-Bold').text(s.name, X + 88, y2);
      doc.font('Helvetica').text('NIS / NISN', X, y2 + 13); doc.text(':', X + 80, y2 + 13); doc.text(`${s.nis ?? '—'} / ${s.nisn ?? '—'}`, X + 88, y2 + 13);
      const px2 = X + pageW - 88;
      doc.rect(px2, y2, 80, 106).stroke();
      if (photo) { try { doc.image(photo, px2 + 1, y2 + 1, { width: 78, height: 104, fit: [78, 104] }); } catch { /* abaikan */ } }
      else doc.fontSize(8).text('Pas Photo', px2, y2 + 45, { width: 80, align: 'center' });
      doc.y = y2 + 112;

      const nk = tryParse<{ tp: string; kelas: string }[]>(det.nilaiKepala, []);
      const boxW = (pageW - 16) / 3;
      const headY3 = doc.y;
      for (let i = 0; i < 3; i++) {
        const k = nk[i];
        doc.rect(X + i * (boxW + 8), headY3, boxW, 34).stroke();
        doc.fontSize(8.5).font('Helvetica')
          .text(`Tahun Pelajaran : ${k?.tp || ''}`, X + i * (boxW + 8) + 4, headY3 + 4)
          .text(`Kelas : ${k?.kelas || ''}   (smt ${i * 2 + 1} & ${i * 2 + 2})`, X + i * (boxW + 8) + 4, headY3 + 18);
      }
      doc.y = headY3 + 40;

      const nm = tryParse<{ m: string; n: string[]; ujian: string; ijazah: string }[]>(det.nilaiMapel, []);
      const mapelRows = (nm.length ? nm : MAPEL_BAWAAN.map((m) => ({ m, n: Array(6).fill(''), ujian: '', ijazah: '' })));
      const wNo = 22, wM = pageW - 22 - 6 * 36 - 44 - 44;
      table(
        [wNo, wM, 36, 36, 36, 36, 36, 36, 44, 44],
        [['No', 'Mata Pelajaran', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'Ujian', 'Ijazah']],
        [
          ...mapelRows.map((r, i) => [String(i + 1), r.m, ...(r.n ?? []).slice(0, 6), r.ujian, r.ijazah]),
          ['', 'Jumlah Nilai', ...Array.from({ length: 6 }, (_, j) => String(mapelRows.reduce((a, x) => a + (Number(x.n?.[j]) || 0), 0) || '')), '', ''],
          ['', 'Rata-rata', ...Array.from({ length: 6 }, (_, j) => {
            const c = mapelRows.filter((x) => Number(x.n?.[j])).length;
            return c ? (mapelRows.reduce((a, x) => a + (Number(x.n?.[j]) || 0), 0) / c).toFixed(1).replace('.', ',') : '';
          }), '', ''],
        ],
        { align: ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'] },
      );

      const ne = tryParse<{ nama: string; ket: string }[]>(det.nilaiEkskul, []);
      const ekskulRows = ne.length ? ne : s.ekskulMemberships.map((m) => ({ nama: m.extracurricular.name, ket: '' }));
      const nh = tryParse<{ sakit: string[]; izin: string[]; tk: string[] }>(det.nilaiHadir, { sakit: [], izin: [], tk: [] });
      const nj = tryParse<{ tp: string; ket: string }[]>(det.nilaiKeputusan, []);
      ensure(120);
      doc.font('Helvetica-Bold').fontSize(9).text('EKSTRAKURIKULER', X, doc.y);
      doc.moveUp(); doc.text('KETIDAKHADIRAN (hari)', X + pageW / 2 + 6, doc.y);
      doc.moveDown(0.2);
      const halfY = doc.y;
      // kolom kiri — ekskul
      let yy = halfY;
      const ew = pageW / 2 - 8;
      const eWidths = [20, ew - 20 - 90, 90];
      const eRow = (cells: string[], bold: boolean) => {
        const h = Math.max(...cells.map((c, i) => doc.heightOfString(c || ' ', { width: eWidths[i]! - 6 })), 10) + 4;
        let x = X;
        cells.forEach((c, i) => {
          doc.rect(x, yy, eWidths[i]!, h).stroke();
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(c, x + 3, yy + 2, { width: eWidths[i]! - 6 });
          x += eWidths[i]!;
        });
        yy += h;
      };
      eRow(['No', 'Ekstrakurikuler', 'Keterangan'], true);
      (ekskulRows.length ? ekskulRows : [{ nama: '', ket: '' }, { nama: '', ket: '' }, { nama: '', ket: '' }]).forEach((r, i) => eRow([String(i + 1), r.nama, r.ket], false));
      // kolom kanan — ketidakhadiran
      let yh = halfY;
      const hx = X + pageW / 2 + 6;
      const hWidths = [50, (pageW / 2 - 6 - 50) / 3, (pageW / 2 - 6 - 50) / 3, (pageW / 2 - 6 - 50) / 3];
      const hRow = (cells: string[], bold: boolean) => {
        const h = 14;
        let x = hx;
        cells.forEach((c, i) => {
          doc.rect(x, yh, hWidths[i]!, h).stroke();
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(c, x + 3, yh + 3, { width: hWidths[i]! - 6, align: 'center' });
          x += hWidths[i]!;
        });
        yh += h;
      };
      hRow(['Semester', 'Sakit', 'Izin', 'Tanpa Ket.'], true);
      for (let i = 0; i < 6; i++) hRow([String(i + 1), nh.sakit?.[i] ?? '', nh.izin?.[i] ?? '', nh.tk?.[i] ?? ''], false);
      doc.y = Math.max(yy, yh) + 8;

      doc.font('Helvetica-Bold').fontSize(9).text('KEPUTUSAN AKHIR TAHUN PELAJARAN');
      doc.moveDown(0.2);
      table([90, pageW - 90], [['Th. Pelajaran', 'Keputusan (Naik/Tidak Naik ke Kelas …)']],
        [0, 1, 2].map((i) => [nj[i]?.tp ?? '', nj[i]?.ket ?? '']));

      doc.end();
    });
  }
}
