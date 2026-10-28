import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { Prisma, StudentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import type {
  AchievementDto,
  CreateStudentDto,
  MarkAttendanceDto,
  UpdateStudentDto,
  ViolationDto,
} from './dto/student.dto';

const studentSelect = {
  id: true,
  nis: true,
  nisn: true,
  name: true,
  gender: true,
  birthPlace: true,
  birthDate: true,
  address: true,
  status: true,
  candidateId: true,
  parentId: true,
  createdAt: true,
} satisfies Prisma.StudentSelect;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(q: {
    search?: string | undefined;
    status?: StudentStatus | undefined;
    classId?: string | undefined;
    take?: number | undefined;
  }) {
    const where: Prisma.StudentWhereInput = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { nis: { contains: q.search } },
        { nisn: { contains: q.search } },
      ];
    }
    if (q.classId) {
      where.enrollments = { some: { classId: q.classId } };
    }
    return this.prisma.student.findMany({
      where,
      select: studentSelect,
      orderBy: { name: 'asc' },
      take: Math.min(q.take ?? 100, 500),
    });
  }

  detail(id: string) {
    return this.prisma.student.findUniqueOrThrow({
      where: { id },
      include: {
        enrollments: {
          include: { class: true, academicYear: true },
          orderBy: { createdAt: 'desc' },
        },
        achievements: { orderBy: { createdAt: 'desc' } },
        violations: { orderBy: { date: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        parent: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async create(dto: CreateStudentDto, actorId: string) {
    // Duplicate detection: same NIS/NISN → hard conflict; same name +
    // birthDate → warn unless force.
    if (dto.nis) {
      const clash = await this.prisma.student.findUnique({
        where: { nis: dto.nis },
      });
      if (clash) throw new ConflictException(`NIS ${dto.nis} sudah terdaftar`);
    }
    if (dto.nisn) {
      const clash = await this.prisma.student.findUnique({
        where: { nisn: dto.nisn },
      });
      if (clash) throw new ConflictException(`NISN ${dto.nisn} sudah terdaftar`);
    }
    if (!dto.force && dto.birthDate) {
      const same = await this.prisma.student.findFirst({
        where: {
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          birthDate: new Date(dto.birthDate),
        },
      });
      if (same) {
        throw new ConflictException(
          `Siswa serupa ditemukan (${same.name}, id ${same.id}). Kirim force=true jika memang berbeda.`,
        );
      }
    }
    const student = await this.prisma.student.create({
      data: this.toData(dto),
      select: studentSelect,
    });
    await this.audit.log({
      actorId,
      action: 'student.create',
      entity: 'student',
      entityId: student.id,
    });
    return student;
  }

  async update(id: string, dto: UpdateStudentDto, actorId: string) {
    await this.prisma.student.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.student.update({
      where: { id },
      data: { ...this.toData(dto), ...(dto.status ? { status: dto.status } : {}) },
      select: studentSelect,
    });
    await this.audit.log({
      actorId,
      action: 'student.update',
      entity: 'student',
      entityId: id,
    });
    return updated;
  }

  /** Soft delete / archive. */
  async archive(id: string, actorId: string) {
    await this.prisma.student.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.student.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DROPPED' },
      select: { id: true, status: true },
    });
    await this.audit.log({
      actorId,
      action: 'student.archive',
      entity: 'student',
      entityId: id,
    });
    return updated;
  }

  // ---- achievements & violations ----
  addAchievement(studentId: string, dto: AchievementDto, _actorId: string) {
    return this.prisma.achievement.create({
      data: {
        studentId,
        title: dto.title,
        level: dto.level ?? null,
        year: dto.year ?? null,
        description: dto.description ?? null,
      },
    });
  }

  addViolation(studentId: string, dto: ViolationDto, _actorId: string) {
    return this.prisma.violation.create({
      data: {
        studentId,
        type: dto.type,
        description: dto.description ?? null,
        points: dto.points ?? 0,
        date: new Date(dto.date),
      },
    });
  }

  // ---- attendance ----
  async markAttendance(dto: MarkAttendanceDto, actorId: string) {
    const date = new Date(dto.date);
    const ops = dto.records.map((r) =>
      this.prisma.attendanceRecord.upsert({
        where: { studentId_date: { studentId: r.studentId, date } },
        create: {
          studentId: r.studentId,
          classId: dto.classId,
          date,
          status: r.status,
          note: r.note ?? null,
          takenBy: actorId,
        },
        update: { status: r.status, note: r.note ?? null, takenBy: actorId },
      }),
    );
    await this.prisma.$transaction(ops);
    await this.audit.log({
      actorId,
      action: 'attendance.mark',
      entity: 'class',
      entityId: dto.classId,
      metadata: { date: dto.date, count: dto.records.length },
    });
    return { marked: dto.records.length };
  }

  listAttendance(classId: string, date: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { classId, date: new Date(date) },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
  }

  private toData(dto: CreateStudentDto) {
    return {
      name: dto.name.trim(),
      nis: dto.nis ?? null,
      nisn: dto.nisn ?? null,
      gender: dto.gender ?? null,
      birthPlace: dto.birthPlace ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      address: dto.address ?? null,
      parentId: dto.parentId ?? null,
    };
  }
}
