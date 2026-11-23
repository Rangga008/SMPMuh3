import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS, type AuthUser } from '@smpmuh3/types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';

type ColKind = 'FORMATIF' | 'SUMATIF_LM' | 'ASAJ' | 'CUSTOM';

export interface BookColumnInput {
  kind?: ColKind;
  name?: string;
  weight?: number;
  examId?: string | null;
  sortOrder?: number;
}

/**
 * Rumus nilai rapor (NR) — model buku administrasi guru:
 *   S  = rata-rata SEMUA kolom FORMATIF + SUMATIF_LM yang terisi (sel kosong diabaikan)
 *   NR = (avgWeight·S + Σ bobotᵢ·nilaiᵢ) / (avgWeight + Σ bobotᵢ suku terisi)
 * Suku berbobot = kolom ASAJ & CUSTOM dengan weight>0. Default buku: avgWeight=2, ASAJ=2
 * → NR=(2S+2T)/4 persis seperti buku Excel. Suku yang belum ada nilainya tidak ikut
 * pembagi (prorata) sehingga NR bermakna sejak awal semester dan identik dengan rumus
 * Excel saat semua nilai terisi.
 */
function computeGrades(
  book: { avgWeight: number },
  columns: { id: string; kind: string; weight: number }[],
  val: (columnId: string, studentId: string) => number | null,
  studentId: string,
) {
  const avgCols = columns.filter((c) => c.kind === 'FORMATIF' || c.kind === 'SUMATIF_LM');
  const avgVals = avgCols
    .map((c) => val(c.id, studentId))
    .filter((v): v is number => v != null);
  const avg = avgVals.length
    ? Math.round((avgVals.reduce((a, b) => a + b, 0) / avgVals.length) * 10) / 10
    : null;

  const terms: { w: number; v: number | null }[] = [];
  if (avgCols.length) terms.push({ w: book.avgWeight, v: avg });
  for (const c of columns) {
    if ((c.kind === 'ASAJ' || c.kind === 'CUSTOM') && c.weight > 0) {
      terms.push({ w: c.weight, v: val(c.id, studentId) });
    }
  }
  const filled = terms.filter((t) => t.v != null);
  if (!filled.length) return { avg, nr: null as number | null };
  const den = filled.reduce((a, t) => a + t.w, 0);
  const num = filled.reduce((a, t) => a + t.w * (t.v as number), 0);
  return { avg, nr: den > 0 ? Math.round((num / den) * 10) / 10 : null };
}

@Injectable()
export class GradebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private employeeOf(userId: string) {
    return this.prisma.employee.findUnique({ where: { userId } });
  }

  /** Boleh lihat/olah buku ini? Kurikulum=TU manage: semua; wali kelas: semua mapel
   *  di kelasnya; guru mapel: hanya pasangan (kelas×mapel) penugasannya. */
  private async canEdit(user: AuthUser, book: { classId: string; subjectId: string; academicYearId: string }) {
    if (user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)) return true;
    const emp = await this.employeeOf(user.id);
    if (!emp) return false;
    const cls = await this.prisma.class.findUnique({
      where: { id: book.classId },
      select: { homeroomId: true },
    });
    if (cls?.homeroomId === emp.id) return true;
    const asg = await this.prisma.teachingAssignment.findFirst({
      where: {
        employeeId: emp.id,
        classId: book.classId,
        subjectId: book.subjectId,
        academicYearId: book.academicYearId,
      },
      select: { id: true },
    });
    return !!asg;
  }

  private async canView(user: AuthUser, book: { classId: string; subjectId: string; academicYearId: string }) {
    return this.canEdit(user, book); // cakupan lihat = cakupan olah
  }

  private async requireBook(id: string, user: AuthUser, edit = false) {
    const book = await this.prisma.gradeBook.findUnique({ where: { id } });
    if (!book) throw new NotFoundException('Buku nilai tidak ditemukan');
    const ok = edit ? await this.canEdit(user, book) : await this.canView(user, book);
    if (!ok) throw new ForbiddenException('Anda tidak berhak mengelola buku nilai ini');
    return book;
  }

  // ---------- Daftar buku yang bisa diakses user ----------
  async listMine(user: AuthUser, academicYearId?: string) {
    const year =
      academicYearId ??
      (await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
    if (!year) return { academicYearId: null, books: [] };

    // Pasangan kelas×mapel yang boleh diakses
    let pairs: { classId: string; subjectId: string; canEdit: boolean }[] = [];
    if (user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)) {
      const asg = await this.prisma.teachingAssignment.findMany({
        where: { academicYearId: year },
        select: { classId: true, subjectId: true },
        distinct: ['classId', 'subjectId'],
      });
      pairs = asg.map((a) => ({ ...a, canEdit: true }));
    }
    const emp = await this.employeeOf(user.id);
    if (emp) {
      const mine = await this.prisma.teachingAssignment.findMany({
        where: { employeeId: emp.id, academicYearId: year },
        select: { classId: true, subjectId: true },
      });
      for (const m of mine) {
        if (!pairs.some((p) => p.classId === m.classId && p.subjectId === m.subjectId)) {
          pairs.push({ ...m, canEdit: true });
        }
      }
      // Wali kelas: semua mapel di kelas walinya — gabungkan penugasan kelas itu
      const homerooms = await this.prisma.class.findMany({
        where: { homeroomId: emp.id, academicYearId: year },
        select: { id: true },
      });
      for (const h of homerooms) {
        const asg = await this.prisma.teachingAssignment.findMany({
          where: { classId: h.id, academicYearId: year },
          select: { classId: true, subjectId: true },
          distinct: ['classId', 'subjectId'],
        });
        for (const a of asg) {
          const p = pairs.find((x) => x.classId === a.classId && x.subjectId === a.subjectId);
          if (p) p.canEdit = true;
          else pairs.push({ ...a, canEdit: true });
        }
        // Kelas tanpa penugasan sama sekali → tetap tampil (buku dibuat on-demand)
      }
    }

    if (!pairs.length) return { academicYearId: year, books: [] };

    const books = await this.prisma.gradeBook.findMany({
      where: {
        academicYearId: year,
        OR: pairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })),
      },
      include: {
        class: { select: { id: true, name: true, gradeLevel: true, homeroomId: true } },
        subject: { select: { id: true, code: true, name: true } },
        _count: { select: { columns: true } },
      },
      orderBy: [{ class: { name: 'asc' } }, { subject: { name: 'asc' } }],
    });
    const byKey = new Map(books.map((b) => [`${b.classId}:${b.subjectId}`, b]));

    // Pasangan yang belum punya buku → tampil sebagai "belum dibuat"
    const result = pairs.map((p) => {
      const b = byKey.get(`${p.classId}:${p.subjectId}`);
      return {
        id: b?.id ?? null,
        classId: p.classId,
        subjectId: p.subjectId,
        className: b?.class.name ?? null,
        classLevel: b?.class.gradeLevel ?? null,
        subjectCode: b?.subject.code ?? null,
        subjectName: b?.subject.name ?? null,
        columnCount: b?._count.columns ?? 0,
        submittedAt: b?.submittedAt ?? null,
        canEdit: p.canEdit,
      };
    });
    // Isi nama kelas/mapel untuk pasangan tanpa buku
    const missingCls = [...new Set(result.filter((r) => !r.className).map((r) => r.classId))];
    const missingSub = [...new Set(result.filter((r) => !r.subjectName).map((r) => r.subjectId))];
    const [cls, subs] = await Promise.all([
      this.prisma.class.findMany({ where: { id: { in: missingCls } }, select: { id: true, name: true, gradeLevel: true } }),
      this.prisma.subject.findMany({ where: { id: { in: missingSub } }, select: { id: true, code: true, name: true } }),
    ]);
    const clsMap = new Map(cls.map((c) => [c.id, c]));
    const subMap = new Map(subs.map((s) => [s.id, s]));
    for (const r of result) {
      r.className ??= clsMap.get(r.classId)?.name ?? '?';
      r.classLevel ??= clsMap.get(r.classId)?.gradeLevel ?? null;
      r.subjectCode ??= subMap.get(r.subjectId)?.code ?? '?';
      r.subjectName ??= subMap.get(r.subjectId)?.name ?? '?';
    }
    result.sort((a, b) => `${a.className}`.localeCompare(`${b.className}`) || `${a.subjectName}`.localeCompare(`${b.subjectName}`));
    return { academicYearId: year, books: result };
  }

  /** Buka/buat buku untuk pasangan kelas×mapel (dipanggil saat guru membuka grid). */
  async ensureBook(user: AuthUser, dto: { classId: string; subjectId: string; academicYearId?: string }) {
    const year =
      dto.academicYearId ??
      (await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
    if (!year) throw new BadRequestException('Tahun ajaran aktif belum ada');
    const probe = { classId: dto.classId, subjectId: dto.subjectId, academicYearId: year };
    if (!(await this.canView(user, probe))) {
      throw new ForbiddenException('Anda tidak ditugaskan pada kelas/mapel ini');
    }
    const book = await this.prisma.gradeBook.upsert({
      where: { academicYearId_classId_subjectId: { academicYearId: year, classId: dto.classId, subjectId: dto.subjectId } },
      create: { academicYearId: year, classId: dto.classId, subjectId: dto.subjectId },
      update: {},
    });
    return this.getBook(user, book.id);
  }

  // ---------- Isi buku: siswa × kolom + rata-rata + NR ----------
  async getBook(user: AuthUser, id: string) {
    const book = await this.prisma.gradeBook.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true, gradeLevel: true, homeroomId: true, homeroom: { select: { name: true } } } },
        subject: { select: { id: true, code: true, name: true } },
        columns: {
          include: { exam: { select: { id: true, title: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!book) throw new NotFoundException('Buku nilai tidak ditemukan');
    if (!(await this.canView(user, book))) throw new ForbiddenException('Anda tidak berhak melihat buku nilai ini');

    const [students, entries] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { classId: book.classId, academicYearId: book.academicYearId, student: { deletedAt: null } },
        include: { student: { select: { id: true, name: true, nis: true } } },
        orderBy: [{ absenceNo: 'asc' }, { student: { name: 'asc' } }],
      }),
      this.prisma.gradeEntry.findMany({
        where: { column: { gradeBookId: id } },
        select: { columnId: true, studentId: true, score: true },
      }),
    ]);

    const cell = new Map<string, number>();
    for (const e of entries) cell.set(`${e.columnId}:${e.studentId}`, e.score);
    const val = (c: string, s: string) => cell.get(`${c}:${s}`) ?? null;

    const rows = students.map((en) => {
      const cells: Record<string, number> = {};
      for (const c of book.columns) {
        const v = val(c.id, en.studentId);
        if (v != null) cells[c.id] = v;
      }
      const { avg, nr } = computeGrades(book, book.columns, val, en.studentId);
      return {
        studentId: en.studentId,
        name: en.student.name,
        nis: en.student.nis,
        absenceNo: en.absenceNo,
        cells,
        avg,
        nr,
      };
    });

    return {
      id: book.id,
      academicYearId: book.academicYearId,
      avgWeight: book.avgWeight,
      submittedAt: book.submittedAt,
      class: book.class,
      subject: book.subject,
      columns: book.columns.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        weight: c.weight,
        examId: c.examId,
        examTitle: c.exam?.title ?? null,
        sortOrder: c.sortOrder,
      })),
      rows,
      canEdit: await this.canEdit(user, book),
    };
  }

  // ---------- Pengaturan buku & kolom ----------
  async updateBook(user: AuthUser, id: string, dto: { avgWeight?: number; submit?: boolean }) {
    const book = await this.requireBook(id, user, true);
    const data: Record<string, unknown> = {};
    if (dto.avgWeight != null) {
      if (dto.avgWeight < 0) throw new BadRequestException('Bobot tidak boleh negatif');
      data.avgWeight = dto.avgWeight;
    }
    if (dto.submit === true) data.submittedAt = new Date();
    if (dto.submit === false) data.submittedAt = null;
    await this.prisma.gradeBook.update({ where: { id: book.id }, data });
    await this.audit.log({
      actorId: user.id,
      action: 'gradebook.update',
      entity: 'grade_book',
      entityId: book.id,
      metadata: { avgWeight: dto.avgWeight ?? null, submit: dto.submit ?? null },
    });
    return this.getBook(user, id);
  }

  async addColumn(user: AuthUser, bookId: string, dto: BookColumnInput) {
    const book = await this.requireBook(bookId, user, true);
    const kind: ColKind = dto.kind ?? 'FORMATIF';
    if (!['FORMATIF', 'SUMATIF_LM', 'ASAJ', 'CUSTOM'].includes(kind)) {
      throw new BadRequestException('Jenis kolom tidak dikenal');
    }
    const siblings = await this.prisma.gradeColumn.count({ where: { gradeBookId: book.id } });
    let name = dto.name?.trim();
    if (!name) {
      const prefix = kind === 'FORMATIF' ? 'TP' : kind === 'SUMATIF_LM' ? 'LM' : kind === 'ASAJ' ? 'ASAJ' : 'Tambahan';
      const n = (await this.prisma.gradeColumn.count({ where: { gradeBookId: book.id, kind } })) + 1;
      name = kind === 'ASAJ' && n === 1 ? 'ASAJ' : `${prefix}${n}`;
    }
    const weight = dto.weight ?? (kind === 'ASAJ' ? 2 : 0);
    const col = await this.prisma.gradeColumn.create({
      data: {
        gradeBookId: book.id,
        kind,
        name,
        weight: weight < 0 ? 0 : weight,
        examId: dto.examId ?? null,
        sortOrder: dto.sortOrder ?? siblings * 10,
      },
    });
    await this.audit.log({
      actorId: user.id,
      action: 'gradebook.column.add',
      entity: 'grade_book',
      entityId: book.id,
      metadata: { columnId: col.id, kind, name },
    });
    return this.getBook(user, bookId);
  }

  private async requireColumn(columnId: string, user: AuthUser) {
    const col = await this.prisma.gradeColumn.findUnique({ where: { id: columnId } });
    if (!col) throw new NotFoundException('Kolom tidak ditemukan');
    await this.requireBook(col.gradeBookId, user, true);
    return col;
  }

  async updateColumn(user: AuthUser, columnId: string, dto: BookColumnInput) {
    const col = await this.requireColumn(columnId, user);
    const data: {
      name?: string;
      weight?: number;
      sortOrder?: number;
      examId?: string | null;
      kind?: ColKind;
    } = {};
    if (dto.name != null) {
      if (!dto.name.trim()) throw new BadRequestException('Nama kolom wajib diisi');
      data.name = dto.name.trim();
    }
    if (dto.weight != null) {
      if (dto.weight < 0) throw new BadRequestException('Bobot tidak boleh negatif');
      data.weight = dto.weight;
    }
    if (dto.sortOrder != null) data.sortOrder = dto.sortOrder;
    if (dto.examId !== undefined) data.examId = dto.examId;
    if (dto.kind != null) {
      if (!['FORMATIF', 'SUMATIF_LM', 'ASAJ', 'CUSTOM'].includes(dto.kind)) {
        throw new BadRequestException('Jenis kolom tidak dikenal');
      }
      data.kind = dto.kind;
    }
    await this.prisma.gradeColumn.update({ where: { id: col.id }, data });
    return this.getBook(user, col.gradeBookId);
  }

  async deleteColumn(user: AuthUser, columnId: string) {
    const col = await this.requireColumn(columnId, user);
    await this.prisma.gradeColumn.delete({ where: { id: col.id } });
    await this.audit.log({
      actorId: user.id,
      action: 'gradebook.column.delete',
      entity: 'grade_book',
      entityId: col.gradeBookId,
      metadata: { columnId, name: col.name },
    });
    return { ok: true };
  }

  // ---------- Nilai ----------
  async setEntries(user: AuthUser, columnId: string, entries: { studentId: string; score: number | null }[]) {
    const col = await this.requireColumn(columnId, user);
    const ops: ReturnType<typeof this.prisma.gradeEntry.upsert>[] = [];
    const dels: ReturnType<typeof this.prisma.gradeEntry.deleteMany>[] = [];
    for (const e of entries) {
      if (e.score == null || Number.isNaN(e.score)) {
        dels.push(
          this.prisma.gradeEntry.deleteMany({ where: { columnId: col.id, studentId: e.studentId } }),
        );
        continue;
      }
      if (e.score < 0 || e.score > 1000) {
        throw new BadRequestException(`Nilai ${e.score} di luar rentang wajar (0–1000)`);
      }
      ops.push(
        this.prisma.gradeEntry.upsert({
          where: { columnId_studentId: { columnId: col.id, studentId: e.studentId } },
          create: { columnId: col.id, studentId: e.studentId, score: e.score, updatedBy: user.id },
          update: { score: e.score, updatedBy: user.id },
        }),
      );
    }
    await this.prisma.$transaction([...ops, ...dels]);
    return this.getBook(user, col.gradeBookId);
  }

  /** Tarik nilai dari ujian tertaut — memakai tabel `grades` (sudah diskala ke
   *  assessment.maxScore, default 100) + attempt SUBMITTED sebagai fallback. */
  async pullExam(user: AuthUser, columnId: string) {
    const col = await this.requireColumn(columnId, user);
    if (!col.examId) throw new BadRequestException('Kolom ini belum ditautkan ke ujian');
    const book = await this.prisma.gradeBook.findUnique({ where: { id: col.gradeBookId } });
    if (!book) throw new NotFoundException('Buku nilai tidak ditemukan');

    const grades = await this.prisma.grade.findMany({
      where: { examId: col.examId },
      select: { studentId: true, score: true },
    });
    // Fallback: attempt SUBMITTED tanpa baris Grade (mis. finalisasi lama)
    const haveGrade = new Set(grades.map((g) => g.studentId));
    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId: col.examId, status: 'SUBMITTED', studentId: { notIn: [...haveGrade] } },
      select: { studentId: true, score: true, maxScore: true },
    });
    const scale = await this.prisma.exam
      .findUnique({ where: { id: col.examId }, select: { assessment: { select: { maxScore: true } } } })
      .then((e) => e?.assessment.maxScore ?? 100);

    const enrolled = new Set(
      (
        await this.prisma.enrollment.findMany({
          where: { classId: book.classId, academicYearId: book.academicYearId },
          select: { studentId: true },
        })
      ).map((s) => s.studentId),
    );

    const ops: ReturnType<typeof this.prisma.gradeEntry.upsert>[] = [];
    let pulled = 0;
    const push = (studentId: string, score: number) => {
      if (!enrolled.has(studentId)) return;
      pulled++;
      ops.push(
        this.prisma.gradeEntry.upsert({
          where: { columnId_studentId: { columnId: col.id, studentId } },
          create: { columnId: col.id, studentId, score, updatedBy: user.id },
          update: { score, updatedBy: user.id },
        }),
      );
    };
    for (const g of grades) push(g.studentId, g.score);
    for (const a of attempts) {
      if (a.score == null || !a.maxScore) continue;
      push(a.studentId, Math.round((a.score / a.maxScore) * scale));
    }
    await this.prisma.$transaction(ops);
    await this.audit.log({
      actorId: user.id,
      action: 'gradebook.column.pull',
      entity: 'grade_book',
      entityId: col.gradeBookId,
      metadata: { columnId, examId: col.examId, pulled },
    });
    return { pulled, book: await this.getBook(user, col.gradeBookId) };
  }

  /** Ujian yang bisa ditautkan ke kolom buku ini — mapel sama, jenjang cocok. */
  async examOptions(user: AuthUser, bookId: string) {
    const book = await this.prisma.gradeBook.findUnique({
      where: { id: bookId },
      include: { class: { select: { gradeLevel: true } } },
    });
    if (!book) throw new NotFoundException('Buku nilai tidak ditemukan');
    if (!(await this.canView(user, book))) throw new ForbiddenException('Anda tidak berhak');
    const exams = await this.prisma.exam.findMany({
      where: {
        subjectId: book.subjectId,
        academicYearId: book.academicYearId,
        OR: [{ gradeLevel: book.class.gradeLevel }, { gradeLevel: null }],
      },
      select: {
        id: true,
        title: true,
        assessment: { select: { name: true, type: true } },
        _count: { select: { attempts: { where: { status: 'SUBMITTED' } } } },
      },
      orderBy: { startAt: 'desc' },
      take: 50,
    });
    return exams.map((e) => ({
      id: e.id,
      title: e.title,
      assessmentName: e.assessment.name,
      type: e.assessment.type,
      submitted: e._count.attempts,
    }));
  }

  // ---------- Matriks wali kelas: siswa × semua mapel ----------
  async classMatrix(user: AuthUser, classId: string, academicYearId?: string) {
    const year =
      academicYearId ??
      (await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
    if (!year) throw new BadRequestException('Tahun ajaran aktif belum ada');

    // Hak akses: kurikulum/TU manage ATAU wali kelas ini
    let allowed = user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE);
    let homeroomName: string | null = null;
    if (!allowed) {
      const emp = await this.employeeOf(user.id);
      const cls = await this.prisma.class.findUnique({
        where: { id: classId },
        select: { homeroomId: true, homeroom: { select: { name: true } } },
      });
      homeroomName = cls?.homeroom?.name ?? null;
      allowed = !!emp && cls?.homeroomId === emp.id;
    }
    if (!allowed) throw new ForbiddenException('Hanya wali kelas/kurikulum yang dapat melihat rekap ini');

    const [books, students] = await Promise.all([
      this.prisma.gradeBook.findMany({
        where: { classId, academicYearId: year },
        include: {
          subject: { select: { id: true, code: true, name: true } },
          columns: { select: { id: true, kind: true, weight: true } },
        },
        orderBy: { subject: { name: 'asc' } },
      }),
      this.prisma.enrollment.findMany({
        where: { classId, academicYearId: year, student: { deletedAt: null } },
        include: { student: { select: { id: true, name: true, nis: true } } },
        orderBy: [{ absenceNo: 'asc' }, { student: { name: 'asc' } }],
      }),
    ]);
    const entries = await this.prisma.gradeEntry.findMany({
      where: { column: { gradeBook: { classId, academicYearId: year } } },
      select: { columnId: true, studentId: true, score: true },
    });
    const cell = new Map<string, number>();
    for (const e of entries) cell.set(`${e.columnId}:${e.studentId}`, e.score);
    const val = (c: string, s: string) => cell.get(`${c}:${s}`) ?? null;

    const subjects = books.map((b) => ({ bookId: b.id, code: b.subject.code, name: b.subject.name, submittedAt: b.submittedAt }));
    const rows = students.map((en) => {
      const per: Record<string, number | null> = {};
      const nrs: number[] = [];
      for (const b of books) {
        const { nr } = computeGrades(b, b.columns, val, en.studentId);
        per[b.id] = nr;
        if (nr != null) nrs.push(nr);
      }
      const mean = nrs.length ? Math.round((nrs.reduce((a, x) => a + x, 0) / nrs.length) * 10) / 10 : null;
      return { studentId: en.studentId, name: en.student.name, nis: en.student.nis, absenceNo: en.absenceNo, per, mean };
    });
    return { classId, academicYearId: year, homeroomName, subjects, rows };
  }

  /** Kelas yang boleh dilihat user untuk matriks — wali: kelas walinya; kurikulum: semua. */
  async matrixClasses(user: AuthUser, academicYearId?: string) {
    const year =
      academicYearId ??
      (await this.prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
    if (!year) return { academicYearId: null, classes: [] };
    if (user.permissions.includes(PERMISSIONS.ACADEMIC_MANAGE)) {
      const classes = await this.prisma.class.findMany({
        where: { academicYearId: year },
        select: { id: true, name: true, gradeLevel: true, homeroom: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });
      return { academicYearId: year, classes: classes.map((c) => ({ ...c, homeroomName: c.homeroom?.name ?? null, mine: false })) };
    }
    const emp = await this.employeeOf(user.id);
    if (!emp) return { academicYearId: year, classes: [] };
    const classes = await this.prisma.class.findMany({
      where: { academicYearId: year, homeroomId: emp.id },
      select: { id: true, name: true, gradeLevel: true, homeroom: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return { academicYearId: year, classes: classes.map((c) => ({ ...c, homeroomName: c.homeroom?.name ?? null, mine: true })) };
  }
}
