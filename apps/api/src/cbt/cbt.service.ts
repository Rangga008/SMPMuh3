import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as XLSX from 'xlsx';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OpsService } from '../ops/ops.service';
import { StorageService } from '../core/storage/storage.service';
import type { AnswerDto, CreateExamDto, EnterExamDto, ExamSessionDto, LoginCbtDto, UpdateExamDto } from './dto/cbt.dto';

/** Alfabet tanpa karakter rancu (0/O/1/I/L) untuk kode ujian. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => {
  const b = randomBytes(8);
  const part = (o: number) =>
    Array.from({ length: 4 }, (_, i) => CODE_ALPHABET[b[o + i]! % CODE_ALPHABET.length]).join('');
  return `${part(0)}-${part(4)}`;
};

/** Skor satu butir — nilai parsial untuk PG kompleks & menjodohkan. */
function gradeAnswer(
  type: string,
  key: unknown,
  answer: unknown,
  weight: number,
): { isCorrect: boolean; score: number } {
  const zero = { isCorrect: false, score: 0 };
  if (answer === undefined || answer === null) return zero;
  if (type === 'MCQ') {
    const ok = Number(answer) === Number(key);
    return { isCorrect: ok, score: ok ? weight : 0 };
  }
  if (type === 'TRUE_FALSE') {
    const ok = Boolean(answer) === Boolean(key);
    return { isCorrect: ok, score: ok ? weight : 0 };
  }
  if (type === 'MCQ_COMPLEX') {
    const k = new Set((Array.isArray(key) ? key : []).map(Number));
    const a = Array.isArray(answer) ? answer.map(Number) : [];
    if (k.size === 0) return zero;
    const hits = a.filter((x) => k.has(x)).length;
    const score = Math.round((weight * hits) / k.size);
    return { isCorrect: score >= weight, score };
  }
  if (type === 'TRUE_FALSE_COMPLEX') {
    // B-S kompleks: key & answer = array boolean per pernyataan — skor parsial.
    // Pernyataan yang belum dijawab (bukan boolean) tak pernah dihitung benar.
    const k = Array.isArray(key) ? key.map(Boolean) : [];
    const a = Array.isArray(answer) ? answer : [];
    if (k.length === 0) return zero;
    const hits = k.filter((v, i) => typeof a[i] === 'boolean' && a[i] === v).length;
    const score = Math.round((weight * hits) / k.length);
    return { isCorrect: score >= weight, score };
  }
  if (type === 'MATCHING') {
    const k = Array.isArray(key) ? key.map(Number) : [];
    const a = Array.isArray(answer) ? answer.map(Number) : [];
    if (k.length === 0) return zero;
    const hits = k.filter((v, i) => a[i] === v).length;
    const score = Math.round((weight * hits) / k.length);
    return { isCorrect: score >= weight, score };
  }
  return zero;
}

@Injectable()
export class CbtService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private ops: OpsService,
    private storage: StorageService,
  ) {}

  // ================= Scope guru mapel =================

  /** Scope mengajar guru: kode/nama mapel serumpun + jenjang kelas yang diajar.
   *  null = bukan guru terhubung (staf/admin) — akses luas untuk baca. */
  private async teacherScope(user: AuthUser) {
    const emp = await this.prisma.employee.findUnique({
      where: { userId: user.id },
      include: {
        assignments: {
          include: {
            subject: { select: { id: true, code: true, name: true } },
            class: { select: { gradeLevel: true } },
          },
        },
      },
    });
    if (!emp || emp.type !== 'TEACHER' || !emp.assignments.length) return null;
    const codes = new Set(emp.assignments.map((a) => a.subject.code));
    const names = new Set(emp.assignments.map((a) => a.subject.name));
    const grades = new Set(emp.assignments.map((a) => a.class.gradeLevel));
    // Mapel serumpun: semua subject yang berbagi code atau nama dengan yang diajar.
    const family = await this.prisma.subject.findMany({
      where: { OR: [{ code: { in: [...codes] } }, { name: { in: [...names] } }] },
      select: { id: true },
    });
    return { codes, names, grades, familyIds: new Set(family.map((f) => f.id)) };
  }

  private async examForScope(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { assessment: { include: { subject: { select: { code: true, name: true } } } } },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    return exam;
  }

  private async targetGrades(classIds: string[]) {
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds } },
      select: { gradeLevel: true },
    });
    return [...new Set(classes.map((c) => c.gradeLevel))];
  }

  /** Gate scope ujian: admin/kurikulum bebas; guru hanya mapel serumpun
   *  pada jenjang yang diajar; staf non-guru boleh baca, tak boleh kelola. */
  private async scopeOk(user: AuthUser, examId: string, manage: boolean) {
    const exam = await this.examForScope(examId);
    if (user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)) return exam;
    const scope = await this.teacherScope(user);
    if (scope) {
      if (!scope.familyIds.has(exam.assessment.subjectId)) {
        throw new ForbiddenException('Ujian ini di luar mapel/jenjang yang Anda ajar.');
      }
      const gs = await this.targetGrades(exam.classIds as string[]);
      if (!gs.some((g) => scope.grades.has(g))) {
        throw new ForbiddenException('Ujian ini di luar jenjang kelas yang Anda ajar.');
      }
      return exam;
    }
    if (manage) throw new ForbiddenException('Hanya guru mapel / admin-kurikulum yang boleh mengubah.');
    return exam;
  }

  // ================= Admin: kelola ujian =================

  /** Daftar ujian — guru hanya melihat ujian mapel serumpun pada jenjangnya. */
  async listExams(user: AuthUser, academicYearId?: string) {
    const exams = await this.prisma.exam.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        assessment: {
          select: {
            id: true, name: true, type: true, subjectId: true,
            subject: { select: { name: true, code: true } },
            _count: { select: { questions: true } },
          },
        },
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)) return exams;
    const scope = await this.teacherScope(user);
    if (!scope) return exams;
    const byId = new Map(exams.map((e) => [e.id, e]));
    const grades = await this.prisma.class.findMany({
      where: { id: { in: [...new Set(exams.flatMap((e) => e.classIds as string[]))] } },
      select: { id: true, gradeLevel: true },
    });
    const gOf = new Map(grades.map((c) => [c.id, c.gradeLevel]));
    return exams.filter(
      (e) =>
        scope.familyIds.has(e.assessment.subjectId) &&
        (e.classIds as string[]).some((cid) => scope.grades.has(gOf.get(cid) ?? -1)),
    ).map((e) => byId.get(e.id)!);
  }

  /** Daftar ujian untuk monitor — semua staf (proktor/pengawas/tendik/guru/admin). */
  async listMonitorExams(academicYearId?: string) {
    const exams = await this.prisma.exam.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        assessment: { select: { name: true, subject: { select: { name: true } } } },
        _count: { select: { attempts: true } },
      },
      orderBy: { startAt: 'desc' },
    });
    // Lampirkan kelas+jenjang tiap ujian — untuk filter per jenjang di monitor.
    const ids = [...new Set(exams.flatMap((x) => x.classIds as string[]))];
    const cls = await this.prisma.class.findMany({
      where: { id: { in: ids } }, select: { id: true, name: true, gradeLevel: true },
    });
    const byId = new Map(cls.map((c) => [c.id, c]));
    return exams.map((x) => ({
      ...x,
      classes: (x.classIds as string[]).map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c),
    }));
  }

  async createExam(dto: CreateExamDto, actorId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: dto.assessmentId },
      include: {
        subject: { select: { name: true } },
        _count: { select: { questions: true } },
      },
    });
    if (!assessment) throw new NotFoundException('Asesmen tidak ditemukan.');
    if (assessment._count.questions === 0) {
      throw new ConflictException('Asesmen belum punya butir soal — susun dulu di halaman asesmen.');
    }
    const classes = await this.prisma.class.findMany({
      where: { id: { in: dto.classIds }, academicYearId: assessment.academicYearId },
      select: { id: true },
    });
    if (classes.length !== dto.classIds.length) {
      throw new BadRequestException('Ada kelas yang tidak dikenal / beda tahun ajaran dengan asesmen.');
    }
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (!(end > start)) throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
    const exam = await this.prisma.exam.create({
      data: {
        code: genCode(),
        title: dto.title?.trim() || assessment.name,
        instructions: dto.instructions ?? null,
        assessmentId: assessment.id,
        academicYearId: assessment.academicYearId,
        classIds: dto.classIds,
        startAt: start,
        endAt: end,
        durationMin: dto.durationMin,
        shuffle: dto.shuffle ?? false,
        showScore: dto.showScore ?? true,
        createdBy: actorId,
      },
      include: { assessment: { select: { name: true, subject: { select: { name: true } } } } },
    });
    await this.audit.log({ actorId, action: 'exam.create', entity: 'exam', entityId: exam.id });
    return exam;
  }

  async getExam(id: string, user?: AuthUser) {
    if (user) await this.scopeOk(user, id, false);
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        assessment: {
          include: {
            subject: { select: { name: true, code: true } },
            questions: { orderBy: { number: 'asc' } },
          },
        },
        sessions: { orderBy: { startAt: 'asc' } },
        attempts: {
          include: {
            student: { select: { id: true, name: true, nis: true } },
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    // Nama rombel per siswa (enrollment tahun ajaran ujian).
    const enrolls = await this.prisma.enrollment.findMany({
      where: { academicYearId: exam.academicYearId, studentId: { in: exam.attempts.map((a) => a.studentId) } },
      include: { class: { select: { name: true } } },
    });
    const clsOf = new Map(enrolls.map((e) => [e.studentId, e.class.name]));
    const clsNames = await this.prisma.class.findMany({
      where: { id: { in: exam.classIds as string[] } },
      select: { name: true },
    });
    // Boleh kelola (soal/sesi/nilai/edit)? admin·kurikulum atau guru dalam scope.
    let canManage = false;
    if (user) {
      if (user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)) {
        canManage = true;
      } else {
        const scope = await this.teacherScope(user);
        if (scope?.familyIds.has(exam.assessment.subjectId)) {
          const gs = await this.targetGrades(exam.classIds as string[]);
          canManage = gs.some((g) => scope.grades.has(g));
        }
      }
    }
    return {
      ...exam,
      classNames: clsNames.map((c) => c.name),
      canManage,
      attempts: exam.attempts.map((a) => ({
        ...a,
        token: undefined,
        student: { ...a.student, className: clsOf.get(a.studentId) ?? '—' },
      })),
    };
  }

  async updateExam(id: string, dto: UpdateExamDto, actor: AuthUser) {
    const exam = await this.scopeOk(actor, id, true);
    const start = dto.startAt ? new Date(dto.startAt) : exam.startAt;
    const end = dto.endAt ? new Date(dto.endAt) : exam.endAt;
    if (!(end > start)) throw new BadRequestException('Waktu selesai harus setelah waktu mulai.');
    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || exam.title } : {}),
        ...(dto.instructions !== undefined ? { instructions: dto.instructions || null } : {}),
        ...(dto.startAt !== undefined ? { startAt: start } : {}),
        ...(dto.endAt !== undefined ? { endAt: end } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.classIds !== undefined ? { classIds: dto.classIds } : {}),
        ...(dto.shuffle !== undefined ? { shuffle: dto.shuffle } : {}),
        ...(dto.showScore !== undefined ? { showScore: dto.showScore } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    // Ujian dibuka / rombel berubah → siapkan password semua peserta (kartu & login).
    if (dto.status === 'OPEN' || dto.classIds !== undefined) await this.ensureCredentials(id);
    await this.audit.log({ actorId: actor.id, action: 'exam.update', entity: 'exam', entityId: id });
    return updated;
  }

  /** Acak ulang password satu siswa — bila bocor/hilang, kartu dicetak ulang. */
  async regenCredential(examId: string, studentId: string, actor: AuthUser) {
    await this.scopeOk(actor, examId, true);
    const cred = await this.prisma.examCredential.upsert({
      where: { examId_studentId: { examId, studentId } },
      update: { password: this.genPassword() },
      create: { examId, studentId, password: this.genPassword() },
    });
    await this.audit.log({ actorId: actor.id, action: 'exam.credential-regen', entity: 'exam', entityId: examId, metadata: { studentId } });
    return { studentId, password: cred.password };
  }

  /** Kode baru — bila kode lama bocor, ganti tanpa hapus ujian. */
  async regenerateCode(id: string, actor: AuthUser) {
    await this.scopeOk(actor, id, true);
    const updated = await this.prisma.exam.update({
      where: { id },
      data: { code: genCode() },
      select: { id: true, code: true },
    });
    await this.audit.log({ actorId: actor.id, action: 'exam.regenerate-code', entity: 'exam', entityId: id });
    return updated;
  }

  async deleteExam(id: string, actor: AuthUser) {
    const exam = await this.scopeOk(actor, id, true).then((e) =>
      this.prisma.exam.findUniqueOrThrow({ where: { id: e.id }, include: { _count: { select: { attempts: true } } } }),
    );
    if (exam._count.attempts > 0) {
      throw new ConflictException(
        `Sudah ada ${exam._count.attempts} siswa mengerjakan — tutup ujian saja, jangan dihapus.`,
      );
    }
    await this.prisma.exam.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: 'exam.delete', entity: 'exam', entityId: id });
    return { ok: true };
  }

  // ================= Sesi ujian per kelompok rombel =================

  async createSession(examId: string, dto: ExamSessionDto, actor: AuthUser) {
    const exam = await this.scopeOk(actor, examId, true);
    this.validateSession(exam, dto);
    const s = await this.prisma.examSession.create({
      data: {
        examId,
        name: dto.name.trim(),
        classIds: dto.classIds,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'exam.session.create', entity: 'exam', entityId: examId, metadata: { session: s.name } });
    return s;
  }

  async updateSession(sessionId: string, dto: Partial<ExamSessionDto>, actor: AuthUser) {
    const s = await this.prisma.examSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { exam: { include: { assessment: { include: { subject: { select: { code: true, name: true } } } } } } },
    });
    await this.scopeOk(actor, s.examId, true);
    const merged = {
      name: dto.name ?? s.name,
      classIds: dto.classIds ?? (s.classIds as string[]),
      startAt: dto.startAt ?? s.startAt.toISOString(),
      endAt: dto.endAt ?? s.endAt.toISOString(),
    };
    this.validateSession(s.exam, merged);
    const updated = await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        name: merged.name.trim(),
        classIds: merged.classIds,
        startAt: new Date(merged.startAt),
        endAt: new Date(merged.endAt),
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'exam.session.update', entity: 'exam', entityId: s.examId, metadata: { session: s.name } });
    return updated;
  }

  async deleteSession(sessionId: string, actor: AuthUser) {
    const s = await this.prisma.examSession.findUniqueOrThrow({ where: { id: sessionId } });
    await this.scopeOk(actor, s.examId, true);
    await this.prisma.examSession.delete({ where: { id: sessionId } });
    await this.audit.log({ actorId: actor.id, action: 'exam.session.delete', entity: 'exam', entityId: s.examId, metadata: { session: s.name } });
    return { ok: true };
  }

  private validateSession(
    exam: { classIds: unknown },
    dto: { name: string; classIds: string[]; startAt: string; endAt: string },
  ) {
    if (!dto.name?.trim()) throw new BadRequestException('Nama sesi wajib.');
    if (!dto.classIds?.length) throw new BadRequestException('Pilih minimal satu rombel untuk sesi.');
    const allowed = new Set(exam.classIds as string[]);
    const bad = dto.classIds.filter((c) => !allowed.has(c));
    if (bad.length) throw new BadRequestException('Ada rombel sesi yang bukan peserta ujian.');
    if (!(new Date(dto.endAt) > new Date(dto.startAt))) {
      throw new BadRequestException('Waktu selesai sesi harus setelah waktu mulai.');
    }
  }

  // ================= Siswa: masuk & pengerjaan =================

  /** Login CBT: NIS + kode ujian → token sesi + info persiapan. */
  /** Password CBT — 6 karakter tanpa ambigu (0/O, 1/I/L), prefix "KP". */
  private genPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = 'KP';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  /** Pastikan semua siswa rombel peserta punya password ujian (dipakai saat OPEN + cetak kartu). */
  async ensureCredentials(examId: string) {
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    const classIds = (exam.classIds as string[]) ?? [];
    if (!classIds.length) return { created: 0 };
    const enrolled = await this.prisma.enrollment.findMany({
      where: { academicYearId: exam.academicYearId, classId: { in: classIds }, student: { status: 'ACTIVE', deletedAt: null } },
      select: { studentId: true },
    });
    const existing = await this.prisma.examCredential.findMany({ where: { examId }, select: { studentId: true } });
    const have = new Set(existing.map((e) => e.studentId));
    const missing = enrolled.filter((e) => !have.has(e.studentId));
    if (missing.length) {
      await this.prisma.examCredential.createMany({
        data: missing.map((e) => ({ examId, studentId: e.studentId, password: this.genPassword() })),
      });
    }
    // Password siswa (kartu baru) — isi yang masih kosong agar siap dicetak.
    const noPw = await this.prisma.student.findMany({
      where: { id: { in: enrolled.map((e) => e.studentId) }, password: null },
      select: { id: true },
    });
    for (const s of noPw) {
      await this.prisma.student.update({
        where: { id: s.id },
        data: { password: this.genPassword() },
      });
    }
    return { created: missing.length };
  }

  /** Password siswa untuk satu ujian — dibuat malas bila belum ada. */
  private async credentialFor(examId: string, studentId: string) {
    return (
      (await this.prisma.examCredential.findUnique({
        where: { examId_studentId: { examId, studentId } },
      })) ??
      (await this.prisma.examCredential.create({
        data: { examId, studentId, password: this.genPassword() },
      }))
    );
  }

  /** Login awal siswa: NIS + password kartu → identitas + daftar ujian aktif.
   *  Kode ujian TIDAK dikembalikan — siswa memasukkannya nanti dari pengawas.
   *  Password utama = students.password (kartu baru); kartu lama pakai
   *  ExamCredential per-ujian — keduanya diterima agar kartu terbit tetap jalan. */
  async login(dto: LoginCbtDto) {
    const nis = dto.nis.trim();
    const password = dto.password.trim().toUpperCase();
    const fail = new ForbiddenException('NIS atau password salah — cek kartu peserta ujianmu.');
    const student = await this.prisma.student.findFirst({
      where: { nis, status: 'ACTIVE', deletedAt: null },
    });
    if (!student) throw fail;

    const selfMatch = !!student.password && student.password.toUpperCase() === password;
    // Credential legacy (kartu lama, password per-ujian) — sekalian menentukan ujiannya.
    const cred = selfMatch
      ? null
      : await this.prisma.examCredential.findFirst({
          where: { studentId: student.id, password },
          include: { exam: { select: { id: true, status: true } } },
          orderBy: { exam: { startAt: 'desc' } },
        });
    if (!selfMatch && !cred) throw fail;
    if (cred?.exam.status === 'DRAFT') throw new ForbiddenException('Ujian belum dibuka pengawas.');
    if (cred?.exam.status === 'CLOSED') throw new ForbiddenException('Ujian sudah ditutup.');

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: student.id },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const classIds = enrollments.map((e) => e.class.id);

    // Ujian yang bisa diikuti siswa: status OPEN dan rombelnya termasuk peserta.
    const open = await this.prisma.exam.findMany({
      where: { status: 'OPEN' },
      include: {
        assessment: { include: { subject: { select: { name: true } } } },
        attempts: { where: { studentId: student.id }, select: { status: true } },
      },
      orderBy: { startAt: 'asc' },
    });
    const exams = open
      .filter((e) => (e.classIds as string[]).some((cid) => classIds.includes(cid)))
      .map((e) => ({
        title: e.title,
        subject: e.assessment.subject.name,
        startAt: e.startAt,
        endAt: e.endAt,
        attemptStatus: e.attempts[0]?.status ?? null,
      }));
    // Fallback bila login via credential legacy dan ujiannya tak tampil di daftar.
    if (!exams.length && cred) {
      const exam = await this.prisma.exam.findUniqueOrThrow({
        where: { id: cred.exam.id },
        include: { assessment: { include: { subject: { select: { name: true } } } } },
      });
      exams.push({
        title: exam.title,
        subject: exam.assessment.subject.name,
        startAt: exam.startAt,
        endAt: exam.endAt,
        attemptStatus: null,
      });
    }
    // Jadwal lengkap untuk rombel siswa (semua status, 60 hari ke belakang → depan).
    const since = new Date(Date.now() - 60 * 86400_000);
    const scheduled = await this.prisma.exam.findMany({
      where: { startAt: { gte: since } },
      include: {
        assessment: { include: { subject: { select: { name: true } } } },
        attempts: { where: { studentId: student.id }, select: { status: true, score: true, maxScore: true, submittedAt: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 60,
    });
    const myExams = scheduled.filter((e) => (e.classIds as string[]).some((cid) => classIds.includes(cid)));
    const schedule = myExams.map((e) => ({
      title: e.title,
      subject: e.assessment.subject.name,
      status: e.status,
      startAt: e.startAt,
      endAt: e.endAt,
      attemptStatus: e.attempts[0]?.status ?? null,
    }));
    const history = myExams
      .filter((e) => e.attempts[0]?.submittedAt)
      .map((e) => ({
        title: e.title,
        subject: e.assessment.subject.name,
        submittedAt: e.attempts[0]!.submittedAt,
        score: e.showScore ? e.attempts[0]!.score : null,
        maxScore: e.attempts[0]!.maxScore,
      }));
    return {
      student: {
        name: student.name,
        nis: student.nis,
        className: enrollments[0]?.class.name ?? '—',
      },
      exams,
      schedule,
      history,
    };
  }

  async enter(dto: EnterExamDto) {
    const nis = dto.nis.trim();
    const code = dto.code.trim().toUpperCase();
    const exam = await this.prisma.exam.findUnique({
      where: { code },
      include: {
        assessment: { include: { subject: { select: { name: true } } } },
        sessions: { orderBy: { startAt: 'asc' } },
      },
    });
    if (!exam) throw new NotFoundException('Kode ujian tidak dikenal.');
    if (exam.status === 'DRAFT') throw new ForbiddenException('Ujian belum dibuka pengawas.');
    if (exam.status === 'CLOSED') throw new ForbiddenException('Ujian sudah ditutup.');
    const now = new Date();
    const fmt = (d: Date) => d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    if (now < exam.startAt) {
      throw new ForbiddenException(`Ujian baru dimulai ${fmt(exam.startAt)} WIB.`);
    }
    if (now > exam.endAt) throw new ForbiddenException('Waktu ujian sudah berakhir.');

    const student = await this.prisma.student.findFirst({
      where: { nis, status: 'ACTIVE', deletedAt: null },
      include: {
        enrollments: {
          where: { academicYearId: exam.academicYearId },
          include: { class: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    });
    if (!student) throw new NotFoundException('NIS tidak ditemukan / siswa tidak aktif.');
    const enroll = student.enrollments[0];
    const allowed = (exam.classIds as string[]).includes(enroll?.classId ?? '');
    if (!enroll || !allowed) {
      throw new ForbiddenException(
        `Siswa ini tidak terdaftar pada rombel peserta ujian${enroll ? ` (rombelmu: ${enroll.class.name})` : ''}.`,
      );
    }

    // Gate sesi: bila ujian punya sesi per kelompok rombel, siswa hanya bisa
    // masuk dalam jendela sesi rombelnya — deadline juga mengikuti akhir sesi.
    let windowEnd = exam.endAt;
    if (exam.sessions.length) {
      const session = exam.sessions.find((s) => (s.classIds as string[]).includes(enroll.class.id));
      if (!session) {
        throw new ForbiddenException(`Rombel ${enroll.class.name} tidak dijadwalkan pada sesi ujian ini.`);
      }
      if (now < session.startAt) {
        throw new ForbiddenException(`Sesi ${session.name} untuk rombelmu baru dimulai ${fmt(session.startAt)} WIB.`);
      }
      if (now > session.endAt) {
        throw new ForbiddenException(`Sesi ${session.name} untuk rombelmu sudah berakhir ${fmt(session.endAt)} WIB.`);
      }
      windowEnd = session.endAt;
    }

    // Password ujian — di kartu peserta; terima password siswa (kartu baru)
    // maupun credential per-ujian (kartu lama).
    const pw = (dto.password ?? '').trim().toUpperCase();
    const cred = await this.prisma.examCredential.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
    });
    const ok =
      (!!student.password && student.password.toUpperCase() === pw) ||
      (!!cred && cred.password.toUpperCase() === pw);
    if (!ok) {
      throw new ForbiddenException('Password ujian salah — cek kartu peserta ujianmu.');
    }

    const attempt = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
    });
    if (attempt?.status === 'SUBMITTED') {
      throw new ConflictException('Kamu sudah menyelesaikan ujian ini.');
    }
    if (!attempt) {
      const deadline = new Date(
        Math.min(now.getTime() + exam.durationMin * 60_000, windowEnd.getTime()),
      );
      await this.prisma.examAttempt.create({
        data: { examId: exam.id, studentId: student.id, deadline },
      });
    }
    // Hitung setiap masuk — sinyal keluar-masuk untuk monitor pelanggaran.
    const fresh = await this.prisma.examAttempt.update({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
      data: { enterCount: { increment: 1 } },
    });
    return this.buildSession(fresh, exam, student, enroll.class.name);
  }

  private async buildSession(
    attempt: { id: string; token: string; status: string; startedAt: Date; deadline: Date },
    exam: {
      id: string; assessmentId: string; title: string; instructions: string | null;
      durationMin: number; startAt: Date; endAt: Date; showScore: boolean;
      assessment: { name: string; subject: { name: string } };
    },
    student: { name: string; nis: string | null },
    className: string,
  ) {
    const qCount = await this.prisma.assessmentQuestion.count({
      where: { assessmentId: exam.assessmentId },
    });
    return {
      token: attempt.token,
      exam: {
        title: exam.title,
        subject: exam.assessment.subject.name,
        instructions: exam.instructions,
        durationMin: exam.durationMin,
        startAt: exam.startAt,
        endAt: exam.endAt,
        totalQuestions: qCount,
      },
      student: { name: student.name, nis: student.nis, className },
      attempt: {
        status: attempt.status,
        startedAt: attempt.startedAt,
        deadline: attempt.deadline,
        remainingSec: Math.max(0, Math.floor((attempt.deadline.getTime() - Date.now()) / 1000)),
      },
    };
  }

  /** Ambil sesi untuk halaman persiapan — tanpa membuat attempt baru. */
  async sessionByToken(token: string) {
    const attempt = await this.attemptOrThrow(token);
    const exam = await this.prisma.exam.findUniqueOrThrow({
      where: { id: attempt.examId },
      include: { assessment: { include: { subject: { select: { name: true } } } } },
    });
    const student = await this.prisma.student.findUniqueOrThrow({
      where: { id: attempt.studentId },
      include: {
        enrollments: {
          where: { academicYearId: exam.academicYearId },
          include: { class: { select: { name: true } } },
          take: 1,
        },
      },
    });
    return this.buildSession(attempt, exam, student, student.enrollments[0]?.class.name ?? '—');
  }

  private async attemptOrThrow(token: string) {
    const attempt = await this.prisma.examAttempt.findUnique({ where: { token } });
    if (!attempt) throw new NotFoundException('Sesi ujian tidak ditemukan — masuk ulang dengan NIS & kode.');
    return attempt;
  }

  /** Kedaluwarsa → nilai jawaban yang tersimpan & tutup sesi otomatis. */
  private async ensureLive(attempt: { id: string; status: string; deadline: Date }) {
    if (attempt.status === 'SUBMITTED') {
      throw new ConflictException('Ujian sudah dikumpulkan.');
    }
    if (Date.now() > attempt.deadline.getTime()) {
      await this.finalize(attempt.id);
      throw new ConflictException('Waktu habis — jawabanmu otomatis dikumpulkan.');
    }
  }

  /** Daftar soal (tanpa kunci) + jawaban tersimpan — untuk halaman pengerjaan. */
  async paper(token: string) {
    const attempt = await this.attemptOrThrow(token);
    await this.ensureLive(attempt);
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: attempt.examId } });
    const [questions, answers] = await Promise.all([
      this.prisma.assessmentQuestion.findMany({
        where: { assessmentId: exam.assessmentId },
        orderBy: { number: 'asc' },
        select: { id: true, number: true, type: true, weight: true, prompt: true, options: true, passageCode: true, media: true },
      }),
      this.prisma.examAnswer.findMany({
        where: { attemptId: attempt.id },
        select: { questionId: true, answer: true },
      }),
    ]);
    // Bacaan yang dirujuk soal — kirim sekali per kode.
    const codes = [...new Set(questions.map((q) => q.passageCode).filter((c): c is string => !!c))];
    const passages = codes.length
      ? await this.prisma.assessmentPassage.findMany({ where: { assessmentId: exam.assessmentId, code: { in: codes } }, select: { code: true, content: true, media: true } })
      : [];
    // Acak deterministik per attempt bila diminta — hash sederhana id+token.
    const ordered = exam.shuffle
      ? [...questions].sort((a, b) => this.seedOf(a.id, token) - this.seedOf(b.id, token))
      : questions;
    return {
      questions: ordered,
      passages,
      answers: Object.fromEntries(answers.map((a) => [a.questionId, a.answer])),
      deadline: attempt.deadline,
      serverNow: new Date(),
      remainingSec: Math.max(0, Math.floor((attempt.deadline.getTime() - Date.now()) / 1000)),
    };
  }

  private seedOf(id: string, token: string) {
    let h = 0;
    const s = id + token;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  /** Autosave satu jawaban. */
  async saveAnswer(token: string, dto: AnswerDto) {
    const attempt = await this.attemptOrThrow(token);
    await this.ensureLive(attempt);
    const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: attempt.examId } });
    const q = await this.prisma.assessmentQuestion.findFirst({
      where: { id: dto.questionId, assessmentId: exam.assessmentId },
    });
    if (!q) throw new BadRequestException('Soal tidak dikenal.');
    await this.prisma.examAnswer.upsert({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId: q.id } },
      update: { answer: dto.answer === undefined ? Prisma.JsonNull : (dto.answer as Prisma.InputJsonValue) },
      create: {
        attemptId: attempt.id,
        questionId: q.id,
        answer: dto.answer === undefined ? Prisma.JsonNull : (dto.answer as Prisma.InputJsonValue),
      },
    });
    return { saved: true };
  }

  /** Kumpulkan & nilai — juga menyalin hasil ke StudentAnswer + Grade asesmen. */
  async submit(token: string) {
    const attempt = await this.attemptOrThrow(token);
    if (attempt.status === 'SUBMITTED') {
      const exam = await this.prisma.exam.findUniqueOrThrow({ where: { id: attempt.examId } });
      return { submitted: true, score: exam.showScore ? attempt.score : null, maxScore: attempt.maxScore };
    }
    return this.finalize(attempt.id);
  }

  private async finalize(attemptId: string) {
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.examAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: { exam: { include: { assessment: true } } },
      });
      if (attempt.status === 'SUBMITTED') {
        return { submitted: true, score: attempt.exam.showScore ? attempt.score : null, maxScore: attempt.maxScore };
      }
      const questions = await tx.assessmentQuestion.findMany({
        where: { assessmentId: attempt.exam.assessmentId },
      });
      const answers = await tx.examAnswer.findMany({ where: { attemptId } });
      const byQ = new Map(answers.map((a) => [a.questionId, a]));
      let score = 0;
      let maxScore = 0;
      for (const q of questions) {
        maxScore += q.weight;
        const g = gradeAnswer(q.type, q.key, byQ.get(q.id)?.answer ?? null, q.weight);
        score += g.score;
        await tx.examAnswer.upsert({
          where: { attemptId_questionId: { attemptId, questionId: q.id } },
          update: { isCorrect: g.isCorrect, score: g.score },
          create: { attemptId, questionId: q.id, isCorrect: g.isCorrect, score: g.score },
        });
        // Salin ke StudentAnswer → analisis butir & input manual tetap terpusat.
        await tx.studentAnswer.upsert({
          where: { questionId_studentId: { questionId: q.id, studentId: attempt.studentId } },
          update: {
            answer: byQ.get(q.id)?.answer ?? Prisma.JsonNull,
            isCorrect: g.isCorrect,
            score: g.score,
          },
          create: {
            questionId: q.id,
            studentId: attempt.studentId,
            answer: byQ.get(q.id)?.answer ?? Prisma.JsonNull,
            isCorrect: g.isCorrect,
            score: g.score,
          },
        });
      }
      // Skala ke maxScore asesmen → masuk buku nilai (Grade).
      const scale = attempt.exam.assessment.maxScore || 100;
      const gradeScore = maxScore > 0 ? Math.round((score / maxScore) * scale) : 0;
      await tx.grade.upsert({
        where: {
          assessmentId_studentId: { assessmentId: attempt.exam.assessmentId, studentId: attempt.studentId },
        },
        update: { score: gradeScore },
        create: { assessmentId: attempt.exam.assessmentId, studentId: attempt.studentId, score: gradeScore },
      });
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: { status: 'SUBMITTED', submittedAt: new Date(), score, maxScore },
      });
      return {
        submitted: true,
        score: attempt.exam.showScore ? score : null,
        maxScore,
        gradeScore,
      };
    });
  }

  /** Hasil akhir untuk halaman siswa. */
  async result(token: string) {
    const attempt = await this.attemptOrThrow(token);
    const exam = await this.prisma.exam.findUniqueOrThrow({
      where: { id: attempt.examId },
      include: { assessment: { include: { subject: { select: { name: true } } } } },
    });
    return {
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      examTitle: exam.title,
      subject: exam.assessment.subject.name,
      score: attempt.status === 'SUBMITTED' && exam.showScore ? attempt.score : null,
      maxScore: attempt.status === 'SUBMITTED' && exam.showScore ? attempt.maxScore : null,
    };
  }

  // ================= Monitor / hasil / analisis =================

  private async examClasses(exam: { academicYearId: string; classIds: unknown }) {
    const classes = await this.prisma.class.findMany({
      where: { id: { in: exam.classIds as string[] } },
      select: { id: true, name: true, gradeLevel: true },
      orderBy: { name: 'asc' },
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        academicYearId: exam.academicYearId,
        classId: { in: classes.map((c) => c.id) },
        student: { status: 'ACTIVE' },
      },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
    return { classes, enrollments };
  }

  /** Monitor live per rombel — siapa masuk/sedang/selesai/belum + jawaban terisi. */
  async monitor(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        sessions: { orderBy: { startAt: 'asc' } },
        attempts: {
          include: {
            student: { select: { id: true } },
            _count: { select: { answers: { where: { NOT: { answer: { equals: Prisma.JsonNull } } } } } },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    const { classes, enrollments } = await this.examClasses(exam);
    const byStudent = new Map(exam.attempts.map((a) => [a.studentId, a]));
    const now = Date.now();
    return {
      examId,
      sessions: exam.sessions,
      classes: classes.map((c) => {
        const session = exam.sessions.find((s) => (s.classIds as string[]).includes(c.id));
        const students = enrollments
          .filter((e) => e.classId === c.id)
          .map((e) => {
            const a = byStudent.get(e.student.id);
            // Heuristik pelanggaran: submit terlalu cepat, tanpa jawaban, masuk berkali-kali.
            const flags: string[] = [];
            if (a?.status === 'SUBMITTED' && a.submittedAt && exam.durationMin > 0) {
              const usedMin = (a.submittedAt.getTime() - a.startedAt.getTime()) / 60_000;
              if (usedMin < exam.durationMin * 0.2) flags.push('SELESAI_CEPAT');
              if ((a._count?.answers ?? 0) === 0) flags.push('TANPA_JAWABAN');
            }
            if ((a?.enterCount ?? 0) > 2) flags.push('MASUK_BERKALI');
            return {
              studentId: e.student.id,
              name: e.student.name,
              nis: e.student.nis,
              status: !a ? 'BELUM' : a.status === 'SUBMITTED' ? 'SELESAI' : 'MENGERJAKAN',
              answered: a?._count.answers ?? 0,
              startedAt: a?.startedAt ?? null,
              submittedAt: a?.submittedAt ?? null,
              remainingSec: a && a.status === 'STARTED' ? Math.max(0, Math.floor((a.deadline.getTime() - now) / 1000)) : null,
              score: a?.status === 'SUBMITTED' ? a.score : null,
              maxScore: a?.status === 'SUBMITTED' ? a.maxScore : null,
              enterCount: a?.enterCount ?? 0,
              flags,
            };
          });
        return {
          classId: c.id,
          className: c.name,
          gradeLevel: c.gradeLevel,
          session: session ? { name: session.name, startAt: session.startAt, endAt: session.endAt } : null,
          total: students.length,
          done: students.filter((s) => s.status === 'SELESAI').length,
          working: students.filter((s) => s.status === 'MENGERJAKAN').length,
          violations: students.filter((s) => s.flags.length > 0).length,
          students,
        };
      }),
    };
  }

  /** Rekap nilai per rombel — semua siswa terdaftar + skor & nilai ledger. */
  async results(examId: string, classId: string | undefined, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, false);
    const { classes, enrollments } = await this.examClasses(exam);
    const classIds = classId ? [classId] : classes.map((c) => c.id);
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, studentId: { in: enrollments.filter((e) => classIds.includes(e.classId)).map((e) => e.studentId) } },
    });
    const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
    const grades = await this.prisma.grade.findMany({
      where: { assessmentId: exam.assessmentId, studentId: { in: enrollments.map((e) => e.studentId) } },
    });
    const gradeOf = new Map(grades.map((g) => [g.studentId, g.score]));
    const maxScore = attempts.reduce((m, a) => Math.max(m, a.maxScore ?? 0), 0);
    const scale = exam.assessment.maxScore || 100;
    // Fallback: Grade belum tertulis (attempt lama) → hitung dari skor mentah.
    const gradeFor = (studentId: string, a: (typeof attempts)[number] | undefined) => {
      const g = gradeOf.get(studentId);
      if (g != null) return g;
      if (a?.status === 'SUBMITTED' && a.score != null && a.maxScore) {
        return Math.round((a.score / a.maxScore) * scale);
      }
      return null;
    };
    return {
      exam: { id: exam.id, title: exam.title, assessmentId: exam.assessmentId, maxScore },
      classes: classes
        .filter((c) => classIds.includes(c.id))
        .map((c) => ({
          classId: c.id,
          className: c.name,
          gradeLevel: c.gradeLevel,
          students: enrollments
            .filter((e) => e.classId === c.id)
            .map((e) => {
              const a = byStudent.get(e.student.id);
              return {
                studentId: e.student.id,
                name: e.student.name,
                nis: e.student.nis,
                status: !a ? 'BELUM' : a.status,
                score: a?.status === 'SUBMITTED' ? a.score : null,
                maxScore: a?.status === 'SUBMITTED' ? a.maxScore : null,
                gradeScore: gradeFor(e.student.id, a),
                submittedAt: a?.submittedAt ?? null,
              };
            }),
        })),
    };
  }

  /** Analisis butir per rombel — % benar, tersukar/termudah. */
  async analysis(examId: string, classId: string | undefined, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, false);
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: exam.assessmentId },
      orderBy: { number: 'asc' },
    });
    let studentIds: string[] | undefined;
    if (classId) {
      const enr = await this.prisma.enrollment.findMany({
        where: { classId, academicYearId: exam.academicYearId, student: { status: 'ACTIVE' } },
        select: { studentId: true },
      });
      studentIds = enr.map((e) => e.studentId);
    }
    const answers = await this.prisma.examAnswer.findMany({
      where: {
        questionId: { in: questions.map((q) => q.id) },
        attempt: { examId, status: 'SUBMITTED', ...(studentIds ? { studentId: { in: studentIds } } : {}) },
      },
    });
    const byQ = new Map<string, typeof answers>();
    for (const a of answers) {
      const arr = byQ.get(a.questionId) ?? [];
      arr.push(a);
      byQ.set(a.questionId, arr);
    }
    const rows = questions.map((q) => {
      const ans = byQ.get(q.id) ?? [];
      const correct = ans.filter((a) => a.isCorrect === true).length;
      const avg = ans.length ? ans.reduce((s, a) => s + a.score, 0) / ans.length : 0;
      return {
        id: q.id, number: q.number, type: q.type, weight: q.weight,
        prompt: q.prompt, key: q.key, options: q.options,
        answered: ans.length, correct,
        correctPct: ans.length ? Math.round((correct / ans.length) * 100) : null,
        avgScore: Math.round(avg * 100) / 100,
        difficulty: ans.length ? (avg / q.weight >= 0.75 ? 'Mudah' : avg / q.weight >= 0.4 ? 'Sedang' : 'Sukar') : null,
      };
    });
    return {
      questions: rows,
      easiest: rows.filter((r) => r.correctPct !== null).sort((a, b) => b.correctPct! - a.correctPct!).slice(0, 5),
      hardest: rows.filter((r) => r.correctPct !== null).sort((a, b) => a.correctPct! - b.correctPct!).slice(0, 5),
    };
  }

  /** Matriks jawaban siswa × soal untuk satu rombel (rekap jawaban). */
  async answerMatrix(examId: string, classId: string, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, false);
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId: exam.assessmentId },
      orderBy: { number: 'asc' },
      select: { id: true, number: true, type: true, weight: true, key: true, prompt: true },
    });
    const enr = await this.prisma.enrollment.findMany({
      where: { classId, academicYearId: exam.academicYearId, student: { status: 'ACTIVE' } },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId, studentId: { in: enr.map((e) => e.studentId) } },
      include: { answers: true },
    });
    const aByStudent = new Map(attempts.map((a) => [a.studentId, a]));
    return {
      questions,
      students: enr.map((e) => {
        const att = aByStudent.get(e.student.id);
        const byQ = new Map(att?.answers.map((a) => [a.questionId, a]) ?? []);
        return {
          studentId: e.student.id,
          name: e.student.name,
          nis: e.student.nis,
          status: !att ? 'BELUM' : att.status,
          score: att?.status === 'SUBMITTED' ? att.score : null,
          cells: questions.map((q) => {
            const a = byQ.get(q.id);
            return a ? { answer: a.answer, isCorrect: a.isCorrect, score: a.score } : null;
          }),
        };
      }),
    };
  }

  /** Ekspor Excel: Rekap Nilai per rombel + Analisis Butir + Rekap Jawaban. */
  async resultsExcel(examId: string, classId: string | undefined, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, false);
    const [res, ana] = await Promise.all([
      this.results(examId, classId, user),
      this.analysis(examId, classId, user),
    ]);
    const wb = XLSX.utils.book_new();
    // Sheet 1 — rekap nilai semua rombel terpilih
    const rows: (string | number)[][] = [['Rombel', 'NIS', 'Nama', 'Status', 'Skor', 'Skor Maks', 'Nilai Akhir', 'Dikumpulkan']];
    for (const c of res.classes) {
      for (const s of c.students) {
        rows.push([
          c.className, s.nis ?? '', s.name,
          s.status === 'SUBMITTED' ? 'Selesai' : s.status === 'STARTED' ? 'Mengerjakan' : 'Belum',
          s.score ?? '', s.maxScore ?? '', s.gradeScore ?? '',
          s.submittedAt ? new Date(s.submittedAt).toLocaleString('id-ID') : '',
        ]);
      }
    }
    const ws1 = XLSX.utils.aoa_to_sheet(rows);
    ws1['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Nilai');
    // Sheet 2 — analisis butir
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['No', 'Tipe', 'Soal', 'Bobot', 'Terjawab', 'Benar', '% Benar', 'Rata-rata', 'Tingkat'],
      ...ana.questions.map((q) => [
        q.number, q.type, (q.prompt ?? '').slice(0, 200), q.weight, q.answered, q.correct,
        q.correctPct ?? '', q.avgScore, q.difficulty ?? '',
      ] as (string | number)[]),
    ]);
    ws2['!cols'] = [{ wch: 4 }, { wch: 10 }, { wch: 60 }, { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 7 }, { wch: 8 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Analisis Butir');
    // Sheet 3 — rekap jawaban (bila rombel tunggal)
    if (res.classes.length === 1 && classId) {
      const mx = await this.answerMatrix(examId, classId, user);
      const ws3 = XLSX.utils.aoa_to_sheet([
        ['NIS', 'Nama', ...mx.questions.map((q) => `S${q.number}`), 'Skor'],
        ...mx.students.map((s) => [
          s.nis ?? '', s.name,
          ...s.cells.map((c) => (c === null ? '' : c.isCorrect === true ? 'B' : c.isCorrect === false ? 'S' : '·')),
          s.score ?? '',
        ] as (string | number)[]),
      ]);
      ws3['!cols'] = [{ wch: 12 }, { wch: 30 }, ...mx.questions.map(() => ({ wch: 4 })), { wch: 8 }];
      XLSX.utils.book_append_sheet(wb, ws3, `Jawaban ${res.classes[0]!.className}`);
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** Edit nilai akhir di ledger (Grade) — guru mapel scope / admin. */
  async updateGrade(examId: string, studentId: string, score: number, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, true);
    const scale = (await this.prisma.assessment.findUniqueOrThrow({ where: { id: exam.assessmentId } })).maxScore || 100;
    if (score < 0 || score > scale) {
      throw new BadRequestException(`Nilai harus 0–${scale}.`);
    }
    const grade = await this.prisma.grade.upsert({
      where: { assessmentId_studentId: { assessmentId: exam.assessmentId, studentId } },
      update: { score: Math.round(score) },
      create: { assessmentId: exam.assessmentId, studentId, score: Math.round(score) },
    });
    await this.audit.log({
      actorId: user.id, action: 'exam.grade-update', entity: 'exam', entityId: examId,
      metadata: { studentId, score: Math.round(score), assessmentId: exam.assessmentId },
    });
    return grade;
  }

  // ================= Soal ujian (milik asesmen terkait) =================

  async examQuestions(examId: string, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, false);
    return this.ops.listQuestions(exam.assessmentId);
  }

  async setExamQuestions(examId: string, questions: Parameters<OpsService['setQuestions']>[1], user: AuthUser) {
    const exam = await this.scopeOk(user, examId, true);
    for (const q of questions) {
      if (!['MCQ', 'MCQ_COMPLEX', 'TRUE_FALSE', 'TRUE_FALSE_COMPLEX'].includes(q.type)) {
        throw new BadRequestException(`Tipe soal ${q.type} tidak didukung — hanya PG/PGK/BS/BSK.`);
      }
    }
    const r = await this.ops.setQuestions(exam.assessmentId, questions);
    await this.audit.log({ actorId: user.id, action: 'exam.questions-set', entity: 'exam', entityId: examId, metadata: { count: r.count } });
    return r;
  }

  async importExamQuestions(examId: string, file: Express.Multer.File, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, true);
    const name = file.originalname.toLowerCase();
    let questions: Parameters<OpsService['setQuestions']>[1];
    let passages: Parameters<OpsService['setQuestions']>[2];
    if (name.endsWith('.docx')) {
      const r = await this.ops.parseQuestionDocx(file);
      questions = r.questions; passages = r.passages;
    } else {
      questions = this.ops.parseQuestionWorkbook(file);
      passages = this.ops.parsePassageSheet(file);
    }
    for (const q of questions) {
      if (!['MCQ', 'MCQ_COMPLEX', 'TRUE_FALSE', 'TRUE_FALSE_COMPLEX'].includes(q.type)) {
        throw new BadRequestException(`Tipe soal ${q.type} tidak didukung — hanya PG/PGK/BS/BSK.`);
      }
    }
    const r = await this.ops.setQuestions(exam.assessmentId, questions, passages);
    await this.audit.log({ actorId: user.id, action: 'exam.questions-import', entity: 'exam', entityId: examId, metadata: { count: r.count } });
    return r;
  }

  async examPassages(examId: string, user: AuthUser) {
    const exam = await this.scopeOk(user, examId, false);
    return this.ops.listPassages(exam.assessmentId);
  }

  /** Gambar soal/bacaan hasil impor — key `qmedia/<uuid>.<ext>`. */
  async questionMedia(key: string) {
    if (!/^qmedia\/[\w-]+\.(png|jpe?g|gif|webp)$/i.test(key)) throw new BadRequestException('Key media tidak valid.');
    const buf = await this.storage.getObjectBuffer(key);
    const mime = /jpe?g$/i.test(key) ? 'image/jpeg' : `image/${key.split('.').pop()}`;
    return { buf, mime };
  }
}
