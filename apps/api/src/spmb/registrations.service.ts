import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, RegistrationStatus } from '@prisma/client';
import { REGISTRATION_EDITABLE } from '@smpmuh3/types';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CandidatesService } from './candidates.service';

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
    },
  },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidatesService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  listByParent(parentId: string) {
    return this.prisma.registration.findMany({
      where: { parentId },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDraft(parentId: string, candidateId: string) {
    await this.candidates.owned(parentId, candidateId);
    const year = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (!year) {
      throw new BadRequestException('No active academic year configured');
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
        'A registration for this candidate already exists',
      );
    }
    const registration = await this.prisma.registration.create({
      data: {
        number: await this.generateNumber(year),
        candidateId,
        parentId,
        academicYearId: year.id,
        pathway: 'reguler',
      },
      include,
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

  async updateDraft(userId: string, id: string, pathway: string) {
    const reg = await this.ownedOrStaff(id, userId, false);
    this.assertEditable(reg.status);
    const updated = await this.prisma.registration.update({
      where: { id: reg.id },
      data: { pathway },
      include,
    });
    return updated;
  }

  async submit(userId: string, id: string) {
    const reg = await this.ownedOrStaff(id, userId, false);
    if (reg.status === 'SUBMITTED') {
      throw new ConflictException('Already submitted');
    }
    this.assertEditable(reg.status);
    const docCount = await this.prisma.document.count({
      where: { registrationId: reg.id },
    });
    if (docCount === 0) {
      throw new BadRequestException(
        'Upload at least one document before submitting',
      );
    }
    const updated = await this.prisma.registration.update({
      where: { id: reg.id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
      include,
    });
    await this.notifications.notify(userId, {
      title: 'Pendaftaran terkirim',
      body: `Pendaftaran ${reg.number} berhasil dikirim dan menunggu verifikasi.`,
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

  /** Public status lookup by registration number + parent email. */
  async lookup(number: string, email: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { number },
      select: {
        number: true,
        status: true,
        updatedAt: true,
        parent: { select: { email: true } },
      },
    });
    if (!reg || reg.parent.email.toLowerCase() !== email.toLowerCase()) {
      return null; // same response either way — don't leak existence
    }
    return { number: reg.number, status: reg.status, updatedAt: reg.updatedAt };
  }

  /** Staff view — filtered registrations, newest first. */
  listForStaff(options: {
    status?: RegistrationStatus | undefined;
    search?: string | undefined;
    take?: number | undefined;
  }) {
    const where: Prisma.RegistrationWhereInput = {};
    if (options.status) where.status = options.status;
    if (options.search) {
      where.OR = [
        { number: { contains: options.search, mode: 'insensitive' } },
        { candidate: { name: { contains: options.search, mode: 'insensitive' } } },
        { parent: { email: { contains: options.search, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.registration.findMany({
      where,
      include: {
        ...include,
        parent: { select: { id: true, email: true, name: true } },
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
        parent: { select: { id: true, email: true, name: true } },
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
        invoices: { orderBy: { createdAt: 'desc' }, include: { payments: true } },
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
      VERIFIED: 'Berkas Anda telah diverifikasi.',
      ACCEPTED: 'Selamat — pendaftaran Anda diterima!',
      REJECTED: 'Pendaftaran Anda tidak dapat dilanjutkan.',
    };
    const msg = labels[status];
    if (msg) {
      await this.notifications.notify(updated.parentId, {
        title: `Status ${updated.number}`,
        body: msg,
        data: { registrationId: id },
      });
    }
    return updated;
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
}
