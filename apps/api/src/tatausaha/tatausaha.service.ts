import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import type {
  ExamRecordDto,
  LetterDto,
  MutationDto,
  UpdateExamRecordDto,
  UpdateLetterDto,
  UpdateMutationDto,
} from './dto/tatausaha.dto';

@Injectable()
export class TatausahaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Surat menyurat ----------

  listLetters(direction?: 'IN' | 'OUT', search?: string) {
    return this.prisma.letter.findMany({
      where: {
        ...(direction ? { direction } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search, mode: 'insensitive' } },
                { subject: { contains: search, mode: 'insensitive' } },
                { party: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async createLetter(dto: LetterDto, actorId: string) {
    const dup = await this.prisma.letter.findUnique({
      where: { direction_number: { direction: dto.direction, number: dto.number } },
    });
    if (dup) {
      throw new ConflictException(
        `Nomor surat "${dto.number}" sudah dipakai untuk surat ${dto.direction === 'IN' ? 'masuk' : 'keluar'}.`,
      );
    }
    const letter = await this.prisma.letter.create({
      data: {
        direction: dto.direction,
        number: dto.number,
        date: new Date(dto.date),
        subject: dto.subject,
        party: dto.party ?? null,
        description: dto.description ?? null,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'tu.letter.create',
      entity: 'letter',
      entityId: letter.id,
    });
    return letter;
  }

  async updateLetter(id: string, dto: UpdateLetterDto, actorId: string) {
    const existing = await this.prisma.letter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Surat tidak ditemukan.');
    if (dto.number && dto.number !== existing.number) {
      const dup = await this.prisma.letter.findUnique({
        where: {
          direction_number: { direction: existing.direction, number: dto.number },
        },
      });
      if (dup) throw new ConflictException('Nomor surat sudah dipakai.');
    }
    const letter = await this.prisma.letter.update({
      where: { id },
      data: {
        ...(dto.number !== undefined ? { number: dto.number } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.party !== undefined ? { party: dto.party } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'tu.letter.update',
      entity: 'letter',
      entityId: id,
    });
    return letter;
  }

  async deleteLetter(id: string, actorId: string) {
    const existing = await this.prisma.letter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Surat tidak ditemukan.');
    if (existing.storageKey) {
      await this.storage.deleteObject(existing.storageKey).catch(() => undefined);
    }
    await this.prisma.letter.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'tu.letter.delete',
      entity: 'letter',
      entityId: id,
    });
  }

  /** Lampiran surat — simpan ke S3, key tercatat di baris surat. */
  async uploadLetterFile(
    id: string,
    file: Express.Multer.File,
    actorId: string,
  ) {
    const letter = await this.prisma.letter.findUnique({ where: { id } });
    if (!letter) throw new NotFoundException('Surat tidak ditemukan.');
    const key = `letters/${id}/${Date.now()}-${file.originalname.replace(/[^\w.-]+/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    if (letter.storageKey) {
      await this.storage.deleteObject(letter.storageKey).catch(() => undefined);
    }
    const updated = await this.prisma.letter.update({
      where: { id },
      data: { storageKey: key, fileName: file.originalname, mimeType: file.mimetype },
    });
    await this.audit.log({
      actorId,
      action: 'tu.letter.file_upload',
      entity: 'letter',
      entityId: id,
    });
    return updated;
  }

  async getLetterFile(id: string) {
    const letter = await this.prisma.letter.findUnique({ where: { id } });
    if (!letter?.storageKey) throw new NotFoundException('Lampiran tidak ada.');
    let buf: Buffer;
    try {
      buf = await this.storage.getObjectBuffer(letter.storageKey);
    } catch {
      throw new NotFoundException('Berkas lampiran tidak ditemukan di storage.');
    }
    return {
      buf,
      mime: letter.mimeType ?? 'application/octet-stream',
      name: letter.fileName ?? 'lampiran',
    };
  }

  // ---------- Mutasi siswa ----------

  listMutations(direction?: 'IN' | 'OUT', search?: string) {
    return this.prisma.studentMutation.findMany({
      where: {
        ...(direction ? { direction } : {}),
        ...(search
          ? {
              OR: [
                { studentName: { contains: search, mode: 'insensitive' } },
                { nisn: { contains: search } },
                { school: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async createMutation(dto: MutationDto, actorId: string) {
    const mut = await this.prisma.studentMutation.create({
      data: {
        direction: dto.direction,
        studentName: dto.studentName,
        nisn: dto.nisn ?? null,
        date: new Date(dto.date),
        school: dto.school ?? null,
        letterNumber: dto.letterNumber ?? null,
        status: dto.status ?? 'PROCESS',
        notes: dto.notes ?? null,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'tu.mutation.create',
      entity: 'student_mutation',
      entityId: mut.id,
    });
    return mut;
  }

  async updateMutation(id: string, dto: UpdateMutationDto, actorId: string) {
    const existing = await this.prisma.studentMutation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Mutasi tidak ditemukan.');
    const mut = await this.prisma.studentMutation.update({
      where: { id },
      data: {
        ...(dto.studentName !== undefined ? { studentName: dto.studentName } : {}),
        ...(dto.nisn !== undefined ? { nisn: dto.nisn } : {}),
        ...(dto.date !== undefined ? { date: new Date(dto.date) } : {}),
        ...(dto.school !== undefined ? { school: dto.school } : {}),
        ...(dto.letterNumber !== undefined ? { letterNumber: dto.letterNumber } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'tu.mutation.update',
      entity: 'student_mutation',
      entityId: id,
    });
    return mut;
  }

  async deleteMutation(id: string, actorId: string) {
    const existing = await this.prisma.studentMutation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Mutasi tidak ditemukan.');
    await this.prisma.studentMutation.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'tu.mutation.delete',
      entity: 'student_mutation',
      entityId: id,
    });
  }

  // ---------- Ujian Sekolah (US1/US2) ----------

  listExamRecords(period?: 'US1' | 'US2', academicYearId?: string, search?: string) {
    return this.prisma.schoolExamRecord.findMany({
      where: {
        ...(period ? { period } : {}),
        ...(academicYearId ? { academicYearId } : {}),
        ...(search
          ? {
              OR: [
                { studentName: { contains: search, mode: 'insensitive' } },
                { nisn: { contains: search } },
              ],
            }
          : {}),
      },
      include: { academicYear: { select: { name: true } } },
      orderBy: { studentName: 'asc' },
      take: 1000,
    });
  }

  async createExamRecord(dto: ExamRecordDto, actorId: string) {
    const rec = await this.prisma.schoolExamRecord.create({
      data: {
        period: dto.period,
        academicYearId: dto.academicYearId,
        studentName: dto.studentName,
        nisn: dto.nisn ?? null,
        score: dto.score ?? null,
        result: dto.result ?? 'PENDING',
        notes: dto.notes ?? null,
        createdBy: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'tu.exam_record.create',
      entity: 'school_exam_record',
      entityId: rec.id,
    });
    return rec;
  }

  async updateExamRecord(id: string, dto: UpdateExamRecordDto, actorId: string) {
    const existing = await this.prisma.schoolExamRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Catatan tidak ditemukan.');
    const rec = await this.prisma.schoolExamRecord.update({
      where: { id },
      data: {
        ...(dto.studentName !== undefined ? { studentName: dto.studentName } : {}),
        ...(dto.nisn !== undefined ? { nisn: dto.nisn } : {}),
        ...(dto.score !== undefined ? { score: dto.score } : {}),
        ...(dto.result !== undefined ? { result: dto.result } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'tu.exam_record.update',
      entity: 'school_exam_record',
      entityId: id,
    });
    return rec;
  }

  async deleteExamRecord(id: string, actorId: string) {
    const existing = await this.prisma.schoolExamRecord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Catatan tidak ditemukan.');
    await this.prisma.schoolExamRecord.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'tu.exam_record.delete',
      entity: 'school_exam_record',
      entityId: id,
    });
  }

  /** Impor massal rekap US dari baris Excel (nama, nisn, nilai, hasil). */
  async importExamRecords(
    period: 'US1' | 'US2',
    academicYearId: string,
    rows: { studentName: string; nisn?: string; score?: number; result?: 'PENDING' | 'PASSED' | 'FAILED'; notes?: string }[],
    actorId: string,
  ) {
    const created = await this.prisma.schoolExamRecord.createMany({
      data: rows.map((r) => ({
        period,
        academicYearId,
        studentName: r.studentName,
        nisn: r.nisn ?? null,
        score: r.score ?? null,
        result: r.result ?? 'PENDING',
        notes: r.notes ?? null,
        createdBy: actorId,
      })),
    });
    await this.audit.log({
      actorId,
      action: 'tu.exam_record.import',
      entity: 'school_exam_record',
      metadata: { period, count: created.count },
    });
    return { count: created.count };
  }
}
