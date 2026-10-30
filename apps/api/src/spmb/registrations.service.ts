import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, RegistrationStatus } from '@prisma/client';
import {
  PATHWAYS,
  REGISTRATION_EDITABLE,
  REGISTRATION_STATUS_LABELS,
  REQUIRED_DOC_TYPES,
} from '@smpmuh3/types';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { normalizePhone } from '../identity/users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { CandidatesService } from './candidates.service';
import { SpmbSettingsService } from './settings.service';

const include = {
  candidate: {
    select: {
      id: true,
      name: true,
      gender: true,
      birthPlace: true,
      birthDate: true,
      nisn: true,
      previousSchool: true,
      address: true,
      tkaScore: true,
    },
  },
  wave: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
      psikotesAt: true,
      psikotesNote: true,
      order: true,
    },
  },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidatesService,
    private readonly notifications: NotificationsService,
    private readonly settings: SpmbSettingsService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  listByParent(parentId: string) {
    return this.prisma.registration.findMany({
      where: { parentId },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Buat pendaftaran: data dasar calon + gelombang → status AWAITING_PAYMENT
   * dengan invoice uang pendaftaran (nominal dari pengaturan biaya admin).
   */
  async createDraft(parentId: string, candidateId: string, waveId: string) {
    await this.candidates.owned(parentId, candidateId);
    const wave = await this.prisma.registrationWave.findUnique({
      where: { id: waveId },
    });
    if (!wave || !wave.isActive) {
      throw new BadRequestException('Gelombang tidak tersedia');
    }
    const year = await this.prisma.academicYear.findFirstOrThrow({
      where: { id: wave.academicYearId },
    });
    if (!year.isActive) {
      throw new BadRequestException('Tahun ajaran gelombang tidak aktif');
    }
    const existing = await this.prisma.registration.findUnique({
      where: {
        candidateId_academicYearId: {
          candidateId,
          academicYearId: year.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Pendaftaran untuk calon siswa ini sudah ada',
      );
    }

    const feeAmount = await this.settings.feeAmountFor(wave.id, 'registration');
    const registration = await this.prisma.registration.create({
      data: {
        number: await this.generateNumber(year),
        candidateId,
        parentId,
        academicYearId: year.id,
        waveId: wave.id,
        pathway: 'reguler',
        status: 'AWAITING_PAYMENT',
        invoices: {
          create: {
            number: this.generateInvoiceNumber(),
            kind: 'registration_fee',
            title: `Uang Pendaftaran SPMB ${year.name}`,
            amount: feeAmount,
          },
        },
      },
      include: { ...include, invoices: true },
    });
    await this.audit.log({
      actorId: parentId,
      action: 'registration.create',
      entity: 'registration',
      entityId: registration.id,
    });
    return registration;
  }

  /** Fetch a registration, enforcing parent ownership unless staff. */
  async ownedOrStaff(id: string, userId: string, isStaff: boolean) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include,
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (!isStaff && reg.parentId !== userId) {
      throw new ForbiddenException('Not your registration');
    }
    return reg;
  }

  async updateDraft(
    userId: string,
    id: string,
    dto: {
      pathway?: string | undefined;
      pathwayDetail?: string | undefined;
      formAnswers?: Record<string, string> | undefined;
    },
  ) {
    const reg = await this.ownedOrStaff(id, userId, false);
    this.assertEditable(reg.status);
    if (dto.pathway && !PATHWAYS.includes(dto.pathway as never)) {
      throw new BadRequestException('Jalur pendaftaran tidak valid');
    }
    if (dto.pathway === 'prestasi' && !dto.pathwayDetail) {
      throw new BadRequestException('Pilih jenis prestasi untuk jalur prestasi');
    }
    const data: Prisma.RegistrationUpdateInput = {};
    if (dto.pathway !== undefined) data.pathway = dto.pathway;
    if (dto.pathwayDetail !== undefined) {
      data.pathwayDetail = dto.pathway === 'prestasi' ? dto.pathwayDetail : null;
    }
    if (dto.formAnswers !== undefined) {
      data.formAnswers = dto.formAnswers;
    }
    const updated = await this.prisma.registration.update({
      where: { id: reg.id },
      data,
      include,
    });
    // Diskon otomatis mengikuti jalur prestasi yang dipilih.
    if (dto.pathway !== undefined || dto.pathwayDetail !== undefined) {
      const detail =
        updated.pathway === 'prestasi' ? updated.pathwayDetail : null;
      const percent = await this.settings.suggestedDiscount(detail);
      if (percent !== updated.discountPercent) {
        await this.prisma.registration.update({
          where: { id: reg.id },
          data: { discountPercent: percent },
        });
        updated.discountPercent = percent;
      }
    }
    return updated;
  }

  /**
   * Kirim pendaftaran — wajib: dokumen (KK, akta, KTP ortu, ijazah/SK),
   * sertifikat untuk jalur prestasi, dan semua pertanyaan wajib terisi.
   */
  async submit(userId: string, id: string) {
    const reg = await this.ownedOrStaff(id, userId, false);
    if (!['FORM_FILLING', 'NEEDS_REVISION'].includes(reg.status)) {
      throw new BadRequestException(
        `Pendaftaran tidak bisa dikirim pada status ${REGISTRATION_STATUS_LABELS[reg.status]}`,
      );
    }

    const docs = await this.prisma.document.findMany({
      where: { registrationId: reg.id },
      select: { type: true },
    });
    const types = new Set(docs.map((d) => d.type));
    const missing = REQUIRED_DOC_TYPES.filter((t) => !types.has(t));
    if (!types.has('ijazah') && !types.has('sk_sekolah')) {
      missing.push('ijazah');
    }
    if (reg.pathway === 'prestasi' && !types.has('sertifikat')) {
      missing.push('sertifikat');
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Dokumen belum lengkap: ${missing.join(', ')}`,
      );
    }

    const cand = reg.candidate as Record<string, unknown> | null;
    const missingFields = [
      ['birthPlace', 'tempat lahir'],
      ['birthDate', 'tanggal lahir'],
      ['previousSchool', 'asal sekolah'],
      ['address', 'alamat'],
    ]
      .filter(([f]) => !cand?.[f ?? ''])
      .map(([, l]) => l);
    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Lengkapi data calon murid: ${missingFields.join(', ')}`,
      );
    }

    const questions = await this.settings.listQuestions(true);
    const answers = (reg.formAnswers ?? {}) as Record<string, string>;
    const unanswered = questions.filter(
      (q) => q.required && !answers[q.id]?.trim(),
    );
    if (unanswered.length > 0) {
      throw new BadRequestException(
        `Formulir belum lengkap: ${unanswered[0]!.label}`,
      );
    }

    const updated = await this.prisma.registration.update({
      where: { id: reg.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), revisionNote: null },
      include,
    });
    await this.notifications.notify(userId, {
      title: 'Pendaftaran terkirim',
      body: `Pendaftaran ${reg.number} berhasil dikirim dan menunggu verifikasi berkas.`,
      data: { registrationId: reg.id, number: reg.number },
    });
    await this.audit.log({
      actorId: userId,
      action: 'registration.submit',
      entity: 'registration',
      entityId: reg.id,
      metadata: { number: reg.number },
    });
    return updated;
  }

  /**
   * Cek status publik — nomor pendaftaran + email ATAU nomor HP orang tua.
   */
  async lookup(number: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { number },
      include: {
        wave: { select: { name: true } },
        candidate: { select: { name: true } },
      },
    });
    if (!reg) return null;

    const note =
      reg.status === 'NEEDS_REVISION'
        ? reg.revisionNote
        : reg.status === 'REJECTED' || reg.status === 'ACCEPTED'
          ? reg.decisionNote
          : null;
    return {
      number: reg.number,
      status: reg.status,
      statusLabel: REGISTRATION_STATUS_LABELS[reg.status],
      wave: reg.wave?.name,
      pathway: reg.pathway,
      candidateName: reg.candidate.name,
      submittedAt: reg.submittedAt ?? undefined,
      psikotesAt: reg.psikotesAt ?? undefined,
      psikotesNote: reg.psikotesNote ?? undefined,
      note: note ?? undefined,
      updatedAt: reg.updatedAt,
    };
  }

  /** Staff view — filtered registrations, newest first. */
  listForStaff(options: {
    status?: RegistrationStatus | undefined;
    waveId?: string | undefined;
    academicYearId?: string | undefined;
    search?: string | undefined;
    take?: number | undefined;
  }) {
    const where: Prisma.RegistrationWhereInput = {};
    if (options.status) where.status = options.status;
    if (options.waveId) where.waveId = options.waveId;
    if (options.academicYearId) where.academicYearId = options.academicYearId;
    if (options.search) {
      where.OR = [
        { number: { contains: options.search, mode: 'insensitive' } },
        { candidate: { name: { contains: options.search, mode: 'insensitive' } } },
        { parent: { email: { contains: options.search, mode: 'insensitive' } } },
        { parent: { phone: { contains: options.search } } },
      ];
    }
    return this.prisma.registration.findMany({
      where,
      include: {
        ...include,
        parent: { select: { id: true, email: true, phone: true, name: true } },
        documents: { select: { type: true, verifiedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(options.take ?? 50, 200),
    });
  }

  /** Staff dashboard — count per status + total. */
  async staffSummary() {
    const rows = await this.prisma.registration.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    );
    return {
      total: rows.reduce((n, r) => n + r._count._all, 0),
      byStatus,
    };
  }

  /** Staff detail — registration + candidate + docs + invoices + parent. */
  staffDetail(id: string) {
    return this.prisma.registration.findUniqueOrThrow({
      where: { id },
      include: {
        ...include,
        parent: { select: { id: true, email: true, phone: true, name: true } },
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            verifiedAt: true,
            verifiedBy: true,
            verificationNote: true,
            createdAt: true,
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            payments: { include: { proofDocument: true, receipts: true } },
          },
        },
        installmentPlans: { include: { invoices: true } },
        academicYear: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  /** Staff-side status transition + audit + parent notification. */
  async transition(
    id: string,
    status: RegistrationStatus,
    actorId: string,
    note?: string | undefined,
  ) {
    const updated = await this.prisma.registration.update({
      where: { id },
      data: {
        status,
        ...(status === 'NEEDS_REVISION'
          ? { revisionNote: note ?? null }
          : {}),
        ...(status === 'ACCEPTED' || status === 'REJECTED'
          ? { decisionNote: note ?? null }
          : {}),
      },
      include: { ...include, parent: { select: { id: true } } },
    });
    await this.audit.log({
      actorId,
      action: `registration.${status.toLowerCase()}`,
      entity: 'registration',
      entityId: id,
      metadata: note ? { note } : undefined,
    });
    const labels: Partial<Record<RegistrationStatus, string>> = {
      NEEDS_REVISION: `Perbaikan diminta: ${note ?? 'lihat catatan'}`,
      VERIFIED:
        'Berkas Anda terverifikasi. Menunggu tagihan pembayaran selanjutnya.',
      SELECTION:
        'Anda dijadwalkan mengikuti psikotes. Lihat detail pada cek status.',
      ACCEPTED: `Selamat — Anda diterima! ${note ?? ''}`.trim(),
      REJECTED: `Pendaftaran tidak dapat dilanjutkan. ${note ?? ''}`.trim(),
      RE_REGISTRATION:
        'Silakan melakukan daftar ulang sekaligus pelunasan di sekolah.',
    };
    const msg = labels[status];
    if (msg) {
      await this.notifications.notify(updated.parentId, {
        title: `Status ${updated.number}`,
        body: msg,
        data: { registrationId: id },
      });
    }
    // Berkas terverifikasi → terbitkan otomatis tagihan DP DSP
    // (diskon jalur prestasi sudah termasuk).
    if (status === 'VERIFIED') {
      await this.payments.issueDpInvoiceIfNeeded(id, actorId);
    }
    // Diterima → terbitkan tagihan pelunasan (dibayar di sekolah).
    if (status === 'ACCEPTED') {
      await this.payments.issueSettlementInvoiceIfNeeded(id, actorId);
    }
    return updated;
  }

  /** Staff: transisi banyak pendaftar sekaligus (mis. lolos psikotes). */
  async bulkTransition(
    ids: string[],
    status: RegistrationStatus,
    actorId: string,
    note?: string | undefined,
  ) {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.transition(id, status, actorId, note);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : 'Gagal',
        });
      }
    }
    return results;
  }

  /**
   * Staff: jadikan calon murid pendaftar yang diterima — membuat record
   * Student (status aktif, kelas belum ditetapkan) tertaut ke candidate.
   */
  async promoteToStudent(id: string, actorId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { candidate: { include: { student: true } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'ACCEPTED' && reg.status !== 'RE_REGISTRATION' && reg.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Hanya pendaftar yang diterima bisa dijadikan murid',
      );
    }
    const cand = reg.candidate;
    if (cand.student) return cand.student; // sudah jadi murid
    const student = await this.prisma.student.create({
      data: {
        name: cand.name,
        gender: cand.gender,
        birthPlace: cand.birthPlace,
        birthDate: cand.birthDate,
        nisn: cand.nisn,
        address: cand.address,
        candidateId: cand.id,
        parentId: reg.parentId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'registration.promote_student',
      entity: 'student',
      entityId: student.id,
      metadata: { registrationId: id, number: reg.number },
    });
    return student;
  }

  /** Staff: jadikan murid beberapa pendaftar sekaligus. */
  async bulkPromote(ids: string[], actorId: string) {
    const results: { id: string; ok: boolean; studentId?: string; error?: string }[] = [];
    for (const id of ids) {
      try {
        const s = await this.promoteToStudent(id, actorId);
        results.push({ id, ok: true, studentId: s.id });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : 'Gagal',
        });
      }
    }
    return results;
  }

  /** Staff: atur jadwal/catatan psikotes — tampil di cek status ortu. */
  async setPsikotes(
    id: string,
    dto: { psikotesAt?: string | undefined; note?: string | undefined },
    actorId: string,
  ) {
    const reg = await this.prisma.registration.update({
      where: { id },
      data: {
        ...(dto.psikotesAt ? { psikotesAt: new Date(dto.psikotesAt) } : {}),
        ...(dto.note !== undefined ? { psikotesNote: dto.note } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'registration.psikotes',
      entity: 'registration',
      entityId: id,
    });
    return reg;
  }

  /** Staff: atur diskon DSP (jalur prestasi, setelah sertifikat diverifikasi). */
  async setDiscount(id: string, percent: number, actorId: string) {
    if (percent < 0 || percent > 100) {
      throw new BadRequestException('Persen diskon harus 0–100');
    }
    const reg = await this.prisma.registration.update({
      where: { id },
      data: { discountPercent: percent },
    });
    await this.audit.log({
      actorId,
      action: 'registration.discount',
      entity: 'registration',
      entityId: id,
      metadata: { percent },
    });
    return reg;
  }

  assertEditable(status: RegistrationStatus) {
    if (!REGISTRATION_EDITABLE.includes(status)) {
      throw new BadRequestException(
        `Registration cannot be edited in status ${status}`,
      );
    }
  }

  private async generateNumber(year: { name: string }) {
    const prefix = `SPMB-${year.name.split('/')[0]}-`;
    for (let i = 0; i < 10; i++) {
      const number = `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await this.prisma.registration.findUnique({
        where: { number },
        select: { id: true },
      });
      if (!clash) return number;
    }
    throw new ConflictException('Could not allocate registration number');
  }

  private generateInvoiceNumber() {
    return `INV-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
  }
}
