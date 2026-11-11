import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { normalizePhone } from '../identity/users/users.service';
import type {
  AssessmentDto,
  CalendarEventDto,
  ClassDto,
  CurriculumDto,
  EmployeeDto,
  EnrollmentDto,
  GradeDto,
  ScheduleEntryDto,
  SemesterDto,
  SubjectDto,
  TeachingAssignmentDto,
  UpdateClassDto,
  UpdateCurriculumDto,
  UpdateSemesterDto,
  UpdateSubjectDto,
} from './dto/academic.dto';

/** Peta resolusi GTK — bawaan + override dari tabel gtk_options (admin). */
interface GtkMaps {
  dutyToDept: Record<string, string>;
  kindToDept: Record<string, string | null>;
  headDuties: Set<string>;
  dutyRole: Record<string, string>;
  kindRole: Record<string, string>;
}

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Employees ----------

  /** Bidang diturunkan dari jenis pegawai — satu sumber, tak ada kolom ganda. */
  private static readonly DEPT_OF_TYPE: Record<string, string | null> = {
    TEACHER: null,
    TENDIK: 'TATA_USAHA',
    STAFF: 'TATA_USAHA',
    TU: 'TATA_USAHA',
    KESISWAAN: 'KESISWAAN',
    KURIKULUM: 'KURIKULUM',
    KEUANGAN: 'KEUANGAN',
    SARPRAS: 'SARPRAS',
    LAYSUS: 'LAYSUS',
    PRINCIPAL: null,
  };

  /** Tugas tambahan → bidang (GTK model Dapodik). */
  private static readonly DUTY_TO_DEPT: Record<string, string> = {
    WAKASEK_KURIKULUM: 'KURIKULUM',
    WAKASEK_KESISWAAN: 'KESISWAAN',
    WAKASEK_SARPRAS: 'SARPRAS',
    KEPALA_TU: 'TATA_USAHA',
    BENDAHARA_SEKOLAH: 'KEUANGAN',
    BENDAHARA_BOS: 'KEUANGAN',
    BENDAHARA_RMP: 'KEUANGAN',
    OPERATOR_DAPODIK: 'TATA_USAHA',
    KONTEN_KREATOR: 'TATA_USAHA',
    KEPALA_PERPUSTAKAAN: 'TATA_USAHA',
    STAF_PERPUSTAKAAN: 'TATA_USAHA',
    PETUGAS_KEBERSIHAN_L1: 'LAYSUS',
    PETUGAS_KEBERSIHAN_L2: 'LAYSUS',
    PETUGAS_KEBERSIHAN_L3: 'LAYSUS',
    PETUGAS_KEBERSIHAN_L4: 'LAYSUS',
    SATPAM: 'LAYSUS',
  };

  /** Tugas tambahan yang menjadikan pemegangnya kepala bidang. */
  private static readonly HEAD_DUTIES = new Set([
    'WAKASEK_KURIKULUM',
    'WAKASEK_KESISWAAN',
    'WAKASEK_SARPRAS',
    'KEPALA_TU',
  ]);

  /** Jabatan pokok tendik → bidang. */
  private static readonly KIND_TO_DEPT: Record<string, string | null> = {
    TU: 'TATA_USAHA',
    LAYSUS: 'LAYSUS',
    SATPAM: 'LAYSUS',
    KEPALA_SEKOLAH: null,
  };

  /** Jabatan efektif untuk baris type lama (tanpa staffKind tersimpan). */
  private static readonly KIND_OF_LEGACY: Record<string, string | null> = {
    TU: 'TU',
    STAFF: 'TU',
    KEUANGAN: 'TU',
    SARPRAS: 'LAYSUS',
    LAYSUS: 'LAYSUS',
    PRINCIPAL: 'KEPALA_SEKOLAH',
  };

  /** Jabatan tendik efektif — tersimpan dulu, lalu turunan dari type lama. */
  static effectiveKind(e: { type: string; staffKind?: string | null }) {
    return e.staffKind ?? AcademicService.KIND_OF_LEGACY[e.type] ?? null;
  }

  private static readonly VALID_DEPTS = new Set([
    'TATA_USAHA',
    'KESISWAAN',
    'KURIKULUM',
    'KEUANGAN',
    'SARPRAS',
    'LAYSUS',
  ]);

  /** Kelompok GTK — type lama dipetakan ke Guru/Tendik untuk filter tab. */
  private static readonly GTK_GROUP: Record<string, string> = {
    TEACHER: 'TEACHER',
    KURIKULUM: 'TEACHER',
    KESISWAAN: 'TEACHER',
    TENDIK: 'TENDIK',
    TU: 'TENDIK',
    STAFF: 'TENDIK',
    KEUANGAN: 'TENDIK',
    SARPRAS: 'TENDIK',
    LAYSUS: 'TENDIK',
    PRINCIPAL: 'TENDIK',
  };

  /** Ambil opsi GTK dari DB lalu gabung dengan bawaan — DB menang. */
  private async gtkMaps(): Promise<GtkMaps> {
    const maps: GtkMaps = {
      dutyToDept: { ...AcademicService.DUTY_TO_DEPT },
      kindToDept: { ...AcademicService.KIND_TO_DEPT },
      headDuties: new Set(AcademicService.HEAD_DUTIES),
      dutyRole: {},
      kindRole: {},
    };
    const opts = await this.prisma.gtkOption.findMany();
    for (const o of opts) {
      if (o.group === 'DUTY') {
        if (o.department) maps.dutyToDept[o.code] = o.department;
        if (o.isHead) maps.headDuties.add(o.code);
        else maps.headDuties.delete(o.code);
        if (o.roleKey) maps.dutyRole[o.code] = o.roleKey;
      } else if (o.group === 'STAFF_KIND') {
        maps.kindToDept[o.code] = o.department;
        if (o.roleKey) maps.kindRole[o.code] = o.roleKey;
      }
    }
    return maps;
  }

  /**
   * Bidang efektif — urutan: tugas tambahan (wakasek/kepala TU/bendahara…)
   * → nilai tersimpan yang valid → jabatan tendik → jenis.
   */
  static effectiveDept(
    e: {
      type: string;
      department: string | null;
      staffKind?: string | null;
      additionalDuty?: string | null;
    },
    maps?: GtkMaps,
  ) {
    const dutyMap = maps?.dutyToDept ?? AcademicService.DUTY_TO_DEPT;
    const kindMap = maps?.kindToDept ?? AcademicService.KIND_TO_DEPT;
    if (e.additionalDuty && dutyMap[e.additionalDuty]) {
      return dutyMap[e.additionalDuty];
    }
    if (e.department && AcademicService.VALID_DEPTS.has(e.department)) {
      return e.department;
    }
    if (e.staffKind && e.staffKind in kindMap) {
      return kindMap[e.staffKind] ?? null;
    }
    return AcademicService.DEPT_OF_TYPE[e.type] ?? null;
  }

  /** Kepala bidang efektif — flag tersimpan atau tugas tambahan kepala. */
  static effectiveHead(
    e: { isDeptHead?: boolean; additionalDuty?: string | null },
    maps?: GtkMaps,
  ) {
    const heads = maps?.headDuties ?? AcademicService.HEAD_DUTIES;
    return !!e.isDeptHead || heads.has(e.additionalDuty ?? '');
  }

  /** Role akun login dari GTK — tugas tambahan dulu, lalu jabatan, lalu bidang/jenis. */
  static roleForGtk(
    e: {
      type?: string | null;
      staffKind?: string | null;
      additionalDuty?: string | null;
      department?: string | null;
    },
    maps?: GtkMaps,
  ): string {
    const dutyRole = e.additionalDuty ? maps?.dutyRole[e.additionalDuty] : undefined;
    if (dutyRole) return dutyRole;
    const kindRole = e.staffKind ? maps?.kindRole[e.staffKind] : undefined;
    if (kindRole) return kindRole;
    switch (e.additionalDuty) {
      case 'WAKASEK_KURIKULUM':
        return 'staff_kurikulum';
      case 'WAKASEK_KESISWAAN':
        return 'staff_kesiswaan';
      case 'WAKASEK_SARPRAS':
        return 'staff_tu';
      case 'KEPALA_TU':
        return 'kepala_tu';
      case 'BENDAHARA_SEKOLAH':
      case 'BENDAHARA_BOS':
      case 'BENDAHARA_RMP':
        return 'bendahara';
      case 'OPERATOR_DAPODIK':
      case 'KONTEN_KREATOR':
      case 'KEPALA_PERPUSTAKAAN':
      case 'STAF_PERPUSTAKAAN':
        return 'staff_tu';
      case 'SATPAM':
      case 'PETUGAS_KEBERSIHAN_L1':
      case 'PETUGAS_KEBERSIHAN_L2':
      case 'PETUGAS_KEBERSIHAN_L3':
      case 'PETUGAS_KEBERSIHAN_L4':
        return 'staff_laysus';
    }
    switch (e.staffKind) {
      case 'KEPALA_SEKOLAH':
        return 'kepala_sekolah';
      case 'TU':
        return 'staff_tu';
      case 'LAYSUS':
      case 'SATPAM':
        return 'staff_laysus';
    }
    switch (e.department) {
      case 'KURIKULUM':
        return 'staff_kurikulum';
      case 'KESISWAAN':
        return 'staff_kesiswaan';
      case 'KEUANGAN':
        return 'bendahara';
      case 'TATA_USAHA':
      case 'SARPRAS':
        return 'staff_tu';
      case 'LAYSUS':
        return 'staff_laysus';
    }
    // Type lama non-GTK → role bidangnya; guru → guru_mapel.
    const legacy = AcademicService.GTK_GROUP[e.type ?? ''] ?? e.type;
    return legacy === 'TEACHER' ? 'guru_mapel' : 'staff_tu';
  }

  async listEmployees(
    type?: string,
    search?: string,
    department?: string,
    kind?: string,
    duty?: string,
  ) {
    const where: Prisma.EmployeeWhereInput = {};
    if (type === 'TEACHER' || type === 'TENDIK') {
      // Filter GTK — Guru = daftar eksplisit; Tendik = SISANYA (notIn) supaya
      // type baru/tak dikenal tak pernah hilang dari tabel.
      const teachers = Object.keys(AcademicService.GTK_GROUP).filter(
        (t) => AcademicService.GTK_GROUP[t] === 'TEACHER',
      );
      where.type = (
        type === 'TEACHER' ? { in: teachers } : { notIn: teachers }
      ) as Prisma.EnumEmployeeTypeFilter<'Employee'>;
    } else if (type) {
      where.type = type as import('@prisma/client').EmployeeType;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nip: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [rows, maps] = await Promise.all([
      this.prisma.employee.findMany({ where, orderBy: { name: 'asc' } }),
      this.gtkMaps(),
    ]);
    return rows
      .map((e) => ({
        ...e,
        staffKind: AcademicService.effectiveKind(e),
        department: AcademicService.effectiveDept(e, maps),
        isDeptHead: AcademicService.effectiveHead(e, maps),
      }))
      .filter(
        (e) =>
          (!department || e.department === department) &&
          (!kind || e.staffKind === kind) &&
          (!duty || e.additionalDuty === duty),
      );
  }

  /** Akun login non-orang-tua yang tidak tertaut ke data pegawai — deteksi data yatim. */
  async orphanAccounts() {
    const users = await this.prisma.user.findMany({
      where: {
        roles: { none: { role: { key: 'spmb_parent' } } },
        employee: null,
      },
      select: {
        id: true, name: true, email: true, phone: true,
        roles: { select: { role: { select: { key: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    // Akun murni superadmin bukan "yatim" — admin memang tak punya data pegawai.
    return users
      .filter((u) => u.roles.some((r) => r.role.key !== 'superadmin'))
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        roles: u.roles.map((r) => r.role.name ?? r.role.key),
      }));
  }

  // ---------- Opsi GTK yang dikelola admin (jabatan tendik & tugas tambahan) ----------

  listGtkOptions(group?: string) {
    return this.prisma.gtkOption.findMany({
      where: group ? { group } : {},
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async createGtkOption(
    dto: {
      group: string;
      code: string;
      label: string;
      department?: string | undefined;
      isHead?: boolean | undefined;
      roleKey?: string | undefined;
      sortOrder?: number | undefined;
    },
    actorId: string,
  ) {
    const group = dto.group.toUpperCase();
    if (!['STAFF_KIND', 'DUTY'].includes(group)) {
      throw new BadRequestException("Group harus 'STAFF_KIND' atau 'DUTY'.");
    }
    const code = dto.code.toUpperCase().replace(/[\s-]+/g, '_');
    const clash = await this.prisma.gtkOption.findUnique({
      where: { group_code: { group, code } },
    });
    if (clash) throw new ConflictException(`Kode ${code} sudah ada pada group ini.`);
    const row = await this.prisma.gtkOption.create({
      data: {
        group,
        code,
        label: dto.label.trim(),
        department: dto.department || null,
        isHead: dto.isHead ?? false,
        roleKey: dto.roleKey || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    await this.audit.log({ actorId, action: 'gtk_option.create', entity: 'gtk_option', entityId: row.id });
    return row;
  }

  async updateGtkOption(
    id: string,
    dto: {
      label?: string | undefined;
      department?: string | null | undefined;
      isHead?: boolean | undefined;
      roleKey?: string | null | undefined;
      sortOrder?: number | undefined;
      isActive?: boolean | undefined;
    },
    actorId: string,
  ) {
    await this.prisma.gtkOption.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.gtkOption.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.department !== undefined ? { department: dto.department || null } : {}),
        ...(dto.isHead !== undefined ? { isHead: dto.isHead } : {}),
        ...(dto.roleKey !== undefined ? { roleKey: dto.roleKey || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'gtk_option.update', entity: 'gtk_option', entityId: id });
    return row;
  }

  async deleteGtkOption(id: string, actorId: string) {
    await this.prisma.gtkOption.findUniqueOrThrow({ where: { id } });
    await this.prisma.gtkOption.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'gtk_option.delete', entity: 'gtk_option', entityId: id });
    return { deleted: true };
  }

  /** Anggota bidang dari pegawai yang login — untuk kepala bidang. */
  async myDepartment(userId: string) {
    const me = await this.prisma.employee.findUnique({ where: { userId } });
    if (!me) throw new NotFoundException('Akun ini belum tertaut ke data pegawai.');
    const maps = await this.gtkMaps();
    const dept = AcademicService.effectiveDept(me, maps);
    if (!dept) {
      return { department: null, isHead: AcademicService.effectiveHead(me, maps), members: [] };
    }
    const members = (
      await this.prisma.employee.findMany({
        where: { isActive: true },
        orderBy: [{ isDeptHead: 'desc' }, { name: 'asc' }],
      })
    ).filter((e) => AcademicService.effectiveDept(e, maps) === dept);
    return { department: dept, isHead: AcademicService.effectiveHead(me, maps), members };
  }

  async createEmployee(dto: EmployeeDto, actorId: string) {
    if (dto.nip) {
      const clash = await this.prisma.employee.findUnique({
        where: { nip: dto.nip },
      });
      if (clash) throw new ConflictException(`NIP ${dto.nip} sudah terdaftar`);
    }

    // Kaitkan ke akun login yang sudah ada (akun yatim) — tanpa membuat akun baru.
    let userId: string | null = null;
    if (dto.linkUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.linkUserId },
        select: { id: true, name: true, employee: { select: { id: true } } },
      });
      if (!user) throw new BadRequestException('Akun yang dikaitkan tidak ditemukan.');
      if (user.employee) {
        throw new ConflictException(`Akun ${user.name} sudah tertaut ke pegawai lain.`);
      }
      userId = user.id;
    } else if (dto.password || dto.roleKey) {
      if (!dto.password || !dto.roleKey) {
        throw new BadRequestException(
          'Password dan role wajib diisi untuk membuat akun pegawai.',
        );
      }
      if (!dto.email && !dto.phone) {
        throw new BadRequestException(
          'Email atau telepon pegawai wajib diisi untuk membuat akun.',
        );
      }
      const role = await this.prisma.role.findUnique({
        where: { key: dto.roleKey },
      });
      if (!role) throw new BadRequestException(`Role ${dto.roleKey} tidak ada.`);
      if (role.key === 'spmb_parent') {
        throw new BadRequestException('Role orang tua tidak untuk pegawai.');
      }
      // Cegah konflik login — email/no HP harus unik antar akun.
      await this.assertLoginFree(dto.email, dto.phone);
      const passwordHash = await argon2.hash(dto.password);
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email?.toLowerCase() ?? null,
          phone: dto.phone ? normalizePhone(dto.phone) : null,
          passwordHash,
          roles: { create: { roleId: role.id } },
        },
      });
      userId = user.id;
    }

    const type = dto.type ?? 'TEACHER';
    const staffKind = dto.staffKind || null;
    const additionalDuty = dto.additionalDuty || null;
    const maps = await this.gtkMaps();
    const emp = await this.prisma.employee.create({
      data: {
        name: dto.name.trim(),
        nip: dto.nip ?? null,
        type,
        staffKind,
        additionalDuty,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        department:
          maps.dutyToDept[additionalDuty ?? ''] ??
          dto.department ??
          maps.kindToDept[staffKind ?? ''] ??
          AcademicService.DEPT_OF_TYPE[type] ??
          null,
        isDeptHead:
          dto.isDeptHead ??
          maps.headDuties.has(additionalDuty ?? ''),
        isActive: dto.isActive ?? true,
        userId,
      },
    });
    await this.audit.log({ actorId, action: 'employee.create', entity: 'employee', entityId: emp.id });
    return emp;
  }

  async updateEmployee(id: string, dto: EmployeeDto, actorId: string) {
    const existing = await this.prisma.employee.findUniqueOrThrow({
      where: { id },
    });
    if (dto.nip && dto.nip !== existing.nip) {
      const clash = await this.prisma.employee.findUnique({
        where: { nip: dto.nip },
      });
      if (clash) throw new ConflictException(`NIP ${dto.nip} sudah dipakai ${clash.name}.`);
    }
    // Email/HP pegawai yang punya akun ikut disalin ke akun login —
    // cek dulu agar tak bentrok dengan akun lain.
    if (existing.userId) {
      await this.assertLoginFree(dto.email, dto.phone, existing.userId);
    }
    const type = dto.type ?? existing.type;
    const staffKind =
      dto.staffKind !== undefined ? dto.staffKind || null : existing.staffKind;
    const additionalDuty =
      dto.additionalDuty !== undefined
        ? dto.additionalDuty || null
        : existing.additionalDuty;
    const maps = await this.gtkMaps();
    const emp = await this.prisma.employee.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        nip: dto.nip ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        type,
        staffKind,
        additionalDuty,
        // Bidang mengikuti tugas tambahan/jabatan/jenis — kecuali admin
        // mengisi bidang secara eksplisit.
        department:
          maps.dutyToDept[additionalDuty ?? ''] ??
          (dto.department !== undefined
            ? dto.department || null
            : maps.kindToDept[staffKind ?? ''] ??
              AcademicService.DEPT_OF_TYPE[type] ??
              null),
        isDeptHead:
          dto.isDeptHead ??
          maps.headDuties.has(additionalDuty ?? ''),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    if (existing.userId) {
      await this.prisma.user.update({
        where: { id: existing.userId },
        data: {
          name: emp.name,
          email: emp.email?.toLowerCase() ?? null,
          phone: emp.phone ? normalizePhone(emp.phone) : null,
        },
      });
    }
    await this.audit.log({ actorId, action: 'employee.update', entity: 'employee', entityId: id });
    return emp;
  }

  /** Pastikan email/HP belum dipakai akun lain (kecuali akun `excludeUserId`). */
  private async assertLoginFree(
    email: string | undefined | null,
    phone: string | undefined | null,
    excludeUserId?: string,
  ) {
    const checks: { field: string; value: string; where: Prisma.UserWhereInput }[] = [];
    if (email) checks.push({ field: 'Email', value: email, where: { email: email.toLowerCase() } });
    if (phone) checks.push({ field: 'No HP', value: phone, where: { phone: normalizePhone(phone) } });
    for (const c of checks) {
      const clash = await this.prisma.user.findFirst({
        where: { ...c.where, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
        select: { name: true },
      });
      if (clash) {
        throw new ConflictException(
          `${c.field} ${c.value} sudah dipakai akun "${clash.name}" — satu identitas tidak boleh dobel akun. Kosongkan atau pakai kontak lain.`,
        );
      }
    }
  }

  /**
   * Import pegawai dari baris Excel/CSV — anti-redundan:
   * cocokkan NIP → email → HP; yang cocok di-update, sisanya dibuat baru.
   */
  async importEmployees(
    rows: {
      name: string;
      nip?: string | undefined;
      type?: string | undefined;
      staffKind?: string | undefined;
      additionalDuty?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
      department?: string | undefined;
      isDeptHead?: boolean | undefined;
      password?: string | undefined;
    }[],
    actorId: string,
    opts: { dryRun?: boolean; createAccounts?: boolean } = {},
  ) {
    let created = 0;
    let updated = 0;
    const errors: { row: number; name: string; error: string }[] = [];
    const preview: {
      row: number; name: string; nip: string | null; email: string | null;
      phone: string | null; department: string | null;
      type?: string | null; staffKind?: string | null; additionalDuty?: string | null;
      action: 'BARU' | 'UPDATE' | 'LEWATI'; error?: string;
    }[] = [];
    const accounts: { name: string; login: string; password: string }[] = [];
    const seenNip = new Set<string>();
    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();
    const maps = await this.gtkMaps();

    for (const [i, raw] of rows.entries()) {
      const row = i + 2; // baris Excel (header = 1)
      const name = raw.name?.trim();
      if (!name) {
        errors.push({ row, name: raw.name ?? '', error: 'Nama kosong' });
        preview.push({ row, name: raw.name ?? '', nip: null, email: null, phone: null, department: null, action: 'LEWATI', error: 'Nama kosong' });
        continue;
      }
      const nip = raw.nip?.trim() || null;
      const email = raw.email?.trim().toLowerCase() || null;
      const phone = raw.phone ? normalizePhone(raw.phone) : null;
      // Bidang efektif — ditampilkan di pratinjau sama seperti yang disimpan.
      const dept =
        maps.dutyToDept[raw.additionalDuty ?? ''] ??
        raw.department ??
        maps.kindToDept[raw.staffKind ?? ''] ??
        AcademicService.DEPT_OF_TYPE[raw.type ?? 'TEACHER'] ??
        null;
      // Duplikat di dalam file import sendiri.
      const dup =
        (nip && seenNip.has(nip) && `NIP/NUPTK ${nip} dobel di file ini`) ||
        (email && seenEmail.has(email) && `Email ${email} dobel di file ini`) ||
        (phone && seenPhone.has(phone) && `HP ${phone} dobel di file ini`) ||
        null;
      if (dup) {
        errors.push({ row, name, error: dup });
        preview.push({ row, name, nip, email, phone, department: dept, type: raw.type ?? null, staffKind: raw.staffKind ?? null, additionalDuty: raw.additionalDuty ?? null, action: 'LEWATI', error: dup });
        continue;
      }
      if (nip) seenNip.add(nip);
      if (email) seenEmail.add(email);
      if (phone) seenPhone.add(phone);

      // Cari pegawai yang sudah ada — NIP dulu, lalu email, lalu HP.
      let existing = nip
        ? await this.prisma.employee.findUnique({ where: { nip } })
        : null;
      if (!existing && email) {
        existing = await this.prisma.employee.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
      }
      if (!existing && phone) {
        existing = await this.prisma.employee.findFirst({ where: { phone } });
      }

      if (existing && nip && existing.nip && existing.nip !== nip) {
        const nipOwner = await this.prisma.employee.findUnique({ where: { nip } });
        if (nipOwner && nipOwner.id !== existing.id) {
          const msg = `NIP/NUPTK ${nip} sudah dipakai ${nipOwner.name}`;
          errors.push({ row, name, error: msg });
          preview.push({ row, name, nip, email, phone, department: dept, type: raw.type ?? null, staffKind: raw.staffKind ?? null, additionalDuty: raw.additionalDuty ?? null, action: 'LEWATI', error: msg });
          continue;
        }
      }

      // Akun login gagal dibuat bila email/HP sudah dipakai akun lain.
      let accountNote: string | undefined;
      if (!existing && opts.createAccounts && (email || phone)) {
        const clash = await this.prisma.user.findFirst({
          where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
          select: { name: true },
        });
        if (clash) accountNote = `akun dilewati (kontak dipakai ${clash.name})`;
      }

      preview.push({
        row, name, nip, email, phone, department: dept,
        type: raw.type ?? null, staffKind: raw.staffKind ?? null, additionalDuty: raw.additionalDuty ?? null,
        action: existing ? 'UPDATE' : 'BARU',
        ...(accountNote ? { error: accountNote } : {}),
      });
      if (opts.dryRun) continue;

      const data = {
        name,
        ...(nip ? { nip } : {}),
        email,
        phone,
        type: (raw.type ?? existing?.type ?? 'TEACHER') as import('@prisma/client').EmployeeType,
        staffKind: raw.staffKind ?? null,
        additionalDuty: raw.additionalDuty ?? null,
        department: dept,
        isDeptHead:
          raw.isDeptHead ??
          maps.headDuties.has(raw.additionalDuty ?? ''),
      };

      if (existing) {
        await this.prisma.employee.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        // Akun login sekaligus — role dari tugas/jabatan pegawai.
        // Password dari kolom `password` di Excel bila diisi; kosong → acak.
        let userId: string | null = null;
        if (opts.createAccounts && (email || phone) && !accountNote) {
          const roleKey = AcademicService.roleForGtk(
            {
              type: data.type,
              staffKind: data.staffKind,
              additionalDuty: data.additionalDuty,
              department: dept,
            },
            maps,
          );
          const role = await this.prisma.role.findUnique({
            where: { key: roleKey },
          });
          const custom = raw.password?.trim();
          const password = custom || `m3${Math.random().toString(36).slice(2, 8)}`;
          const user = await this.prisma.user.create({
            data: {
              name,
              email: email ?? null,
              phone,
              passwordHash: await argon2.hash(password),
              ...(role ? { roles: { create: { roleId: role.id } } } : {}),
            },
          });
          userId = user.id;
          accounts.push({ name, login: email ?? phone ?? '', password });
        }
        await this.prisma.employee.create({
          data: { ...data, userId },
        });
        created++;
      }
    }
    if (opts.dryRun) return { preview, total: rows.length };
    await this.audit.log({
      actorId,
      action: 'employee.import',
      entity: 'employee',
      entityId: 'bulk',
      metadata: { created, updated, errors: errors.length },
    });
    return { created, updated, skipped: errors.length, errors, accounts };
  }

  /**
   * Hapus pegawai — bila sudah punya relasi (penugasan/absensi/payroll)
   * pegawai dinonaktifkan saja; kalau bersih, hapus beserta akunnya.
   */
  async deleteEmployee(id: string, actorId: string) {
    const emp = await this.prisma.employee.findUniqueOrThrow({ where: { id } });
    const refs = await this.prisma.$transaction([
      this.prisma.teachingAssignment.count({ where: { employeeId: id } }),
      this.prisma.employeeAttendance.count({ where: { employeeId: id } }),
      this.prisma.employeeHonor.count({ where: { employeeId: id } }),
      this.prisma.payrollItem.count({ where: { employeeId: id } }),
      this.prisma.attendanceLog.count({ where: { employeeId: id } }),
    ]);
    const linked = refs.reduce((a, b) => a + b, 0);
    if (linked > 0) {
      await this.prisma.employee.update({ where: { id }, data: { isActive: false } });
      await this.audit.log({ actorId, action: 'employee.deactivate', entity: 'employee', entityId: id });
      return { deleted: false, deactivated: true, reason: `${linked} data terkait — dinonaktifkan` };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.employeeShift.deleteMany({ where: { employeeId: id } });
      await tx.staffDocument.deleteMany({ where: { employeeId: id } });
      await tx.docCollectionItem.deleteMany({ where: { employeeId: id } });
      await tx.employee.delete({ where: { id } });
      if (emp.userId) await tx.user.delete({ where: { id: emp.userId } });
    });
    await this.audit.log({ actorId, action: 'employee.delete', entity: 'employee', entityId: id });
    return { deleted: true };
  }

  /** Detail pegawai — profil + wali kelas + penugasan mengajar. */
  async employeeDetail(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        payScale: { select: { name: true, hourlyRate: true, transportRate: true } },
        homeroomFor: {
          select: { id: true, name: true, academicYear: { select: { name: true } } },
        },
        assignments: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, name: true, gradeLevel: true } },
            academicYear: { select: { id: true, name: true, isActive: true } },
            schedules: { orderBy: [{ day: 'asc' }, { startMinute: 'asc' }] },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan.');
    const maps = await this.gtkMaps();
    return {
      ...emp,
      staffKind: AcademicService.effectiveKind(emp),
      department: AcademicService.effectiveDept(emp, maps),
      isDeptHead: AcademicService.effectiveHead(emp, maps),
    };
  }

  // ---------- Kalender akademik ----------

  /**
   * Kalender sebulan: per tanggal — siapa mengajar apa di kelas mana
   * (dari jadwal mingguan ScheduleEntry) + event (libur/kegiatan).
   * ScheduleEntry.day: 1=Senin … 6=Sabtu; tanggal dikembalikan ISO.
   */
  async academicCalendar(month: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) throw new BadRequestException('Format bulan tidak valid (YYYY-MM).');
    const year = Number(m[1]);
    const mon = Number(m[2]) - 1;
    const daysInMonth = new Date(year, mon + 1, 0).getDate();
    const [entries, events, activeYear] = await Promise.all([
      this.prisma.scheduleEntry.findMany({
        include: {
          assignment: {
            select: {
              employee: { select: { id: true, name: true } },
              subject: { select: { code: true, name: true } },
              class: { select: { id: true, name: true } },
              academicYear: { select: { id: true, isActive: true } },
            },
          },
        },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.academicCalendarEvent.findMany({
        where: {
          date: {
            gte: new Date(Date.UTC(year, mon, 1)),
            lt: new Date(Date.UTC(year, mon + 1, 1)),
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true },
      }),
    ]);
    // Jadwal hanya untuk TA aktif (bila ada) — hindari jadwal basi dari TA lama.
    const activeEntries = activeYear
      ? entries.filter((e) => e.assignment.academicYear.isActive)
      : entries;
    const days: {
      date: string;
      dayOfWeek: number;
      lessons: {
        employeeId: string;
        employeeName: string;
        subjectName: string;
        className: string;
        startMinute: number;
        endMinute: number;
        room: string | null;
      }[];
      events: { id: string; title: string; type: string; note: string | null }[];
      isHoliday: boolean;
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const jsDate = new Date(Date.UTC(year, mon, d));
      const dow = jsDate.getUTCDay(); // 0=Min…6=Sab — jadwal pakai 1..6
      const lessons = activeEntries
        .filter((e) => e.day === dow)
        .map((e) => ({
          employeeId: e.assignment.employee.id,
          employeeName: e.assignment.employee.name,
          subjectName: e.assignment.subject.name,
          className: e.assignment.class.name,
          startMinute: e.startMinute,
          endMinute: e.endMinute,
          room: e.room,
        }));
      const dayEvents = events
        .filter((ev) => ev.date.getUTCDate() === d)
        .map((ev) => ({ id: ev.id, title: ev.title, type: ev.type, note: ev.note }));
      days.push({
        date: `${m[1]}-${m[2]}-${String(d).padStart(2, '0')}`,
        dayOfWeek: dow,
        lessons,
        events: dayEvents,
        isHoliday:
          dow === 0 || dayEvents.some((ev) => ev.type === 'LIBUR'),
      });
    }
    return { month, days };
  }

  listCalendarEvents(from?: string, to?: string) {
    return this.prisma.academicCalendarEvent.findMany({
      where: {
        ...(from || to
          ? {
              date: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}),
              },
            }
          : {}),
      },
      include: { academicYear: { select: { name: true } } },
      orderBy: { date: 'asc' },
      take: 500,
    });
  }

  async createCalendarEvent(dto: CalendarEventDto, actorId: string) {
    const ev = await this.prisma.academicCalendarEvent.create({
      data: {
        date: new Date(`${dto.date}T00:00:00Z`),
        title: dto.title.trim(),
        type: dto.type,
        note: dto.note ?? null,
        academicYearId: dto.academicYearId ?? null,
      },
    });
    await this.audit.log({
      actorId,
      action: 'calendar.event.create',
      entity: 'academic_calendar_event',
      entityId: ev.id,
      metadata: { date: dto.date, title: ev.title, type: ev.type },
    });
    return ev;
  }

  async updateCalendarEvent(id: string, dto: Partial<CalendarEventDto>, actorId: string) {
    const existing = await this.prisma.academicCalendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Event tidak ditemukan.');
    const ev = await this.prisma.academicCalendarEvent.update({
      where: { id },
      data: {
        ...(dto.date !== undefined ? { date: new Date(`${dto.date}T00:00:00Z`) } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.academicYearId !== undefined
          ? { academicYearId: dto.academicYearId }
          : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'calendar.event.update',
      entity: 'academic_calendar_event',
      entityId: id,
    });
    return ev;
  }

  async deleteCalendarEvent(id: string, actorId: string) {
    const existing = await this.prisma.academicCalendarEvent.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Event tidak ditemukan.');
    await this.prisma.academicCalendarEvent.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'calendar.event.delete',
      entity: 'academic_calendar_event',
      entityId: id,
      metadata: { title: existing.title },
    });
    return { deleted: true };
  }

  // ---------- Curriculum & subjects ----------
  listCurricula() {
    return this.prisma.curriculum.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { subjects: true } } },
    });
  }

  async createCurriculum(dto: CurriculumDto, actorId: string) {
    const c = await this.prisma.curriculum.create({
      data: {
        name: dto.name.trim(),
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({ actorId, action: 'curriculum.create', entity: 'curriculum', entityId: c.id });
    return c;
  }

  async updateCurriculum(id: string, dto: UpdateCurriculumDto, actorId: string) {
    const existing = await this.prisma.curriculum.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Kurikulum tidak ditemukan.');
    if (dto.name !== undefined && dto.name.trim() !== existing.name) {
      const clash = await this.prisma.curriculum.findUnique({ where: { name: dto.name.trim() } });
      if (clash) throw new ConflictException(`Kurikulum "${dto.name}" sudah ada.`);
    }
    const c = await this.prisma.curriculum.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'curriculum.update', entity: 'curriculum', entityId: id });
    return c;
  }

  async removeCurriculum(id: string, actorId: string) {
    const existing = await this.prisma.curriculum.findUnique({
      where: { id },
      include: { _count: { select: { subjects: true } } },
    });
    if (!existing) throw new NotFoundException('Kurikulum tidak ditemukan.');
    if (existing._count.subjects > 0) {
      throw new ConflictException(
        `Kurikulum masih dipakai ${existing._count.subjects} mapel — lepas dulu mapelnya.`,
      );
    }
    await this.prisma.curriculum.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'curriculum.delete', entity: 'curriculum', entityId: id });
    return { ok: true };
  }

  listSubjects(curriculumId?: string) {
    return this.prisma.subject.findMany({
      where: curriculumId ? { curriculumId } : {},
      include: { curriculum: { select: { name: true } } },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
  }

  async createSubject(dto: SubjectDto, actorId: string) {
    const clash = await this.prisma.subject.findUnique({ where: { code: dto.code } });
    if (clash) throw new ConflictException(`Kode ${dto.code} sudah dipakai`);
    const s = await this.prisma.subject.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        curriculumId: dto.curriculumId ?? null,
        gradeLevel: dto.gradeLevel ?? null,
      },
    });
    await this.audit.log({ actorId, action: 'subject.create', entity: 'subject', entityId: s.id });
    return s;
  }

  async updateSubject(id: string, dto: UpdateSubjectDto, actorId: string) {
    const existing = await this.prisma.subject.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Mapel tidak ditemukan.');
    const code = dto.code !== undefined ? dto.code.trim().toUpperCase() : undefined;
    if (code !== undefined && code !== existing.code) {
      const clash = await this.prisma.subject.findUnique({ where: { code } });
      if (clash) throw new ConflictException(`Kode ${code} sudah dipakai`);
    }
    const s = await this.prisma.subject.update({
      where: { id },
      data: {
        ...(code !== undefined ? { code } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.curriculumId !== undefined ? { curriculumId: dto.curriculumId } : {}),
        ...(dto.gradeLevel !== undefined ? { gradeLevel: dto.gradeLevel } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'subject.update', entity: 'subject', entityId: id });
    return s;
  }

  async removeSubject(id: string, actorId: string) {
    const existing = await this.prisma.subject.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true, assessments: true } } },
    });
    if (!existing) throw new NotFoundException('Mapel tidak ditemukan.');
    const used = existing._count.assignments + existing._count.assessments;
    if (used > 0) {
      throw new ConflictException(
        `Mapel masih dipakai ${existing._count.assignments} penugasan & ${existing._count.assessments} penilaian — tidak bisa dihapus.`,
      );
    }
    await this.prisma.subject.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'subject.delete', entity: 'subject', entityId: id });
    return { ok: true };
  }

  listSemesters(academicYearId?: string) {
    return this.prisma.semester.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: { academicYear: { select: { name: true } } },
      orderBy: [{ academicYear: { name: 'desc' } }, { name: 'asc' }],
    });
  }

  async createSemester(dto: SemesterDto, actorId: string) {
    const s = await this.prisma.semester.create({
      data: {
        academicYearId: dto.academicYearId,
        name: dto.name.trim(),
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isActive: dto.isActive ?? false,
      },
    });
    await this.audit.log({ actorId, action: 'semester.create', entity: 'semester', entityId: s.id });
    return s;
  }

  async updateSemester(id: string, dto: UpdateSemesterDto, actorId: string) {
    const existing = await this.prisma.semester.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Semester tidak ditemukan');
    if (dto.isActive === true) {
      await this.prisma.semester.updateMany({
        where: { academicYearId: existing.academicYearId, id: { not: id } },
        data: { isActive: false },
      });
    }
    const s = await this.prisma.semester.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'semester.update', entity: 'semester', entityId: id });
    return s;
  }

  async removeSemester(id: string, actorId: string) {
    const existing = await this.prisma.semester.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Semester tidak ditemukan.');
    await this.prisma.semester.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'semester.delete', entity: 'semester', entityId: id });
    return { ok: true };
  }

  // ---------- Classes & enrollment ----------
  listClasses(academicYearId?: string) {
    return this.prisma.class.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        homeroom: { select: { name: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
  }

  async createClass(dto: ClassDto, actorId: string) {
    const clash = await this.prisma.class.findUnique({
      where: {
        name_academicYearId: {
          name: dto.name,
          academicYearId: dto.academicYearId,
        },
      },
    });
    if (clash) {
      throw new ConflictException(
        `Kelas ${dto.name} sudah ada untuk tahun ajaran ini`,
      );
    }
    const c = await this.prisma.class.create({
      data: {
        name: dto.name.trim(),
        gradeLevel: dto.gradeLevel,
        academicYearId: dto.academicYearId,
        homeroomId: dto.homeroomId ?? null,
        capacity: dto.capacity ?? 32,
      },
    });
    await this.audit.log({ actorId, action: 'class.create', entity: 'class', entityId: c.id });
    return c;
  }

  async updateClass(id: string, dto: UpdateClassDto, actorId: string) {
    const existing = await this.prisma.class.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rombel tidak ditemukan.');
    if (dto.name && dto.name !== existing.name) {
      const clash = await this.prisma.class.findUnique({
        where: {
          name_academicYearId: {
            name: dto.name,
            academicYearId: existing.academicYearId,
          },
        },
      });
      if (clash) throw new ConflictException(`Kelas ${dto.name} sudah ada.`);
    }
    const c = await this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.gradeLevel !== undefined ? { gradeLevel: dto.gradeLevel } : {}),
        ...(dto.homeroomId !== undefined ? { homeroomId: dto.homeroomId } : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'class.update', entity: 'class', entityId: id });
    return c;
  }

  async enroll(dto: EnrollmentDto, actorId: string) {
    const clash = await this.prisma.enrollment.findUnique({
      where: {
        studentId_academicYearId: {
          studentId: dto.studentId,
          academicYearId: dto.academicYearId,
        },
      },
    });
    if (clash) {
      throw new ConflictException(
        'Siswa sudah terdaftar di kelas lain tahun ajaran ini',
      );
    }
    const e = await this.prisma.enrollment.create({
      data: dto,
      include: { student: { select: { name: true } }, class: { select: { name: true } } },
    });
    await this.audit.log({ actorId, action: 'enrollment.create', entity: 'enrollment', entityId: e.id });
    return e;
  }

  listEnrollments(classId: string) {
    return this.prisma.enrollment.findMany({
      where: { classId },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
  }

  // ---------- Teaching assignments & schedules ----------
  createAssignment(dto: TeachingAssignmentDto, actorId: string) {
    return this.prisma.teachingAssignment
      .create({ data: dto })
      .then(async (a) => {
        await this.audit.log({ actorId, action: 'assignment.create', entity: 'teaching_assignment', entityId: a.id });
        return a;
      })
      .catch((e: { code?: string }) => {
        if (e.code === 'P2002') {
          throw new ConflictException('Penugasan serupa sudah ada');
        }
        throw e;
      });
  }

  listAssignments(academicYearId?: string) {
    return this.prisma.teachingAssignment.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        employee: { select: { id: true, name: true } },
        subject: { select: { code: true, name: true } },
        class: { select: { id: true, name: true } },
        schedules: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createScheduleEntry(dto: ScheduleEntryDto, _actorId: string) {
    if (dto.endMinute <= dto.startMinute) {
      throw new ConflictException('Jam selesai harus setelah jam mulai');
    }
    return this.prisma.scheduleEntry.create({ data: { ...dto, room: dto.room ?? null } });
  }

  /** Jadwal per rombel (via penugasan) — untuk tampilan grid mingguan. */
  listSchedules(classId?: string, academicYearId?: string) {
    return this.prisma.scheduleEntry.findMany({
      where: {
        assignment: {
          ...(classId ? { classId } : {}),
          ...(academicYearId ? { academicYearId } : {}),
        },
      },
      include: {
        assignment: {
          select: {
            id: true,
            employee: { select: { name: true } },
            subject: { select: { code: true, name: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
    });
  }

  async deleteScheduleEntry(id: string, actorId: string) {
    const existing = await this.prisma.scheduleEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Entri jadwal tidak ditemukan.');
    await this.prisma.scheduleEntry.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'schedule.delete', entity: 'schedule_entry', entityId: id });
  }

  // ---------- Assessments & grades ----------
  createAssessment(dto: AssessmentDto, _actorId: string) {
    return this.prisma.assessment.create({
      data: {
        ...dto,
        classId: dto.classId ?? null,
        maxScore: dto.maxScore ?? 100,
      },
    });
  }

  listAssessments(academicYearId?: string, classId?: string) {
    const where: Prisma.AssessmentWhereInput = {};
    if (academicYearId) where.academicYearId = academicYearId;
    if (classId) where.classId = classId;
    return this.prisma.assessment.findMany({
      where,
      include: {
        subject: { select: { code: true, name: true } },
        class: { select: { name: true } },
        _count: { select: { grades: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async setGrades(assessmentId: string, grades: GradeDto[], actorId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    const ops = grades.map((g) => {
      if (g.score > assessment.maxScore) {
        throw new ConflictException(
          `Nilai ${g.score} melebihi maxScore ${assessment.maxScore}`,
        );
      }
      return this.prisma.grade.upsert({
        where: {
          assessmentId_studentId: {
            assessmentId,
            studentId: g.studentId,
          },
        },
        create: { assessmentId, studentId: g.studentId, score: g.score },
        update: { score: g.score },
      });
    });
    await this.prisma.$transaction(ops);
    await this.audit.log({
      actorId,
      action: 'grade.set',
      entity: 'assessment',
      entityId: assessmentId,
      metadata: { count: grades.length },
    });
    return { saved: grades.length };
  }

  listGrades(assessmentId: string) {
    return this.prisma.grade.findMany({
      where: { assessmentId },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
  }
}
