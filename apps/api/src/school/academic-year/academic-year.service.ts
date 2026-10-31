import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreateAcademicYearDto } from './dto/create-academic-year.dto';

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
}
