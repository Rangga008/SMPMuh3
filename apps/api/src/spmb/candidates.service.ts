import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import type { CreateCandidateDto } from './dto/spmb.dto';

const select = {
  id: true,
  name: true,
  gender: true,
  birthPlace: true,
  birthDate: true,
  nisn: true,
  nik: true,
  motherName: true,
  previousSchool: true,
  address: true,
  tkaScore: true,
} satisfies Prisma.CandidateSelect;

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listByParent(parentId: string) {
    return this.prisma.candidate.findMany({
      where: { parentId },
      select,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(parentId: string, dto: CreateCandidateDto) {
    return this.prisma.candidate.create({
      data: this.toData(parentId, dto),
      select,
    });
  }

  /**
   * Kandidat otomatis dari data titipan saat kode formulir dipakai —
   * field wajib (NIK, ibu, tempat lahir) dilengkapi ortu di formulir.
   */
  async createFromTitipan(
    parentId: string,
    tx: Prisma.TransactionClient,
    data: {
      name: string;
      birthPlace?: string | null;
      birthDate?: Date | null;
      previousSchool?: string | null;
      address?: string | null;
    },
  ) {
    return tx.candidate.create({
      data: {
        parentId,
        name: data.name.trim().toUpperCase(),
        birthPlace: data.birthPlace ?? null,
        birthDate: data.birthDate ?? null,
        previousSchool: data.previousSchool ?? null,
        address: data.address ?? null,
      },
      select,
    });
  }

  async update(parentId: string, id: string, dto: CreateCandidateDto) {
    const candidate = await this.owned(parentId, id);
    const updated = await this.prisma.candidate.update({
      where: { id: candidate.id },
      data: this.toData(parentId, dto),
      select,
    });
    await this.audit.log({
      actorId: parentId,
      action: 'candidate.update',
      entity: 'candidate',
      entityId: id,
    });
    return updated;
  }

  /** Throws if the candidate doesn't exist or belongs to another parent. */
  async owned(parentId: string, id: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { id } });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.parentId !== parentId) {
      throw new ForbiddenException('Not your candidate');
    }
    return candidate;
  }

  private toData(parentId: string, dto: CreateCandidateDto) {
    return {
      parentId,
      name: dto.name.trim().toUpperCase(),
      gender: dto.gender,
      birthPlace: dto.birthPlace.trim(),
      birthDate: new Date(dto.birthDate),
      nisn: dto.nisn ?? null,
      nik: dto.nik,
      motherName: dto.motherName.trim(),
      previousSchool: dto.previousSchool.trim(),
      address: dto.address ?? null,
      tkaScore: dto.tkaScore ?? null,
    };
  }
}
