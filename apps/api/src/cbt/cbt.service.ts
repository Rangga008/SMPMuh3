import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../core/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AnswerDto, CreateExamDto, EnterExamDto, UpdateExamDto } from './dto/cbt.dto';

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
  ) {}

  // ================= Admin: kelola ujian =================

  listExams(academicYearId?: string) {
    return this.prisma.exam.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        assessment: {
          select: {
            id: true, name: true, type: true,
            subject: { select: { name: true, code: true } },
            _count: { select: { questions: true } },
          },
        },
        _count: { select: { attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

  async getExam(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        assessment: {
          include: {
            subject: { select: { name: true, code: true } },
            questions: { orderBy: { number: 'asc' } },
          },
        },
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
    return {
      ...exam,
      classNames: clsNames.map((c) => c.name),
      attempts: exam.attempts.map((a) => ({
        ...a,
        token: undefined,
        student: { ...a.student, className: clsOf.get(a.studentId) ?? '—' },
      })),
    };
  }

  async updateExam(id: string, dto: UpdateExamDto, actorId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
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
    await this.audit.log({ actorId, action: 'exam.update', entity: 'exam', entityId: id });
    return updated;
  }

  /** Kode baru — bila kode lama bocor, ganti tanpa hapus ujian. */
  async regenerateCode(id: string, actorId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    const updated = await this.prisma.exam.update({
      where: { id },
      data: { code: genCode() },
      select: { id: true, code: true },
    });
    await this.audit.log({ actorId, action: 'exam.regenerate-code', entity: 'exam', entityId: id });
    return updated;
  }

  async deleteExam(id: string, actorId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: { _count: { select: { attempts: true } } },
    });
    if (!exam) throw new NotFoundException('Ujian tidak ditemukan.');
    if (exam._count.attempts > 0) {
      throw new ConflictException(
        `Sudah ada ${exam._count.attempts} siswa mengerjakan — tutup ujian saja, jangan dihapus.`,
      );
    }
    await this.prisma.exam.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'exam.delete', entity: 'exam', entityId: id });
    return { ok: true };
  }

  // ================= Siswa: masuk & pengerjaan =================

  /** Login CBT: NIS + kode ujian → token sesi + info persiapan. */
  async enter(dto: EnterExamDto) {
    const nis = dto.nis.trim();
    const code = dto.code.trim().toUpperCase();
    const exam = await this.prisma.exam.findUnique({
      where: { code },
      include: {
        assessment: { include: { subject: { select: { name: true } } } },
      },
    });
    if (!exam) throw new NotFoundException('Kode ujian tidak dikenal.');
    if (exam.status === 'DRAFT') throw new ForbiddenException('Ujian belum dibuka pengawas.');
    if (exam.status === 'CLOSED') throw new ForbiddenException('Ujian sudah ditutup.');
    const now = new Date();
    if (now < exam.startAt) {
      throw new ForbiddenException(
        `Ujian baru dimulai ${exam.startAt.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`,
      );
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

    const attempt = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
    });
    if (attempt?.status === 'SUBMITTED') {
      throw new ConflictException('Kamu sudah menyelesaikan ujian ini.');
    }
    if (!attempt) {
      const deadline = new Date(
        Math.min(now.getTime() + exam.durationMin * 60_000, exam.endAt.getTime()),
      );
      await this.prisma.examAttempt.create({
        data: { examId: exam.id, studentId: student.id, deadline },
      });
    }
    const fresh = await this.prisma.examAttempt.findUniqueOrThrow({
      where: { examId_studentId: { examId: exam.id, studentId: student.id } },
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
        select: { id: true, number: true, type: true, weight: true, prompt: true, options: true },
      }),
      this.prisma.examAnswer.findMany({
        where: { attemptId: attempt.id },
        select: { questionId: true, answer: true },
      }),
    ]);
    // Acak deterministik per attempt bila diminta — hash sederhana id+token.
    const ordered = exam.shuffle
      ? [...questions].sort((a, b) => this.seedOf(a.id, token) - this.seedOf(b.id, token))
      : questions;
    return {
      questions: ordered,
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
}
