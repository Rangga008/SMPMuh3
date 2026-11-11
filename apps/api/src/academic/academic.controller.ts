import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseFilePipeBuilder,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as XLSX from 'xlsx';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermission } from '../identity/decorators/require-permission.decorator';
import { AcademicService } from './academic.service';
import {
  AssessmentDto,
  CalendarEventDto,
  ClassDto,
  CurriculumDto,
  EmployeeDto,
  EnrollmentDto,
  LinkAccountDto,
  GradeDto,
  GtkOptionDto,
  UpdateGtkOptionDto,
  ScheduleEntryDto,
  SemesterDto,
  SubjectDto,
  TeachingAssignmentDto,
  UpdateClassDto,
  UpdateCurriculumDto,
  UpdateSemesterDto,
  UpdateSubjectDto,
} from './dto/academic.dto';
import { ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GradesBody {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GradeDto)
  grades!: GradeDto[];
}

const R = PERMISSIONS.ACADEMIC_READ;
const M = PERMISSIONS.ACADEMIC_MANAGE;
const ER = PERMISSIONS.EMPLOYEE_READ;
const EM = PERMISSIONS.EMPLOYEE_MANAGE;

@Controller({ version: '1' })
export class AcademicController {
  constructor(private readonly academic: AcademicService) {}

  // ---------- Employees ----------
  @Get('employees')
  @RequirePermission(ER)
  employees(
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('kind') kind?: string,
    @Query('duty') duty?: string,
    @Query('unlinked') unlinked?: string,
  ) {
    return this.academic.listEmployees(type, search, department, kind, duty, unlinked === '1' || unlinked === 'true');
  }

  /** Anggota bidang milik pegawai yang login — untuk kepala bidang. */
  @Get('employees/my-department')
  myDepartment(@CurrentUser() u: AuthUser) {
    return this.academic.myDepartment(u.id);
  }

  @Post('employees')
  @RequirePermission(EM)
  createEmployee(@CurrentUser() u: AuthUser, @Body() dto: EmployeeDto) {
    return this.academic.createEmployee(dto, u.id);
  }

  @Patch('employees/:id')
  @RequirePermission(EM)
  updateEmployee(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeDto,
  ) {
    return this.academic.updateEmployee(id, dto, u.id);
  }

  /** Kaitkan akun login yatim ke pegawai yang sudah ada — tanpa membuat record baru. */
  @Post('employees/:id/link-account')
  @RequirePermission(EM)
  linkAccount(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkAccountDto,
  ) {
    return this.academic.linkEmployeeAccount(id, dto.userId, u.id);
  }

  /** Lepas tautan akun — akun kembali jadi yatim, bisa dikaitkan ke pegawai lain. */
  @Delete('employees/:id/link-account')
  @RequirePermission(EM)
  unlinkAccount(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.unlinkEmployeeAccount(id, u.id);
  }

  /** Template Excel import pegawai — header sesuai kolom yang dibaca import. */
  @Get('employees/import-template')
  @RequirePermission(ER)
  async importTemplate(@Res({ passthrough: true }) res: Response) {
    // Daftar jabatan & tugas tambahan diambil dari opsi GTK yang dikelola
    // admin — bila tabel kosong, pakai daftar bawaan.
    const opts = await this.academic.listGtkOptions();
    const active = (g: string) =>
      opts.filter((o) => o.group === g && o.isActive).map((o) => o.code);
    const kinds = active('STAFF_KIND');
    const duties = active('DUTY');
    const kindText =
      kinds.join(' / ') || 'TU / LAYSUS / SATPAM / KEPALA_SEKOLAH';
    const dutyText =
      duties.join(' / ') ||
      'WAKASEK_KURIKULUM / WAKASEK_KESISWAAN / WAKASEK_SARPRAS / KEPALA_TU / BENDAHARA_SEKOLAH / BENDAHARA_BOS / BENDAHARA_RMP / OPERATOR_DAPODIK / KONTEN_KREATOR / KEPALA_PERPUSTAKAAN / STAF_PERPUSTAKAAN / PETUGAS_KEBERSIHAN_L1-L4 / SATPAM';
    // Sheet utama berbahasa Indonesia — model GTK ala Dapodik.
    // Blok keterangan baris 1-5, header baris 6, contoh baris 7, data mulai 8.
    const ws = XLSX.utils.aoa_to_sheet([
      ['TEMPLATE IMPORT GTK — isi data mulai BARIS 8 (baris keterangan & contoh abaikan, jangan diubah/dihapus)'],
      ['Jenis          : GURU / TENDIK (kosong = GURU)'],
      [`Jabatan        : khusus TENDIK — ${kindText} (kosongkan untuk GURU)`],
      [`Tugas Tambahan : ${dutyText} (kosongkan bila tidak ada)`],
      ['Bidang & akses : OTOMATIS dari tugas tambahan/jabatan — wakasek Kurikulum→bidang Kurikulum, Bendahara→Keuangan, dst'],
      [],
      ['Nama Lengkap', 'NIP/NUPTK', 'Jenis', 'Jabatan', 'Tugas Tambahan', 'Telepon/HP', 'Email', 'Password'],
      ['CONTOH — Ahmad Hidayat, S.Pd. (hapus baris ini)', '19750101001', 'GURU', '', 'WAKASEK_KURIKULUM', '081234567890', 'ahmad@smpmuh3.sch.id', 'guru123'],
    ]);
    ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'GTK');
    const guide = XLSX.utils.json_to_sheet([
      { kolom: 'Nama Lengkap', wajib: 'YA', keterangan: 'Nama lengkap pegawai — contoh: Ahmad Hidayat, S.Pd.' },
      { kolom: 'NIP/NUPTK', wajib: 'tidak', keterangan: 'NIP atau NUPTK — dipakai untuk dedup; jangan dobel — contoh: 19750101001' },
      { kolom: 'Jenis', wajib: 'tidak', keterangan: 'GURU atau TENDIK (Tenaga Kependidikan) — kosong = GURU' },
      { kolom: 'Jabatan', wajib: 'khusus TENDIK', keterangan: `${kindText} — kosongkan untuk GURU` },
      { kolom: 'Tugas Tambahan', wajib: 'tidak', keterangan: `Nilai aktif: ${dutyText} — juga menerima ejaan bebas (mis. "wakasek kesiswaan", "kepala perpustakaan")` },
      { kolom: 'Telepon/HP', wajib: 'tidak*', keterangan: 'No. HP — dipakai login akun; harus unik — contoh: 081234567890' },
      { kolom: 'Email', wajib: 'tidak*', keterangan: 'Email — dipakai login akun; harus unik — contoh: ahmad@smpmuh3.sch.id' },
      { kolom: 'Password', wajib: 'tidak', keterangan: 'Password akun — diisi = dipakai; KOSONG = digenerate acak & tampil di hasil import — contoh: guru123' },
      { kolom: 'Bidang', wajib: '-', keterangan: 'Otomatis: tugas tambahan → bidang (wakasek Kurikulum→Kurikulum, Bendahara→Keuangan); jabatan → bidang (TU→Tata Usaha, Laysus/Satpam→Laysus)' },
      { kolom: '*akun', wajib: '-', keterangan: 'Akun login dibuat bila email/HP diisi & opsi "buat akun" dicentang — role mengikuti tugas/jabatan' },
      { kolom: '*dedup', wajib: '-', keterangan: 'NIP-NUPTK/email/HP yang sudah terdata = data DIPERBARUI, bukan dibuat dobel' },
    ]);
    guide['!cols'] = [{ wch: 16 }, { wch: 8 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, guide, 'Petunjuk');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="template-pegawai.xlsx"',
    });
    return new StreamableFile(buf);
  }

  /**
   * Import pegawai dari Excel/CSV — anti-redundan: NIP/email/HP yang sudah
   * ada di-update, bukan dibuat ulang. Kolom: name, nip, type, email,
   * phone, department, is_dept_head.
   */
  @Post('employees/import')
  @RequirePermission(EM)
  @UseInterceptors(FileInterceptor('file'))
  async importEmployees(
    @CurrentUser() u: AuthUser,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 5 * 1024 * 1024 })
        .build({ fileIsRequired: true }),
    )
    file: Express.Multer.File,
    @Query('dry') dry?: string,
    @Query('accounts') accounts?: string,
  ) {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      throw new BadRequestException('Hanya file Excel (.xlsx/.xls) atau CSV');
    }
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('File tidak dapat dibaca');
    }
    const rows: Parameters<AcademicService['importEmployees']>[0] = [];
    let foundHeader = false;
    // Lookup opsi GTK dari DB — kode/label opsi yang dikelola admin ikut
    // dikenali parser; regex bawaan tetap jadi cadangan ejaan bebas.
    const gtkOpts = await this.academic.listGtkOptions();
    const optLookup = new Map<string, string>();
    const norm = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '_');
    for (const o of gtkOpts) {
      optLookup.set(`${o.group}:${norm(o.code)}`, o.code);
      optLookup.set(`${o.group}:${norm(o.label)}`, o.code);
    }
    /**
     * Jenis → {type, staffKind?, additionalDuty?} — menerima istilah GTK baru
     * (GURU/TENDIK) maupun type lama (TU, KESISWAAN, KS, dst) dari template usang.
     */
    const normJenis = (v: string): {
      type: string;
      staffKind?: string;
      additionalDuty?: string;
    } => {
      const t = v.toUpperCase().replace(/\s+/g, '_');
      if (!t) return { type: 'TEACHER' };
      if (/^(GURU|TEACHER)/.test(t)) return { type: 'TEACHER' };
      if (/^(KS|KEPSEK|KEPALA_?SEKOLAH|PRINCIPAL)/.test(t))
        return { type: 'TENDIK', staffKind: 'KEPALA_SEKOLAH' };
      if (/^KURIKULUM/.test(t))
        return { type: 'TEACHER', additionalDuty: 'WAKASEK_KURIKULUM' };
      if (/^KESISWAAN/.test(t))
        return { type: 'TEACHER', additionalDuty: 'WAKASEK_KESISWAAN' };
      if (/^KEUANGAN|^BENDAHARA/.test(t))
        return { type: 'TENDIK', staffKind: 'TU', additionalDuty: 'BENDAHARA_BOS' };
      if (/^SARPRAS/.test(t)) return { type: 'TENDIK', staffKind: 'LAYSUS' };
      if (/^LAYSUS/.test(t)) return { type: 'TENDIK', staffKind: 'LAYSUS' };
      if (/^SATPAM|^KEAMANAN|^SECURITY/.test(t))
        return { type: 'TENDIK', staffKind: 'SATPAM' };
      if (/^(STAF|STAFF|TENDIK|TU|TATA_?USAHA)/.test(t))
        return { type: 'TENDIK', staffKind: 'TU' };
      return { type: 'TEACHER' };
    };
    const normKind = (v: string) => {
      const k = v.toUpperCase().replace(/\s+/g, '_');
      const fromDb = optLookup.get(`STAFF_KIND:${k}`);
      if (fromDb) return fromDb;
      if (/^(TU|TATA_?USAHA)/.test(k)) return 'TU';
      if (/^LAYSUS|^LAYANAN_?KHUSUS/.test(k)) return 'LAYSUS';
      if (/^SATPAM|^KEAMANAN|^SECURITY|^PENJAGA/.test(k)) return 'SATPAM';
      if (/^(KS|KEPSEK|KEPALA_?SEKOLAH|PRINCIPAL)/.test(k)) return 'KEPALA_SEKOLAH';
      return undefined;
    };
    const normDuty = (v: string) => {
      const d = v.toUpperCase().replace(/[\s-]+/g, '_');
      const fromDb = optLookup.get(`DUTY:${d}`);
      if (fromDb) return fromDb;
      if (/^WAKASEK_?KURIKULUM|^WAKIL_?KEPALA_?SEKOLAH_?KURIKULUM|^WAKA_?KUR/.test(d))
        return 'WAKASEK_KURIKULUM';
      if (/^WAKASEK_?KESISWAAN|^WAKA_?KES/.test(d)) return 'WAKASEK_KESISWAAN';
      if (/^WAKASEK_?SARPRAS|^WAKA_?SAR/.test(d)) return 'WAKASEK_SARPRAS';
      if (/^KEPALA_?(TU|TATA_?USAHA)|^KATU\b/.test(d)) return 'KEPALA_TU';
      if (/^BENDAHARA_?SEKOLAH/.test(d)) return 'BENDAHARA_SEKOLAH';
      if (/^BENDAHARA_?BOS/.test(d)) return 'BENDAHARA_BOS';
      if (/^BENDAHARA_?RMP/.test(d)) return 'BENDAHARA_RMP';
      if (/^BENDAHARA/.test(d)) return 'BENDAHARA_SEKOLAH';
      if (/^OPERATOR_?DAPODIK|^OPERATOR/.test(d)) return 'OPERATOR_DAPODIK';
      if (/^KONTEN_?KREATOR|^KONTEN|^ADMIN_?(MEDSOS|SOSMED)/.test(d))
        return 'KONTEN_KREATOR';
      if (/^KEPALA_?PERPUS(TAKAAN)?|^KEPALA_?PERPUSTAKAAN/.test(d))
        return 'KEPALA_PERPUSTAKAAN';
      if (/^(STAF|STAFF|PETUGAS|PENJAGA)_?PERPUS(TAKAAN)?|^PERPUS(TAKAAN)?/.test(d))
        return 'STAF_PERPUSTAKAAN';
      if (/^(PETUGAS_?)?KEBERSIHAN_?(LANTAI_?|LT_?\.?|LT)?_?1\b|KEBERSIHAN_?1/.test(d))
        return 'PETUGAS_KEBERSIHAN_L1';
      if (/^(PETUGAS_?)?KEBERSIHAN_?(LANTAI_?|LT_?\.?|LT)?_?2\b|KEBERSIHAN_?2/.test(d))
        return 'PETUGAS_KEBERSIHAN_L2';
      if (/^(PETUGAS_?)?KEBERSIHAN_?(LANTAI_?|LT_?\.?|LT)?_?3\b|KEBERSIHAN_?3/.test(d))
        return 'PETUGAS_KEBERSIHAN_L3';
      if (/^(PETUGAS_?)?KEBERSIHAN_?(LANTAI_?|LT_?\.?|LT)?_?4\b|KEBERSIHAN_?4/.test(d))
        return 'PETUGAS_KEBERSIHAN_L4';
      if (/^SATPAM|^KEAMANAN|^SECURITY|^PENJAGA_?(SEKOLAH|MALAM)?/.test(d))
        return 'SATPAM';
      return undefined;
    };
    const normDept = (v: string) => {
      const d = v.toUpperCase().replace(/\s+/g, '_');
      if (/^(TU|TATA_?USAHA)/.test(d)) return 'TATA_USAHA';
      if (/^(KESISWAAN|KURIKULUM|KEUANGAN|SARPRAS|LAYSUS)/.test(d)) return d;
      // Nilai tak dikenal (mis. "ya") → kosong, bidang diturunkan dari jenis.
      return undefined;
    };
    for (const sn of wb.SheetNames) {
      if (sn.toLowerCase() === 'petunjuk') continue;
      const sheet = wb.Sheets[sn];
      if (!sheet) continue;
      // Baca array-of-array lalu cari baris header (sel mengandung 'nama' & 'nip')
      // — mendukung template Indonesia baru maupun header Inggris lama.
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
      const hi = aoa.findIndex((r) => {
        const first = String(r[0] ?? '').toLowerCase();
        return /^(nama|name)/.test(first) && r.some((c) => /nip|nuptk/i.test(String(c)));
      });
      if (hi < 0) continue;
      foundHeader = true;
      const header = (aoa[hi] ?? []).map((c) => String(c).toLowerCase());
      const col = (...keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
      const ix = {
        name: col('nama', 'name'),
        nip: col('nip', 'nuptk'),
        type: col('jenis', 'type'),
        kind: header.findIndex(
          (h) => h.includes('jabatan') && !h.includes('tambahan'),
        ),
        duty: header.findIndex(
          (h) => h.includes('tugas') || h.includes('tambahan'),
        ),
        phone: col('telepon', 'telp', 'hp', 'phone'),
        email: col('email'),
        password: col('password', 'sandi', 'kata_sandi'),
        department: header.findIndex(
          (h) =>
            (h.includes('bidang') ||
              h.includes('department') ||
              h.includes('departemen')) &&
            !h.includes('kepala'),
        ),
        deptHead: col('kepala', 'is_dept_head', 'dept_head'),
      };
      for (const r of aoa.slice(hi + 1)) {
        const cell = (i: number) => (i >= 0 ? String(r[i] ?? '').trim() : '');
        const name = cell(ix.name);
        if (!name || /^contoh/i.test(name)) continue; // abaikan baris contoh template
        const jenis = normJenis(cell(ix.type));
        rows.push({
          name,
          nip: cell(ix.nip) || undefined,
          type: jenis.type,
          staffKind: normKind(cell(ix.kind)) ?? jenis.staffKind,
          additionalDuty: normDuty(cell(ix.duty)) ?? jenis.additionalDuty,
          email: cell(ix.email) || undefined,
          phone: cell(ix.phone) || undefined,
          password: cell(ix.password) || undefined,
          department: normDept(cell(ix.department)),
          isDeptHead: ['1', 'true', 'ya', 'yes', 'y'].includes(cell(ix.deptHead).toLowerCase()) || undefined,
        });
      }
    }
    if (!rows.length) {
      throw new BadRequestException(
        foundHeader
          ? 'File hanya berisi header/baris contoh — isi data pegawai mulai BARIS 8 lalu import ulang.'
          : 'Baris header tidak ditemukan — unduh template lewat tombol "Unduh Template" lalu isi datanya.',
      );
    }
    return this.academic.importEmployees(rows, u.id, {
      dryRun: dry === '1' || dry === 'true',
      createAccounts: accounts === '1' || accounts === 'true',
    });
  }

  /** Akun login non-orang-tua tanpa data pegawai — audit data yatim. */
  @Get('employees/orphan-accounts')
  @RequirePermission(ER)
  orphanAccounts() {
    return this.academic.orphanAccounts();
  }

  /** Opsi jabatan tendik & tugas tambahan yang dikelola admin. */
  @Get('employees/gtk-options')
  @RequirePermission(ER)
  gtkOptions(@Query('group') group?: string) {
    return this.academic.listGtkOptions(group);
  }

  @Post('employees/gtk-options')
  @RequirePermission(EM)
  createGtkOption(@CurrentUser() u: AuthUser, @Body() dto: GtkOptionDto) {
    return this.academic.createGtkOption(dto, u.id);
  }

  @Patch('employees/gtk-options/:id')
  @RequirePermission(EM)
  updateGtkOption(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGtkOptionDto,
  ) {
    return this.academic.updateGtkOption(id, dto, u.id);
  }

  @Delete('employees/gtk-options/:id')
  @RequirePermission(EM)
  deleteGtkOption(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.academic.deleteGtkOption(id, u.id);
  }

  /**
   * Hapus pegawai — yang sudah punya relasi (penugasan/absensi/payroll)
   * dinonaktifkan; yang bersih dihapus beserta akun loginnya.
   */
  @Delete('employees/:id')
  @RequirePermission(EM)
  deleteEmployee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.academic.deleteEmployee(id, u.id);
  }

  /** Profil lengkap pegawai — data + penugasan mengajar (detail guru). */
  @Get('employees/:id')
  @RequirePermission(ER)
  employeeDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.employeeDetail(id);
  }

  // ---------- Kalender akademik ----------

  /** Kalender sebulan — siapa mengajar per tanggal + event libur/kegiatan. Terbuka untuk semua bidang yang login. */
  @Get('academic-calendar')
  academicCalendar(@Query('month') month: string) {
    if (!month) throw new BadRequestException('Parameter month wajib (YYYY-MM).');
    return this.academic.academicCalendar(month);
  }

  @Get('academic-calendar/events')
  calendarEvents(@Query('from') from?: string, @Query('to') to?: string) {
    return this.academic.listCalendarEvents(from || undefined, to || undefined);
  }

  @Post('academic-calendar/events')
  @RequirePermission(EM)
  createCalendarEvent(@Body() dto: CalendarEventDto, @CurrentUser() u: AuthUser) {
    return this.academic.createCalendarEvent(dto, u.id);
  }

  @Patch('academic-calendar/events/:id')
  @RequirePermission(EM)
  updateCalendarEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalendarEventDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.academic.updateCalendarEvent(id, dto, u.id);
  }

  @Delete('academic-calendar/events/:id')
  @RequirePermission(EM)
  deleteCalendarEvent(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.academic.deleteCalendarEvent(id, u.id);
  }

  // ---------- Curriculum & subjects ----------
  @Get('curricula')
  @RequirePermission(R)
  curricula() {
    return this.academic.listCurricula();
  }

  @Post('curricula')
  @RequirePermission(M)
  createCurriculum(@CurrentUser() u: AuthUser, @Body() dto: CurriculumDto) {
    return this.academic.createCurriculum(dto, u.id);
  }

  @Patch('curricula/:id')
  @RequirePermission(M)
  updateCurriculum(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurriculumDto,
  ) {
    return this.academic.updateCurriculum(id, dto, u.id);
  }

  @Delete('curricula/:id')
  @RequirePermission(M)
  removeCurriculum(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.removeCurriculum(id, u.id);
  }

  @Get('subjects')
  @RequirePermission(R)
  subjects(@Query('curriculumId') curriculumId?: string) {
    return this.academic.listSubjects(curriculumId);
  }

  @Post('subjects')
  @RequirePermission(M)
  createSubject(@CurrentUser() u: AuthUser, @Body() dto: SubjectDto) {
    return this.academic.createSubject(dto, u.id);
  }

  @Patch('subjects/:id')
  @RequirePermission(M)
  updateSubject(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
  ) {
    return this.academic.updateSubject(id, dto, u.id);
  }

  @Delete('subjects/:id')
  @RequirePermission(M)
  removeSubject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.removeSubject(id, u.id);
  }

  @Get('semesters')
  @RequirePermission(R)
  semesters(@Query('academicYearId') academicYearId?: string) {
    return this.academic.listSemesters(academicYearId);
  }

  @Post('semesters')
  @RequirePermission(M)
  createSemester(@CurrentUser() u: AuthUser, @Body() dto: SemesterDto) {
    return this.academic.createSemester(dto, u.id);
  }

  @Patch('semesters/:id')
  @RequirePermission(M)
  updateSemester(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSemesterDto,
  ) {
    return this.academic.updateSemester(id, dto, u.id);
  }

  @Delete('semesters/:id')
  @RequirePermission(M)
  removeSemester(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.removeSemester(id, u.id);
  }

  // ---------- Classes & enrollment ----------
  @Get('classes')
  @RequirePermission(R)
  classes(@Query('academicYearId') academicYearId?: string) {
    return this.academic.listClasses(academicYearId);
  }

  @Post('classes')
  @RequirePermission(M)
  createClass(@CurrentUser() u: AuthUser, @Body() dto: ClassDto) {
    return this.academic.createClass(dto, u.id);
  }

  @Patch('classes/:id')
  @RequirePermission(M)
  updateClass(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.academic.updateClass(id, dto, u.id);
  }

  @Get('classes/:id/students')
  @RequirePermission(R)
  classStudents(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.listEnrollments(id);
  }

  @Post('enrollments')
  @RequirePermission(M)
  enroll(@CurrentUser() u: AuthUser, @Body() dto: EnrollmentDto) {
    return this.academic.enroll(dto, u.id);
  }

  // ---------- Assignments & schedules ----------
  @Get('assignments')
  @RequirePermission(R)
  assignments(@Query('academicYearId') academicYearId?: string) {
    return this.academic.listAssignments(academicYearId);
  }

  @Post('assignments')
  @RequirePermission(M)
  createAssignment(
    @CurrentUser() u: AuthUser,
    @Body() dto: TeachingAssignmentDto,
  ) {
    return this.academic.createAssignment(dto, u.id);
  }

  @Post('schedules')
  @RequirePermission(M)
  createSchedule(@CurrentUser() u: AuthUser, @Body() dto: ScheduleEntryDto) {
    return this.academic.createScheduleEntry(dto, u.id);
  }

  @Get('schedules')
  @RequirePermission(R)
  schedules(
    @Query('classId') classId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.academic.listSchedules(classId, academicYearId);
  }

  @Delete('schedules/:id')
  @RequirePermission(M)
  deleteSchedule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.academic.deleteScheduleEntry(id, u.id);
  }

  // ---------- Assessments & grades ----------
  @Get('assessments')
  @RequirePermission(R)
  assessments(
    @Query('academicYearId') academicYearId?: string,
    @Query('classId') classId?: string,
  ) {
    return this.academic.listAssessments(academicYearId, classId);
  }

  @Post('assessments')
  @RequirePermission(M)
  createAssessment(@CurrentUser() u: AuthUser, @Body() dto: AssessmentDto) {
    return this.academic.createAssessment(dto, u.id);
  }

  @Post('assessments/:id/grades')
  @RequirePermission(M)
  setGrades(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GradesBody,
  ) {
    return this.academic.setGrades(id, body.grades, u.id);
  }

  @Get('assessments/:id/grades')
  @RequirePermission(R)
  listGrades(@Param('id', ParseUUIDPipe) id: string) {
    return this.academic.listGrades(id);
  }
}
