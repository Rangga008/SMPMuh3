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
  ClassDto,
  CurriculumDto,
  EmployeeDto,
  EnrollmentDto,
  GradeDto,
  ScheduleEntryDto,
  SubjectDto,
  TeachingAssignmentDto,
  UpdateClassDto,
} from './dto/academic.dto';

@Injectable()
export class AcademicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Employees ----------
  listEmployees(type?: string, search?: string) {
    const where: Prisma.EmployeeWhereInput = {};
    if (type) where.type = type as 'TEACHER' | 'STAFF';
    if (search) where.name = { contains: search, mode: 'insensitive' };
    return this.prisma.employee.findMany({ where, orderBy: { name: 'asc' } });
  }

  async createEmployee(dto: EmployeeDto, actorId: string) {
    if (dto.nip) {
      const clash = await this.prisma.employee.findUnique({
        where: { nip: dto.nip },
      });
      if (clash) throw new ConflictException(`NIP ${dto.nip} sudah terdaftar`);
    }

    // Opsional: buat akun login sekaligus (butuh email/telepon + password + role).
    let userId: string | null = null;
    if (dto.password || dto.roleKey) {
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

    const emp = await this.prisma.employee.create({
      data: {
        name: dto.name.trim(),
        nip: dto.nip ?? null,
        type: dto.type ?? 'TEACHER',
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        isActive: dto.isActive ?? true,
        userId,
      },
    });
    await this.audit.log({ actorId, action: 'employee.create', entity: 'employee', entityId: emp.id });
    return emp;
  }

  async updateEmployee(id: string, dto: EmployeeDto, actorId: string) {
    await this.prisma.employee.findUniqueOrThrow({ where: { id } });
    const emp = await this.prisma.employee.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        nip: dto.nip ?? null,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'employee.update', entity: 'employee', entityId: id });
    return emp;
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
