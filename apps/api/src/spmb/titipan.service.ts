import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TitipanStatus } from '@prisma/client';
import { TITIPAN_ACTIVE_STATUSES } from '@smpmuh3/types';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { EnvService } from '../core/config/env.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { normalizePhone } from '../identity/users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  AdminTitipanNoteDto,
  GuestTitipanDto,
  ParentTitipanDto,
} from './dto/spmb.dto';
import { WhatsappService } from './whatsapp.service';

const entryInclude = {
  academicYear: { select: { id: true, name: true, quota: true } },
  parent: { select: { id: true, name: true, email: true, phone: true } },
  candidate: { select: { id: true, name: true } },
} satisfies Prisma.TitipanEntryInclude;

type EntryWithYear = Prisma.TitipanEntryGetPayload<{
  include: typeof entryInclude;
}>;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I/L

@Injectable()
export class TitipanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditService,
    private readonly env: EnvService,
  ) {}

  // ---------- Publik ----------

  /** Tahun ajaran yang membuka titipan + ringkasan antrean. */
  async openYears() {
    const years = await this.prisma.academicYear.findMany({
      where: { titipanOpen: true },
      orderBy: { startDate: 'asc' },
    });
    const counts = await this.countsByYear(years.map((y) => y.id));
    return Promise.all(
      years.map(async (y) => ({
        academicYearId: y.id,
        name: y.name,
        quota: y.quota,
        occupied: await this.occupiedSeats(y.id),
        ...counts.get(y.id)!,
      })),
    );
  }

  /** Papan antrean publik (pola data-titipan SPMB) — nama tampil, kontak tidak. */
  async publicBoard(academicYearId?: string) {
    const entries = await this.prisma.titipanEntry.findMany({
      where: {
        status: { not: 'CANCELLED' },
        ...(academicYearId ? { academicYearId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: entryInclude,
      take: 500,
    });
    const positions = await this.positionMap(
      entries.map((e) => e.academicYearId),
    );
    return entries.map((e) => this.toDto(e, positions, 'public'));
  }

  /** Form titipan publik (tanpa akun) → status PENDING menunggu verifikasi admin. */
  async createGuest(dto: GuestTitipanDto) {
    if (dto.website) {
      // honeypot terisi — pura-pura sukses, jangan simpan.
      return { id: 'ignored' };
    }
    const year = await this.assertYearOpen(dto.academicYearId);
    const entry = await this.allocate({
      academicYearId: year.id,
      candidateName: dto.candidateName.trim(),
      birthPlace: dto.birthPlace,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      address: dto.address,
      previousSchool: dto.previousSchool,
      guardianPhone: normalizePhone(dto.guardianPhone),
      infoSource: dto.infoSource,
    });
    return this.toDto(entry, await this.positionMap([year.id]), 'public');
  }

  // ---------- Orang tua (login) ----------

  listForParent(parentId: string) {
    return this.prisma.titipanEntry
      .findMany({
        where: { parentId },
        orderBy: { createdAt: 'desc' },
        include: entryInclude,
      })
      .then(async (entries) => {
        const positions = await this.positionMap(
          entries.map((e) => e.academicYearId),
        );
        return entries.map((e) => this.toDto(e, positions, 'owner'));
      });
  }

  /** Titipan dari dashboard — tertaut kandidat & akun ortu. */
  async createForParent(parentId: string, dto: ParentTitipanDto) {
    const year = await this.assertYearOpen(dto.academicYearId);
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, parentId },
    });
    if (!candidate) throw new NotFoundException('Calon murid tidak ditemukan.');
    const dup = await this.prisma.titipanEntry.findFirst({
      where: {
        candidateId: candidate.id,
        academicYearId: year.id,
        status: { notIn: ['CANCELLED', 'REGISTERED'] },
      },
    });
    if (dup) {
      throw new ConflictException(
        `Titipan ${candidate.name} untuk ${year.name} sudah ada.`,
      );
    }
    const parent = await this.prisma.user.findUniqueOrThrow({
      where: { id: parentId },
      select: { phone: true },
    });
    const contact = dto.guardianPhone ?? parent.phone ?? undefined;
    const entry = await this.allocate({
      academicYearId: year.id,
      parentId,
      candidateId: candidate.id,
      candidateName: candidate.name,
      birthPlace: candidate.birthPlace,
      birthDate: candidate.birthDate,
      address: candidate.address,
      previousSchool: candidate.previousSchool,
      guardianPhone: contact ? normalizePhone(contact) : undefined,
      infoSource: dto.infoSource,
    });
    await this.audit.log({
      actorId: parentId,
      action: 'titipan.create',
      entity: 'titipan_entry',
      entityId: entry.id,
      metadata: { year: year.name, candidate: candidate.name },
    });
    return this.toDto(entry, await this.positionMap([year.id]), 'owner');
  }

  /** Ambil entry dari kode formulir — dipakai alur redeem pendaftaran. */
  async findByCode(code: string) {
    const entry = await this.prisma.titipanEntry.findUnique({
      where: { formCode: code.trim().toUpperCase() },
      include: { academicYear: true },
    });
    if (!entry) {
      throw new BadRequestException('Kode formulir tidak valid.');
    }
    return entry;
  }

  /** Tandai kode terpakai — dipanggil setelah pendaftaran dibuat. */
  markRedeemed(
    entryId: string,
    data: { parentId: string; candidateId: string; registrationId: string },
  ) {
    return this.prisma.titipanEntry.update({
      where: { id: entryId },
      data: {
        status: 'REGISTERED',
        codeUsedAt: new Date(),
        parentId: data.parentId,
        candidateId: data.candidateId,
        registrationId: data.registrationId,
      },
    });
  }

  // ---------- Admin ----------

  async listForAdmin(options: {
    academicYearId?: string | undefined;
    status?: TitipanStatus | undefined;
    search?: string | undefined;
  }) {
    const where: Prisma.TitipanEntryWhereInput = {};
    if (options.academicYearId) where.academicYearId = options.academicYearId;
    if (options.status) where.status = options.status;
    if (options.search) {
      where.OR = [
        { candidateName: { contains: options.search, mode: 'insensitive' } },
        { previousSchool: { contains: options.search, mode: 'insensitive' } },
        { guardianPhone: { contains: options.search } },
        { formCode: { contains: options.search, mode: 'insensitive' } },
      ];
    }
    const entries = await this.prisma.titipanEntry.findMany({
      where,
      include: entryInclude,
      orderBy: [{ academicYearId: 'asc' }, { queueNo: 'asc' }],
      take: 500,
    });
    const positions = await this.positionMap(
      entries.map((e) => e.academicYearId),
    );
    return entries.map((e) => this.toDto(e, positions, 'admin'));
  }

  /** Ringkasan per tahun ajaran (kuota, antrean, kode). */
  async adminSummary() {
    const years = await this.prisma.academicYear.findMany({
      orderBy: { startDate: 'asc' },
    });
    const counts = await this.countsByYear(years.map((y) => y.id));
    return Promise.all(
      years.map(async (y) => ({
        academicYearId: y.id,
        name: y.name,
        titipanOpen: y.titipanOpen,
        isActive: y.isActive,
        quota: y.quota,
        occupied: await this.occupiedSeats(y.id),
        ...counts.get(y.id)!,
      })),
    );
  }

  /** Verifikasi entri guest → masuk antrean resmi. */
  async approve(id: string, actorId: string) {
    const entry = await this.mustGet(id);
    if (entry.status !== 'PENDING') {
      throw new BadRequestException('Hanya entri pending yang bisa diverifikasi.');
    }
    const updated = await this.prisma.titipanEntry.update({
      where: { id },
      data: { status: 'WAITING' },
      include: entryInclude,
    });
    await this.audit.log({
      actorId,
      action: 'titipan.approve',
      entity: 'titipan_entry',
      entityId: id,
    });
    await this.notifyParent(entry, {
      title: 'Titipan terverifikasi',
      body: `Daftar titipan ${entry.candidateName} untuk ${entry.academicYear.name} sudah terverifikasi dan masuk antrean.`,
    });
    return this.toDto(updated, await this.positionMap([entry.academicYearId]), 'admin');
  }

  /**
   * Terbitkan/kirim kode formulir unik ke WA ortu. Mengembalikan
   * `waUrl` sebagai fallback bila gateway belum aktif.
   */
  async sendCode(id: string, actorId: string) {
    const entry = await this.mustGet(id);
    if (!['WAITING', 'PENDING', 'CODE_SENT'].includes(entry.status)) {
      throw new BadRequestException(
        'Kode hanya bisa dikirim untuk entri yang masih mengantre.',
      );
    }
    const code = entry.formCode ?? (await this.generateCode());
    const updated = await this.prisma.titipanEntry.update({
      where: { id },
      data: {
        formCode: code,
        status: 'CODE_SENT',
        codeSentAt: new Date(),
        codeSentBy: actorId,
      },
      include: entryInclude,
    });

    const message =
      `Assalamu'alaikum. Kode formulir SPMB ${'SMP Muhammadiyah 3 Kota Bandung'} ` +
      `untuk calon murid *${entry.candidateName}* (TA ${entry.academicYear.name}):\n\n` +
      `*${code}*\n\n` +
      `Masuk ke ${this.env.spmbUrl}/akun lalu pilih "Gunakan Kode Formulir" ` +
      `untuk melanjutkan pendaftaran. Simpan kode ini baik-baik.`;

    const phone = entry.guardianPhone;
    const wa = phone
      ? await this.whatsapp.enqueue({
          type: 'titipan_code',
          phone,
          message,
          refType: 'titipan_entry',
          refId: entry.id,
          actorId,
        })
      : { sent: false, queued: false, waUrl: '' };

    await this.audit.log({
      actorId,
      action: 'titipan.send_code',
      entity: 'titipan_entry',
      entityId: id,
      metadata: { waQueued: wa.queued, waMessageId: wa.messageId },
    });
    await this.notifyParent(entry, {
      title: 'Kode formulir SPMB',
      body: `Kode formulir untuk ${entry.candidateName} (${entry.academicYear.name}): ${code} — masuk ke akun SPMB lalu gunakan kode untuk melanjutkan pendaftaran.`,
      data: { formCode: code },
    });
    return {
      entry: this.toDto(updated, await this.positionMap([entry.academicYearId]), 'admin'),
      sent: wa.sent,
      queued: wa.queued,
      waUrl: wa.waUrl,
    };
  }

  async cancel(id: string, actorId: string, note?: string) {
    const entry = await this.mustGet(id);
    if (entry.status === 'REGISTERED') {
      throw new BadRequestException(
        'Entri sudah menjadi pendaftaran — tidak bisa dibatalkan.',
      );
    }
    const updated = await this.prisma.titipanEntry.update({
      where: { id },
      data: { status: 'CANCELLED', note: note ?? entry.note },
      include: entryInclude,
    });
    await this.audit.log({
      actorId,
      action: 'titipan.cancel',
      entity: 'titipan_entry',
      entityId: id,
      metadata: note ? { note } : undefined,
    });
    return this.toDto(updated, await this.positionMap([entry.academicYearId]), 'admin');
  }

  /**
   * Ubah catatan dan/atau status manual. Status REGISTERED terkunci
   * (hanya lewat redeem kode) dan tidak bisa dituju manual.
   */
  async updateNote(id: string, dto: AdminTitipanNoteDto, actorId: string) {
    const entry = await this.mustGet(id);
    if (dto.status !== undefined) {
      if (entry.status === 'REGISTERED') {
        throw new BadRequestException(
          'Entri sudah menjadi pendaftaran — status terkunci.',
        );
      }
      if (dto.status === entry.status) {
        throw new BadRequestException('Status sudah sama.');
      }
    }
    const data: Prisma.TitipanEntryUpdateInput = {};
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'WAITING' && entry.status === 'PENDING') {
        // sama seperti verifikasi — masuk antrean resmi
      }
      if (dto.status === 'CODE_SENT' && !entry.formCode) {
        throw new BadRequestException(
          'Gunakan "Kirim Kode" untuk menerbitkan kode formulir.',
        );
      }
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Tidak ada perubahan.');
    }
    const updated = await this.prisma.titipanEntry.update({
      where: { id },
      data,
      include: entryInclude,
    });
    await this.audit.log({
      actorId,
      action: dto.status ? 'titipan.status' : 'titipan.note',
      entity: 'titipan_entry',
      entityId: id,
      metadata: {
        ...(dto.status ? { from: entry.status, to: dto.status } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    if (dto.status === 'WAITING' && entry.status === 'PENDING') {
      await this.notifyParent(entry, {
        title: 'Titipan terverifikasi',
        body: `Daftar titipan ${entry.candidateName} untuk ${entry.academicYear.name} sudah terverifikasi dan masuk antrean.`,
      });
    }
    return this.toDto(updated, await this.positionMap([updated.academicYearId]), 'admin');
  }

  // ---------- intern ----------

  private async mustGet(id: string) {
    const entry = await this.prisma.titipanEntry.findUnique({
      where: { id },
      include: entryInclude,
    });
    if (!entry) throw new NotFoundException('Data titipan tidak ditemukan.');
    return entry;
  }

  private async assertYearOpen(academicYearId: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: academicYearId },
    });
    if (!year || !year.titipanOpen) {
      throw new BadRequestException(
        'Tahun ajaran ini tidak membuka daftar titipan.',
      );
    }
    return year;
  }

  /** Alokasi nomor antre per tahun ajaran (retry bila balapan unik). */
  private async allocate(data: {
    academicYearId: string;
    parentId?: string | undefined;
    candidateId?: string | undefined;
    candidateName: string;
    birthPlace?: string | null | undefined;
    birthDate?: Date | null | undefined;
    address?: string | null | undefined;
    previousSchool?: string | null | undefined;
    guardianPhone?: string | null | undefined;
    infoSource?: string | null | undefined;
  }) {
    const { academicYearId, parentId, candidateId, ...rest } = data;
    for (let attempt = 0; attempt < 5; attempt++) {
      const max = await this.prisma.titipanEntry.aggregate({
        where: { academicYearId },
        _max: { queueNo: true },
      });
      try {
        return await this.prisma.titipanEntry.create({
          data: {
            candidateName: rest.candidateName,
            birthPlace: rest.birthPlace ?? null,
            birthDate: rest.birthDate ?? null,
            address: rest.address ?? null,
            previousSchool: rest.previousSchool ?? null,
            guardianPhone: rest.guardianPhone ?? null,
            infoSource: rest.infoSource ?? null,
            queueNo: (max._max.queueNo ?? 0) + 1,
            academicYear: { connect: { id: academicYearId } },
            ...(parentId ? { parent: { connect: { id: parentId } } } : {}),
            ...(candidateId
              ? { candidate: { connect: { id: candidateId } } }
              : {}),
          },
          include: entryInclude,
        });
      } catch (e) {
        if (
          e instanceof Error &&
          'code' in e &&
          (e as { code?: string }).code === 'P2002'
        ) {
          continue; // nomor diambil pendaftar lain — coba lagi
        }
        throw e;
      }
    }
    throw new ConflictException('Gagal mengalokasikan nomor antrean.');
  }

  /**
   * Posisi antrean aktif per tahun ajaran: entri WAITING/CODE_SENT
   * diurut queueNo → map entryId → posisi (1 = terdepan).
   */
  private async positionMap(academicYearIds: string[]) {
    const ids = [...new Set(academicYearIds)];
    const map = new Map<string, number>();
    if (ids.length === 0) return map;
    const actives = await this.prisma.titipanEntry.findMany({
      where: {
        academicYearId: { in: ids },
        status: { in: [...TITIPAN_ACTIVE_STATUSES] },
      },
      select: { id: true, academicYearId: true, queueNo: true },
      orderBy: { queueNo: 'asc' },
    });
    const perYear = new Map<string, number>();
    for (const a of actives) {
      const next = (perYear.get(a.academicYearId) ?? 0) + 1;
      perYear.set(a.academicYearId, next);
      map.set(a.id, next);
    }
    return map;
  }

  /** Jumlah status per tahun ajaran. */
  private async countsByYear(ids: string[]) {
    const map = new Map<
      string,
      { waitingCount: number; codeSentCount: number; registeredCount: number }
    >();
    for (const id of ids) {
      map.set(id, { waitingCount: 0, codeSentCount: 0, registeredCount: 0 });
    }
    if (ids.length === 0) return map;
    const rows = await this.prisma.titipanEntry.groupBy({
      by: ['academicYearId', 'status'],
      where: { academicYearId: { in: ids } },
      _count: { _all: true },
    });
    for (const r of rows) {
      const c = map.get(r.academicYearId);
      if (!c) continue;
      if (r.status === 'WAITING') c.waitingCount = r._count._all;
      if (r.status === 'CODE_SENT') c.codeSentCount = r._count._all;
      if (r.status === 'REGISTERED') c.registeredCount = r._count._all;
    }
    return map;
  }

  /** Kursi terpakai = pendaftaran resmi selain yang ditolak. */
  private occupiedSeats(academicYearId: string) {
    return this.prisma.registration.count({
      where: { academicYearId, status: { not: 'REJECTED' } },
    });
  }

  private async generateCode() {
    for (let i = 0; i < 10; i++) {
      const code = `SPMB-${randomBytes(4)
        .toString('hex')
        .split('')
        .map((h) => CODE_ALPHABET[parseInt(h, 16) % CODE_ALPHABET.length])
        .join('')
        .slice(0, 6)}`;
      const clash = await this.prisma.titipanEntry.findUnique({
        where: { formCode: code },
        select: { id: true },
      });
      if (!clash) return code;
    }
    throw new ConflictException('Gagal membuat kode unik.');
  }

  private async notifyParent(
    entry: EntryWithYear,
    n: { title: string; body: string; data?: Prisma.InputJsonValue },
  ) {
    if (!entry.parentId) return;
    await this.notifications.notify(entry.parentId, n);
  }

  private toDto(
    e: EntryWithYear,
    positions: Map<string, number>,
    mode: 'public' | 'owner' | 'admin' = 'public',
  ) {
    const includePrivate = mode === 'admin';
    const revealCode = mode !== 'public';
    const active = TITIPAN_ACTIVE_STATUSES.includes(e.status);
    return {
      id: e.id,
      academicYearId: e.academicYearId,
      academicYearName: e.academicYear.name,
      candidateId: e.candidateId,
      candidateName: e.candidateName,
      birthPlace: e.birthPlace,
      birthDate: e.birthDate?.toISOString().slice(0, 10) ?? null,
      address: e.address,
      previousSchool: e.previousSchool,
      guardianPhone: includePrivate ? e.guardianPhone : null,
      infoSource: e.infoSource,
      queueNo: e.queueNo,
      position: active ? (positions.get(e.id) ?? null) : null,
      status: e.status,
      formCode: revealCode ? e.formCode : null,
      codeSentAt: e.codeSentAt,
      codeUsedAt: e.codeUsedAt,
      note: includePrivate ? e.note : null,
      parentName: includePrivate ? (e.parent?.name ?? null) : null,
      parentEmail: includePrivate ? (e.parent?.email ?? null) : null,
      parentPhone: includePrivate ? (e.parent?.phone ?? null) : null,
      createdAt: e.createdAt,
    };
  }
}
