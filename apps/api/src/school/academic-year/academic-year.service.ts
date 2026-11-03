import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreateAcademicYearDto, UpdateAcademicYearDto } from './dto/create-academic-year.dto';

@Injectable()
export class AcademicYearService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
    });
  }

  async create(dto: CreateAcademicYearDto, actorId: string) {
    const exists = await this.prisma.academicYear.findUnique({
      where: { name: dto.name },
    });
    if (exists) {
      throw new ConflictException(`Academic year "${dto.name}" already exists`);
    }

    const year = await this.prisma.$transaction(async (tx) => {
      if (dto.isActive) {
        await tx.academicYear.updateMany({ data: { isActive: false } });
      }
      return tx.academicYear.create({
        data: {
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isActive: dto.isActive ?? false,
        },
      });
    });

    await this.audit.log({
      actorId,
      action: 'academic-year.create',
      entity: 'academic_year',
      entityId: year.id,
      metadata: { name: year.name },
    });
    return year;
  }

  /** Jadikan tahun ajaran ini aktif — otomatis menonaktifkan yang lain. */
  async activate(id: string, actorId: string) {
    const existing = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
    const year = await this.prisma.$transaction(async (tx) => {
      await tx.academicYear.updateMany({ data: { isActive: false } });
      return tx.academicYear.update({ where: { id }, data: { isActive: true } });
    });
    await this.audit.log({
      actorId,
      action: 'academic-year.activate',
      entity: 'academic_year',
      entityId: id,
      metadata: { name: year.name },
    });
    return year;
  }

  /** Perbarui nama, tanggal, flag titipan & kuota tahun ajaran. */
  async update(id: string, dto: UpdateAcademicYearDto, actorId: string) {
    const existing = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
    if (dto.name !== undefined && dto.name !== existing.name) {
      const clash = await this.prisma.academicYear.findUnique({ where: { name: dto.name } });
      if (clash) throw new ConflictException(`Tahun ajaran "${dto.name}" sudah ada.`);
    }
    const year = await this.prisma.academicYear.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined ? { endDate: new Date(dto.endDate) } : {}),
        ...(dto.titipanOpen !== undefined ? { titipanOpen: dto.titipanOpen } : {}),
        ...(dto.quota !== undefined ? { quota: dto.quota } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'academic-year.update',
      entity: 'academic_year',
      entityId: id,
      metadata: { titipanOpen: year.titipanOpen, quota: year.quota },
    });
    return year;
  }

  /** Hapus tahun ajaran — hanya jika belum dipakai modul lain & tidak aktif. */
  async remove(id: string, actorId: string) {
    const existing = await this.prisma.academicYear.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            registrations: true,
            classes: true,
            waves: true,
            titipanEntries: true,
            semesters: true,
            assignments: true,
            assessments: true,
            enrollments: true,
            financeTx: true,
            financeBudgets: true,
            examRecords: true,
            formQuestions: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Tahun ajaran tidak ditemukan.');
    if (existing.isActive) {
      throw new ConflictException('Tahun ajaran aktif tidak bisa dihapus — aktifkan tahun lain dulu.');
    }
    const used = Object.entries(existing._count)
      .filter(([, n]) => n > 0)
      .map(([k]) => k);
    if (used.length > 0) {
      throw new ConflictException(
        `Tahun ajaran ${existing.name} masih dipakai (${used.join(', ')}) — tidak bisa dihapus.`,
      );
    }
    await this.prisma.academicYear.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'academic-year.delete',
      entity: 'academic_year',
      entityId: id,
      metadata: { name: existing.name },
    });
    return { ok: true };
  }
}
