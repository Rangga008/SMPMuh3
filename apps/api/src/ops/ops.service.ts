import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import {
  AttendanceRowDto,
  CollectionDto,
  ExamRoomDto,
  ExamSeatDto,
  QuestionDto,
  SaveAnswersDto,
  SaveAttendanceDto,
  ScheduleBlockDto,
  SubmissionDto,
  UniformDayDto,
} from './dto/ops.dto';

const WIB = 'Asia/Jakarta';
const toDateOnly = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Tanggal tidak valid');
  return d;
};

@Injectable()
export class OpsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ================= ScheduleBlock (ishoma/pembiasaan) =================
  listBlocks(academicYearId: string) {
    return this.prisma.scheduleBlock.findMany({
      where: { academicYearId },
      orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
    });
  }

  createBlock(dto: ScheduleBlockDto) {
    if (!dto.day && !dto.date) throw new BadRequestException('Isi hari (rutin) atau tanggal spesifik.');
    return this.prisma.scheduleBlock.create({
      data: {
        label: dto.label,
        day: dto.day ?? null,
        date: dto.date ? toDateOnly(dto.date) : null,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        academicYearId: dto.academicYearId,
      },
    });
  }

  async deleteBlock(id: string) {
    await this.prisma.scheduleBlock.delete({ where: { id } });
    return { ok: true };
  }

  /** Jadwal lengkap satu kelas per hari — entries mapel + blok non-mapel. */
  async classTimetable(classId: string) {
    const cls = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      include: { academicYear: true },
    });
    const [entries, blocks] = await Promise.all([
      this.prisma.scheduleEntry.findMany({
        where: { assignment: { classId, academicYearId: cls.academicYearId } },
        include: {
          assignment: {
            include: { subject: true, employee: { select: { name: true } } },
          },
        },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
      this.prisma.scheduleBlock.findMany({
        where: { academicYearId: cls.academicYearId, day: { not: null } },
        orderBy: [{ day: 'asc' }, { startMinute: 'asc' }],
      }),
    ]);
    const days: Record<number, { type: 'lesson' | 'block'; start: number; end: number; label: string; code?: string | undefined; teacher?: string | undefined; room?: string | undefined }[]> = {};
    for (const e of entries) {
      (days[e.day] ??= []).push({
        type: 'lesson', start: e.startMinute, end: e.endMinute,
        label: e.assignment.subject.name, code: e.assignment.subject.code,
        teacher: e.assignment.employee.name, room: e.room ?? undefined,
      });
    }
    for (const b of blocks) {
      if (b.day) (days[b.day] ??= []).push({ type: 'block', start: b.startMinute, end: b.endMinute, label: b.label });
    }
    for (const d of Object.values(days)) d.sort((a, b) => a.start - b.start);
    return { class: cls, days };
  }

  /** Export jadwal satu/semua kelas ke Excel — kode mapel + jam. */
  async timetableXlsx(classId: string | undefined, academicYearId: string) {
    const classes = await this.prisma.class.findMany({
      where: { academicYearId, ...(classId ? { id: classId } : {}) },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const wb = XLSX.utils.book_new();
    const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const mm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}.${String(m % 60).padStart(2, '0')}`;
    for (const cls of classes) {
      const tt = await this.classTimetable(cls.id);
      const rows: (string | number)[][] = [['Jam', 'Kode', 'Mata Pelajaran', 'Guru', 'Ruang']];
      for (let d = 1; d <= 6; d++) {
        const list = tt.days[d] ?? [];
        if (!list.length) continue;
        rows.push([(DAY_NAMES[d] ?? '').toUpperCase(), '', '', '', '']);
        for (const s of list) {
          rows.push([
            `${mm(s.start)}–${mm(s.end)}`,
            s.code ?? (s.type === 'block' ? '—' : ''),
            s.label, s.teacher ?? '', s.room ?? '',
          ]);
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 34 }, { wch: 26 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
    }
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  // ================= Butir soal & analisis =================
  async setQuestions(assessmentId: string, questions: QuestionDto[]) {
    await this.prisma.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentQuestion.deleteMany({ where: { assessmentId } });
      const created = await tx.assessmentQuestion.createMany({
        data: questions.map((q) => ({
          assessmentId, number: q.number, type: q.type as never,
          weight: q.weight ?? 1,
          key: q.key === undefined ? Prisma.JsonNull : (q.key as Prisma.InputJsonValue),
          prompt: q.prompt ?? null,
        })),
      });
      return { count: created.count };
    });
  }

  listQuestions(assessmentId: string) {
    return this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { number: 'asc' },
      include: { _count: { select: { answers: true } } },
    });
  }

  async saveAnswers(questionId: string, dto: SaveAnswersDto) {
    const q = await this.prisma.assessmentQuestion.findUniqueOrThrow({ where: { id: questionId } });
    return this.prisma.$transaction(async (tx) => {
      for (const r of dto.rows) {
        await tx.studentAnswer.upsert({
          where: { questionId_studentId: { questionId: q.id, studentId: r.studentId } },
          update: {
            answer: r.answer === undefined ? Prisma.JsonNull : (r.answer as Prisma.InputJsonValue),
            score: r.score, isCorrect: r.isCorrect ?? null,
          },
          create: {
            questionId: q.id, studentId: r.studentId,
            answer: r.answer === undefined ? Prisma.JsonNull : (r.answer as Prisma.InputJsonValue),
            score: r.score, isCorrect: r.isCorrect ?? null,
          },
        });
      }
      return { saved: dto.rows.length };
    });
  }

  /** Analisis butir: per soal — jumlah benar, % ketepatan, rata-rata skor. */
  async questionAnalysis(assessmentId: string) {
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: { number: 'asc' },
      include: { answers: { select: { studentId: true, score: true, isCorrect: true, answer: true } } },
    });
    const rows = questions.map((q) => {
      const total = q.answers.length;
      const correct = q.answers.filter((a) => a.isCorrect === true).length;
      const avgScore = total ? q.answers.reduce((s, a) => s + a.score, 0) / total : 0;
      return {
        id: q.id, number: q.number, type: q.type, weight: q.weight,
        prompt: q.prompt, key: q.key,
        answered: total, correct,
        correctPct: total ? Math.round((correct / total) * 100) : null,
        avgScore: Math.round(avgScore * 100) / 100,
        difficulty: total ? (avgScore / q.weight >= 0.75 ? 'Mudah' : avgScore / q.weight >= 0.4 ? 'Sedang' : 'Sukar') : null,
      };
    });
    return { questions: rows };
  }

  /** Rekap jawaban siswa per soal — matriks siswa × butir. */
  async answerMatrix(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { class: true, subject: true },
    });
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { assessmentId }, orderBy: { number: 'asc' },
    });
    const qIds = questions.map((q) => q.id);
    const [students, answers] = await Promise.all([
      assessment.classId
        ? this.prisma.enrollment.findMany({
            where: { classId: assessment.classId, academicYearId: assessment.academicYearId, student: { status: 'ACTIVE' } },
            include: { student: { select: { id: true, name: true, nis: true } } },
            orderBy: { student: { name: 'asc' } },
          }).then((es) => es.map((e) => e.student))
        : this.prisma.student.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' }, take: 200 }),
      this.prisma.studentAnswer.findMany({ where: { questionId: { in: qIds } } }),
    ]);
    const map = new Map(answers.map((a) => [`${a.questionId}:${a.studentId}`, a]));
    return {
      assessment: { id: assessment.id, name: assessment.name, subject: assessment.subject.name, class: assessment.class?.name },
      questions: questions.map((q) => ({ id: q.id, number: q.number, type: q.type, weight: q.weight, key: q.key })),
      students: students.map((s) => ({
        id: s.id, name: s.name, nis: s.nis,
        cells: questions.map((q) => {
          const a = map.get(`${q.id}:${s.id}`);
          return a ? { score: a.score, isCorrect: a.isCorrect, answer: a.answer } : null;
        }),
        total: questions.reduce((acc, q) => acc + (map.get(`${q.id}:${s.id}`)?.score ?? 0), 0),
      })),
    };
  }

  /** Ledger nilai: per kelas × siswa × mapel — rata-rata tiap mapel. */
  async gradeLedger(classId: string, academicYearId: string) {
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const students = await this.prisma.enrollment.findMany({
      where: { classId, academicYearId, student: { status: 'ACTIVE' } },
      include: { student: { select: { id: true, name: true, nis: true } } },
      orderBy: { student: { name: 'asc' } },
    });
    const grades = await this.prisma.grade.findMany({
      where: {
        assessment: { academicYearId },
        studentId: { in: students.map((s) => s.studentId) },
      },
      include: { assessment: { include: { subject: { select: { id: true, name: true, code: true } } } } },
    });
    const subjects = new Map<string, { id: string; name: string; code: string }>();
    const cell = new Map<string, number[]>();
    for (const g of grades) {
      const sub = g.assessment.subject;
      subjects.set(sub.id, sub);
      const key = `${g.studentId}:${sub.id}`;
      (cell.get(key) ?? cell.set(key, []).get(key)!).push(g.score);
    }
    const subjectList = [...subjects.values()].sort((a, b) => a.code.localeCompare(b.code));
    return {
      class: cls,
      subjects: subjectList,
      students: students.map((e) => ({
        id: e.student.id, name: e.student.name, nis: e.student.nis,
        scores: subjectList.map((sub) => {
          const arr = cell.get(`${e.student.id}:${sub.id}`) ?? [];
          return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
        }),
      })),
    };
  }

  /** Statistik per mapel dalam satu kelas: avg/min/max + jumlah penilai. */
  async classSubjectStats(classId: string, academicYearId: string) {
    const rows = await this.prisma.grade.groupBy({
      by: ['assessmentId'],
      where: {
        assessment: { academicYearId, classId },
      },
      _avg: { score: true }, _min: { score: true }, _max: { score: true }, _count: { _all: true },
    });
    const assessments = await this.prisma.assessment.findMany({
      where: { id: { in: rows.map((r) => r.assessmentId) } },
      include: { subject: { select: { id: true, name: true, code: true } } },
    });
    const aMap = new Map(assessments.map((a) => [a.id, a]));
    const perSubject = new Map<string, { subject: { id: string; name: string; code: string }; scores: number[] }>();
    for (const r of rows) {
      const a = aMap.get(r.assessmentId);
      if (!a) continue;
      const g = await this.prisma.grade.findMany({
        where: { assessmentId: a.id }, select: { score: true },
      });
      const entry = perSubject.get(a.subject.id) ?? perSubject.set(a.subject.id, { subject: a.subject, scores: [] }).get(a.subject.id)!;
      entry.scores.push(...g.map((x) => x.score));
    }
    return [...perSubject.values()].map(({ subject, scores }) => ({
      subject,
      count: scores.length,
      avg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
    })).sort((a, b) => a.subject.code.localeCompare(b.subject.code));
  }

  // ================= Absen siswa harian oleh guru =================
  /** Jadwal mengajar guru login hari ini — untuk dipilih saat absen. */
  async teacherToday(userId: string, dateIso?: string) {
    const emp = await this.prisma.employee.findUnique({ where: { userId } });
    if (!emp) throw new NotFoundException('Akun belum tertaut pegawai.');
    const date = dateIso ? toDateOnly(dateIso) : new Date();
    const dow = new Date(date.toLocaleString('en-US', { timeZone: WIB })).getDay() || 7; // 1=Sen
    const year = await this.prisma.academicYear.findFirst({ where: { isActive: true } });
    if (!year) throw new BadRequestException('Tahun ajaran aktif tidak ada.');
    const assignments = await this.prisma.teachingAssignment.findMany({
      where: { employeeId: emp.id, academicYearId: year.id },
      include: { class: true, subject: true, schedules: true },
    });
    const today = assignments
      .filter((a) => a.schedules.some((s) => s.day === dow))
      .flatMap((a) => a.schedules.filter((s) => s.day === dow).map((s) => ({
        assignmentId: a.id, class: a.class, subject: a.subject,
        startMinute: s.startMinute, endMinute: s.endMinute, room: s.room,
      })))
      .sort((a, b) => a.startMinute - b.startMinute);
    return { employee: emp, date, dayOfWeek: dow, sessions: today, year };
  }

  /** Siswa satu kelas + status absen tanggal tsb — prefill PRESENT utk auto-absen. */
  async classAttendance(classId: string, dateIso: string) {
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const date = toDateOnly(dateIso);
    const [students, records] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, academicYearId: cls.academicYearId, student: { status: 'ACTIVE' } },
        include: { student: { select: { id: true, name: true, nis: true } } },
        orderBy: { student: { name: 'asc' } },
      }),
      this.prisma.attendanceRecord.findMany({ where: { classId, date } }),
    ]);
    const map = new Map(records.map((r) => [r.studentId, r]));
    return {
      class: cls, date, taken: records.length > 0,
      students: students.map((e) => ({
        id: e.student.id, name: e.student.name, nis: e.student.nis,
        status: map.get(e.student.id)?.status ?? 'PRESENT',
        note: map.get(e.student.id)?.note ?? null,
      })),
    };
  }

  async saveAttendance(dto: SaveAttendanceDto, takenById?: string) {
    const date = toDateOnly(dto.date);
    return this.prisma.$transaction(async (tx) => {
      for (const r of dto.rows) {
        await tx.attendanceRecord.upsert({
          where: { studentId_date: { studentId: r.studentId, date } },
          update: { status: r.status as never, note: r.note ?? null, takenBy: takenById ?? null, classId: dto.classId },
          create: {
            studentId: r.studentId, classId: dto.classId, date,
            status: r.status as never, note: r.note ?? null, takenBy: takenById ?? null,
          },
        });
      }
      return { saved: dto.rows.length, date };
    });
  }

  /** Rekap absen siswa per kelas — per bulan atau rentang tanggal. */
  async attendanceRecap(classId: string, fromIso: string, toIso: string) {
    const from = toDateOnly(fromIso);
    const to = toDateOnly(toIso);
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const [students, records, schoolDays] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId, academicYearId: cls.academicYearId },
        include: { student: { select: { id: true, name: true, nis: true } } },
        orderBy: { student: { name: 'asc' } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { classId, date: { gte: from, lte: to } },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { classId, date: { gte: from, lte: to } },
        select: { date: true }, distinct: ['date'],
      }),
    ]);
    const dayCount = schoolDays.length;
    return {
      class: cls, from, to, daysTaken: dayCount,
      students: students.map((e) => {
        const mine = records.filter((r) => r.studentId === e.student.id);
        const c = (s: string) => mine.filter((r) => r.status === s).length;
        return {
          id: e.student.id, name: e.student.name, nis: e.student.nis,
          present: c('PRESENT'), sick: c('SICK'), permit: c('PERMIT'), absent: c('ABSENT'),
          total: mine.length,
          presentPct: mine.length ? Math.round((c('PRESENT') / mine.length) * 100) : null,
        };
      }),
    };
  }

  // ================= StaffDocument (administrasi guru/SK) =================
  async uploadStaffDoc(employeeId: string, category: string, title: string, file: Express.Multer.File, uploadedBy?: string) {
    const key = `staff-docs/${employeeId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.staffDocument.create({
      data: { employeeId, category, title, storageKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, uploadedBy: uploadedBy ?? null },
    });
  }

  listStaffDocs(employeeId?: string, category?: string, q?: string) {
    return this.prisma.staffDocument.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { fileName: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { employee: { select: { id: true, name: true, nip: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async staffDocFile(id: string) {
    const doc = await this.prisma.staffDocument.findUniqueOrThrow({ where: { id } });
    const buf = await this.storage.getObjectBuffer(doc.storageKey);
    return { buf, mime: doc.mimeType, name: doc.fileName };
  }

  async deleteStaffDoc(id: string) {
    const doc = await this.prisma.staffDocument.findUniqueOrThrow({ where: { id } });
    await this.storage.deleteObject(doc.storageKey).catch(() => undefined);
    await this.prisma.staffDocument.delete({ where: { id } });
    return { ok: true };
  }

  // ================= DocCollection (kisi-kisi batch) =================
  async createCollection(dto: CollectionDto, userId: string) {
    const col = await this.prisma.docCollection.create({
      data: {
        title: dto.title, category: dto.category ?? 'KISI_KISI',
        description: dto.description ?? null,
        deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
        academicYearId: dto.academicYearId ?? null,
        createdBy: userId,
        items: { create: dto.employeeIds.map((eid) => ({ employeeId: eid })) },
      },
      include: { items: { include: { employee: { select: { id: true, name: true, phone: true } } } } },
    });
    return col;
  }

  listCollections(academicYearId?: string) {
    return this.prisma.docCollection.findMany({
      where: academicYearId ? { academicYearId } : {},
      include: {
        items: { include: { employee: { select: { id: true, name: true, phone: true } } } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  getCollection(id: string) {
    return this.prisma.docCollection.findUniqueOrThrow({
      where: { id },
      include: {
        items: { include: { employee: { select: { id: true, name: true, phone: true, nip: true } } }, orderBy: { employee: { name: 'asc' } } },
      },
    });
  }

  /** Guru mengumpulkan berkasnya sendiri. */
  async submitCollectionItem(collectionId: string, userId: string, file: Express.Multer.File, note?: string) {
    const emp = await this.prisma.employee.findUnique({ where: { userId } });
    if (!emp) throw new NotFoundException('Akun belum tertaut pegawai.');
    const item = await this.prisma.docCollectionItem.findUnique({
      where: { collectionId_employeeId: { collectionId, employeeId: emp.id } },
    });
    if (!item) throw new NotFoundException('Anda tidak ditugaskan pada pengumpulan ini.');
    const key = `collections/${collectionId}/${emp.id}-${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.docCollectionItem.update({
      where: { id: item.id },
      data: { submittedAt: new Date(), storageKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, note: note ?? null },
    });
  }

  async collectionItemFile(itemId: string) {
    const item = await this.prisma.docCollectionItem.findUniqueOrThrow({ where: { id: itemId } });
    if (!item.storageKey) throw new NotFoundException('Belum ada berkas.');
    const buf = await this.storage.getObjectBuffer(item.storageKey);
    return { buf, mime: item.mimeType ?? 'application/octet-stream', name: item.fileName ?? 'file' };
  }

  // ================= ProgramSubmission (RKS/program → KS) =================
  async createSubmission(dto: SubmissionDto, userId: string, file?: Express.Multer.File) {
    let storageKey: string | null = null;
    if (file) {
      storageKey = `submissions/${dto.department}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    }
    return this.prisma.programSubmission.create({
      data: {
        department: dto.department, kind: dto.kind, title: dto.title,
        description: dto.description ?? null,
        rab: dto.rab === undefined ? Prisma.JsonNull : (dto.rab as Prisma.InputJsonValue),
        amountTotal: dto.amountTotal ?? 0,
        storageKey, fileName: file?.originalname ?? null,
        submittedBy: userId,
      },
    });
  }

  listSubmissions(department?: string, status?: string) {
    return this.prisma.programSubmission.findMany({
      where: {
        ...(department ? { department } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewSubmission(id: string, action: 'APPROVED' | 'REJECTED', note: string | undefined, userId: string) {
    const sub = await this.prisma.programSubmission.findUniqueOrThrow({ where: { id } });
    if (sub.status !== 'PENDING') throw new ConflictException('Pengajuan sudah direview.');
    return this.prisma.programSubmission.update({
      where: { id },
      data: { status: action, reviewedBy: userId, reviewedAt: new Date(), reviewNote: note ?? null },
    });
  }

  async submissionFile(id: string) {
    const sub = await this.prisma.programSubmission.findUniqueOrThrow({ where: { id } });
    if (!sub.storageKey) throw new NotFoundException('Tidak ada berkas.');
    const buf = await this.storage.getObjectBuffer(sub.storageKey);
    return { buf, mime: 'application/octet-stream', name: sub.fileName ?? 'file' };
  }

  // ================= Arsip =================
  listArchiveCategories() {
    return this.prisma.archiveCategory.findMany({ include: { _count: { select: { items: true } } }, orderBy: { name: 'asc' } });
  }
  createArchiveCategory(name: string) {
    return this.prisma.archiveCategory.create({ data: { name } });
  }
  async uploadArchiveItem(dto: { title: string; categoryId?: string; refNumber?: string; date?: string }, file: Express.Multer.File, uploadedBy?: string) {
    const key = `archive/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.archiveItem.create({
      data: {
        title: dto.title, categoryId: dto.categoryId ?? null,
        refNumber: dto.refNumber ?? null, date: dto.date ? toDateOnly(dto.date) : null,
        storageKey: key, fileName: file.originalname, mimeType: file.mimetype,
        sizeBytes: file.size, uploadedBy: uploadedBy ?? null,
      },
    });
  }
  listArchiveItems(categoryId?: string, q?: string) {
    return this.prisma.archiveItem.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { refNumber: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      include: { category: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }
  async archiveFile(id: string) {
    const item = await this.prisma.archiveItem.findUniqueOrThrow({ where: { id } });
    const buf = await this.storage.getObjectBuffer(item.storageKey);
    return { buf, mime: item.mimeType, name: item.fileName };
  }

  // ================= PolicyDocument (tata tertib, form mutasi) =================
  async uploadPolicy(kind: string, title: string, file: Express.Multer.File, uploadedBy?: string) {
    const key = `policy/${kind}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.policyDocument.create({
      data: { kind, title, storageKey: key, fileName: file.originalname, mimeType: file.mimetype, sizeBytes: file.size, uploadedBy: uploadedBy ?? null },
    });
  }
  listPolicies(kind?: string) {
    return this.prisma.policyDocument.findMany({
      where: kind ? { kind } : {},
      orderBy: { createdAt: 'desc' },
    });
  }
  async policyFile(id: string) {
    const doc = await this.prisma.policyDocument.findUniqueOrThrow({ where: { id } });
    const buf = await this.storage.getObjectBuffer(doc.storageKey);
    return { buf, mime: doc.mimeType, name: doc.fileName };
  }

  // ================= UniformSchedule =================
  listUniforms() {
    return this.prisma.uniformSchedule.findMany({ orderBy: { day: 'asc' } });
  }
  upsertUniform(dto: UniformDayDto) {
    return this.prisma.uniformSchedule.upsert({
      where: { day: dto.day },
      update: { name: dto.name, note: dto.note ?? null },
      create: { day: dto.day, name: dto.name, note: dto.note ?? null },
    });
  }

  // ================= ExamRoom/Seat → kartu peserta =================
  createExamRoom(dto: ExamRoomDto) {
    return this.prisma.examRoom.create({ data: { name: dto.name, period: dto.period, academicYearId: dto.academicYearId, capacity: dto.capacity ?? 24 } });
  }
  listExamRooms(academicYearId: string, period?: string) {
    return this.prisma.examRoom.findMany({
      where: { academicYearId, ...(period ? { period } : {}) },
      include: { seats: { include: { student: { select: { id: true, name: true, nis: true } }, class: { select: { id: true, name: true } } }, orderBy: { seatNo: 'asc' } }, _count: { select: { seats: true } } },
      orderBy: { name: 'asc' },
    });
  }
  async assignSeat(roomId: string, dto: ExamSeatDto) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId }, include: { _count: { select: { seats: true } } } });
    if (room._count.seats >= room.capacity) throw new ConflictException(`Ruang ${room.name} penuh (${room.capacity}).`);
    const seatNo = dto.seatNo ?? room._count.seats + 1;
    return this.prisma.examSeat.create({ data: { roomId, studentId: dto.studentId, classId: dto.classId ?? null, seatNo } });
  }
  async assignClassToRoom(roomId: string, classId: string) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({ where: { id: roomId }, include: { _count: { select: { seats: true } } } });
    const cls = await this.prisma.class.findUniqueOrThrow({ where: { id: classId } });
    const students = await this.prisma.enrollment.findMany({
      where: { classId, academicYearId: cls.academicYearId, student: { status: 'ACTIVE' } },
      orderBy: { student: { name: 'asc' } },
    });
    const existing = await this.prisma.examSeat.findMany({ where: { roomId, studentId: { in: students.map((s) => s.studentId) } }, select: { studentId: true } });
    const skip = new Set(existing.map((e) => e.studentId));
    const free = room.capacity - room._count.seats;
    const toAdd = students.filter((s) => !skip.has(s.studentId)).slice(0, Math.max(free, 0));
    let seat = room._count.seats;
    const created = await this.prisma.examSeat.createMany({
      data: toAdd.map((s) => ({ roomId, studentId: s.studentId, classId, seatNo: ++seat })),
    });
    return { added: created.count, skipped: students.length - toAdd.length };
  }
  async examCards(roomId: string) {
    const room = await this.prisma.examRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        academicYear: true,
        seats: { include: { student: { select: { id: true, name: true, nis: true, nisn: true, gender: true } }, class: { select: { name: true } } }, orderBy: { seatNo: 'asc' } },
      },
    });
    const school = await this.prisma.school.findFirst();
    return { room, school };
  }

  // ================= Mutasi: upload surat =================
  async mutationLetter(mutationId: string, file: Express.Multer.File) {
    await this.prisma.studentMutation.findUniqueOrThrow({ where: { id: mutationId } });
    const key = `mutations/${mutationId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    return this.prisma.studentMutation.update({
      where: { id: mutationId },
      data: { storageKey: key, fileName: file.originalname, mimeType: file.mimetype },
    });
  }

  async mutationLetterFile(mutationId: string) {
    const m = await this.prisma.studentMutation.findUniqueOrThrow({ where: { id: mutationId } });
    if (!m.storageKey) throw new NotFoundException('Belum ada surat terlampir.');
    const buf = await this.storage.getObjectBuffer(m.storageKey);
    return { buf, mime: m.mimeType ?? 'application/octet-stream', name: m.fileName ?? 'surat' };
  }

  // ================= Buku induk =================
  async updateStudentRecord(id: string, dto: Record<string, string | undefined>) {
    const FIELDS = [
      'previousSchool', 'healthNotes', 'fatherName', 'motherName',
      'parentOccupation', 'parentPhone', 'intelligenceNotes', 'leavingNotes', 'otherNotes',
    ] as const;
    const data: Record<string, string | null> = {};
    for (const f of FIELDS) if (dto[f] !== undefined) data[f] = dto[f] || null;
    return this.prisma.student.update({ where: { id }, data });
  }

  async studentRecord(id: string) {
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      include: {
        parent: { select: { name: true, phone: true, email: true } },
        candidate: { select: { previousSchool: true, address: true, birthPlace: true, birthDate: true } },
        enrollments: { include: { class: { select: { name: true, gradeLevel: true } }, academicYear: { select: { name: true } } }, orderBy: { academicYear: { name: 'desc' } } },
        attendances: { take: 90, orderBy: { date: 'desc' } },
        achievements: { orderBy: { createdAt: 'desc' } },
        violations: { orderBy: { date: 'desc' } },
      },
    });
    return s;
  }

  // ================= Import Dapodik =================
  /** Import siswa — kolom: nama, nis, nisn, kelas, gender, tempat_lahir, tanggal_lahir, alamat, nama_ayah, nama_ibu, hp_ortu, sekolah_asal. */
  async importStudents(buffer: Buffer, academicYearId: string, classMap: Record<string, string>) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const results: { row: number; name: string; ok: boolean; msg: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowNo = i + 2;
      const name = String(r['nama'] ?? r['name'] ?? '').trim();
      if (!name) { results.push({ row: rowNo, name: `baris ${rowNo}`, ok: false, msg: 'Nama kosong' }); continue; }
      const nis = String(r['nis'] ?? '').trim() || null;
      const nisn = String(r['nisn'] ?? '').trim() || null;
      try {
        if (nis && (await this.prisma.student.findUnique({ where: { nis } }))) {
          results.push({ row: rowNo, name, ok: false, msg: `NIS ${nis} sudah ada` }); continue;
        }
        if (nisn && (await this.prisma.student.findUnique({ where: { nisn } }))) {
          results.push({ row: rowNo, name, ok: false, msg: `NISN ${nisn} sudah ada` }); continue;
        }
        const student = await this.prisma.student.create({
          data: {
            name, nis, nisn,
            gender: String(r['gender'] ?? r['jk'] ?? '').toUpperCase().startsWith('P') ? 'FEMALE' : String(r['gender'] ?? r['jk'] ?? '') ? 'MALE' : null,
            birthPlace: String(r['tempat_lahir'] ?? '').trim() || null,
            birthDate: r['tanggal_lahir'] ? toDateOnly(String(r['tanggal_lahir'])) : null,
            address: String(r['alamat'] ?? '').trim() || null,
            previousSchool: String(r['sekolah_asal'] ?? '').trim() || null,
            fatherName: String(r['nama_ayah'] ?? '').trim() || null,
            motherName: String(r['nama_ibu'] ?? '').trim() || null,
            parentPhone: String(r['hp_ortu'] ?? '').trim() || null,
          },
        });
        const className = String(r['kelas'] ?? '').trim();
        const classId = classMap[className.toLowerCase()];
        if (classId) {
          await this.prisma.enrollment.create({ data: { studentId: student.id, classId, academicYearId } });
        }
        results.push({ row: rowNo, name, ok: true, msg: classId ? `Masuk ${className}` : 'Dibuat (kelas tak dikenal)' });
      } catch (e) {
        results.push({ row: rowNo, name, ok: false, msg: e instanceof Error ? e.message.slice(0, 80) : 'gagal' });
      }
    }
    return { total: rows.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }

  /** Import pegawai/guru Dapodik — kolom: nama, nip, jenis(GURU/STAFF), email, telepon, bidang. */
  async importEmployees(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: '' });
    const results: { row: number; name: string; ok: boolean; msg: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowNo = i + 2;
      const name = String(r['nama'] ?? r['name'] ?? '').trim();
      if (!name) { results.push({ row: rowNo, name: `baris ${rowNo}`, ok: false, msg: 'Nama kosong' }); continue; }
      const nip = String(r['nip'] ?? '').trim() || null;
      try {
        if (nip && (await this.prisma.employee.findUnique({ where: { nip } }))) {
          results.push({ row: rowNo, name, ok: false, msg: `NIP ${nip} sudah ada` }); continue;
        }
        await this.prisma.employee.create({
          data: {
            name, nip,
            type: String(r['jenis'] ?? r['type'] ?? '').toUpperCase().includes('STAFF') ? 'STAFF' : 'TEACHER',
            email: String(r['email'] ?? '').trim() || null,
            phone: String(r['telepon'] ?? r['hp'] ?? '').trim() || null,
            department: String(r['bidang'] ?? '').trim().toUpperCase() || null,
          },
        });
        results.push({ row: rowNo, name, ok: true, msg: 'Dibuat' });
      } catch (e) {
        results.push({ row: rowNo, name, ok: false, msg: e instanceof Error ? e.message.slice(0, 80) : 'gagal' });
      }
    }
    return { total: rows.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  }
}
