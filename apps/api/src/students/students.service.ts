import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import argon2 from 'argon2';
import type { Prisma, StudentStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import { WhatsappService } from '../spmb/whatsapp.service';
import { normalizePhone } from '../identity/users/users.service';
import type {
  AchievementDto,
  CreateStudentDto,
  EkskulDto,
  EkskulMemberDto,
  MarkAttendanceDto,
  UpdateStudentDto,
  ViolationDto,
} from './dto/student.dto';

const studentSelect = {
  id: true,
  nis: true,
  nisn: true,
  nik: true,
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
    private readonly storage: StorageService,
    private readonly whatsapp: WhatsappService,
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
        { nik: { contains: q.search } },
      ];
    }
    if (q.classId) {
      where.enrollments = { some: { classId: q.classId } };
    }
    return this.prisma.student.findMany({
      where,
      select: {
        ...studentSelect,
        // Rombel terakhir — dipakai daftar Buku Induk TU & daftar siswa.
        enrollments: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { class: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
      take: Math.min(q.take ?? 100, 500),
    });
  }

  async detail(id: string) {
    const s = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      include: {
        enrollments: {
          include: { class: true, academicYear: true },
          orderBy: { createdAt: 'desc' },
        },
        achievements: {
          orderBy: { createdAt: 'desc' },
          include: {
            evidenceDocument: {
              select: { id: true, fileName: true, mimeType: true },
            },
          },
        },
        violations: {
          orderBy: { date: 'desc' },
          include: {
            evidenceDocument: {
              select: { id: true, fileName: true, mimeType: true },
            },
          },
        },
        ekskulMemberships: {
          include: {
            extracurricular: {
              select: {
                id: true, name: true, schedule: true, isActive: true,
                coach: { select: { name: true } },
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
        documents: { orderBy: { createdAt: 'desc' } },
        parent: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    // Nomor registrasi SPMB asal — siswa baru hasil konversi SPMB punya
    // invoice ber-registrationId; dipakai untuk menampilkan asal pendaftaran.
    const spmbInvoice = await this.prisma.invoice.findFirst({
      where: { studentId: id, registrationId: { not: null } },
      select: { registration: { select: { number: true } } },
    });
    return { ...s, spmbNumber: spmbInvoice?.registration?.number ?? null };
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
    const data = this.toData(dto);
    // Nama/HP ortu diisi → buat/tautkan akun ortu (sama seperti update()).
    if (!dto.parentId && (dto.parentName || dto.parentPhone)) {
      data.parentId = await this.resolveParentId(dto);
    }
    const student = await this.prisma.student.create({
      data,
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
    const existing = await this.prisma.student.findUniqueOrThrow({
      where: { id },
      select: { parentId: true },
    });
    const data: Prisma.StudentUpdateInput = this.toUpdateData(dto);
    // Data ortu/wali — siswa non-SPMB (kelas lanjutan/mutasi) belum punya
    // akun ortu, jadi dibuat bila nama/HP diisi; yang sudah ada diperbarui.
    if (dto.parentName !== undefined || dto.parentPhone !== undefined) {
      const parent = await this.parentData(existing.parentId, dto);
      if (parent) data.parent = parent;
    } else if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }
    const updated = await this.prisma.student.update({
      where: { id },
      data,
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
        evidenceDocumentId: dto.evidenceDocumentId ?? null,
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
        evidenceDocumentId: dto.evidenceDocumentId ?? null,
      },
    });
  }

  /** Daftar prestasi seluruh siswa — halaman Data Prestasi kesiswaan. */
  listAchievements(q: { search?: string | undefined; year?: number | undefined }) {
    const where: Prisma.AchievementWhereInput = {};
    if (q.year) where.year = q.year;
    if (q.search) {
      where.OR = [
        { title: { contains: q.search, mode: 'insensitive' } },
        { student: { name: { contains: q.search, mode: 'insensitive' } } },
      ];
    }
    return this.prisma.achievement.findMany({
      where,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      include: {
        student: {
          select: {
            id: true, name: true, nis: true,
            enrollments: {
              orderBy: { createdAt: 'desc' }, take: 1,
              include: { class: { select: { name: true } } },
            },
          },
        },
        evidenceDocument: { select: { id: true, fileName: true } },
      },
    });
  }

  async updateAchievement(id: string, dto: AchievementDto, actorId: string) {
    await this.prisma.achievement.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.achievement.update({
      where: { id },
      data: {
        title: dto.title,
        level: dto.level ?? null,
        year: dto.year ?? null,
        description: dto.description ?? null,
        evidenceDocumentId: dto.evidenceDocumentId ?? null,
      },
    });
    await this.audit.log({ actorId, action: 'achievement.update', entity: 'achievement', entityId: id });
    return row;
  }

  async deleteAchievement(id: string, actorId: string) {
    await this.prisma.achievement.findUniqueOrThrow({ where: { id } });
    await this.prisma.achievement.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'achievement.delete', entity: 'achievement', entityId: id });
    return { deleted: true };
  }

  // ---- ekstrakurikuler ----

  listEkskul(q: { search?: string | undefined }) {
    return this.prisma.extracurricular.findMany({
      where: q.search
        ? { name: { contains: q.search, mode: 'insensitive' } }
        : {},
      orderBy: { name: 'asc' },
      include: {
        coach: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });
  }

  async createEkskul(dto: EkskulDto, actorId: string) {
    const row = await this.prisma.extracurricular.create({
      data: {
        name: dto.name.trim(),
        description: dto.description ?? null,
        coachId: dto.coachId ?? null,
        schedule: dto.schedule ?? null,
      },
    });
    await this.audit.log({ actorId, action: 'ekskul.create', entity: 'extracurricular', entityId: row.id });
    return row;
  }

  async updateEkskul(id: string, dto: EkskulDto, actorId: string) {
    await this.prisma.extracurricular.findUniqueOrThrow({ where: { id } });
    const row = await this.prisma.extracurricular.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description ?? null,
        coachId: dto.coachId ?? null,
        schedule: dto.schedule ?? null,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'ekskul.update', entity: 'extracurricular', entityId: id });
    return row;
  }

  async deleteEkskul(id: string, actorId: string) {
    await this.prisma.extracurricular.findUniqueOrThrow({ where: { id } });
    await this.prisma.extracurricular.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'ekskul.delete', entity: 'extracurricular', entityId: id });
    return { deleted: true };
  }

  listEkskulMembers(ekskulId: string) {
    return this.prisma.extracurricularMember.findMany({
      where: { extracurricularId: ekskulId },
      orderBy: { joinedAt: 'asc' },
      include: {
        student: {
          select: {
            id: true, name: true, nis: true,
            enrollments: {
              orderBy: { createdAt: 'desc' }, take: 1,
              include: { class: { select: { name: true } } },
            },
          },
        },
      },
    });
  }

  async addEkskulMember(ekskulId: string, dto: EkskulMemberDto, actorId: string) {
    await this.prisma.extracurricular.findUniqueOrThrow({ where: { id: ekskulId } });
    await this.prisma.student.findUniqueOrThrow({ where: { id: dto.studentId } });
    const dup = await this.prisma.extracurricularMember.findUnique({
      where: {
        extracurricularId_studentId: {
          extracurricularId: ekskulId,
          studentId: dto.studentId,
        },
      },
    });
    if (dup) throw new ConflictException('Siswa sudah menjadi anggota ekskul ini.');
    const row = await this.prisma.extracurricularMember.create({
      data: {
        extracurricularId: ekskulId,
        studentId: dto.studentId,
        role: dto.role ?? null,
      },
    });
    await this.audit.log({ actorId, action: 'ekskul.member_add', entity: 'extracurricular', entityId: ekskulId });
    return row;
  }

  async removeEkskulMember(memberId: string, actorId: string) {
    const m = await this.prisma.extracurricularMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    await this.prisma.extracurricularMember.delete({ where: { id: memberId } });
    await this.audit.log({ actorId, action: 'ekskul.member_remove', entity: 'extracurricular', entityId: m.extracurricularId });
    return { deleted: true };
  }

  // ---- dokumen siswa (bukti prestasi/pelanggaran, berkas umum) ----
  private static readonly DOC_MIME = new Map([
    ['image/jpeg', ['.jpg', '.jpeg']],
    ['image/png', ['.png']],
    ['image/webp', ['.webp']],
    ['application/pdf', ['.pdf']],
  ]);
  private static readonly DOC_MAX = 5 * 1024 * 1024;

  async uploadDocument(
    studentId: string,
    type: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    actorId: string,
  ) {
    await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const allowed = StudentsService.DOC_MIME.get(file.mimetype);
    if (!allowed) throw new BadRequestException('Hanya JPG, PNG, WebP, atau PDF');
    if (file.size > StudentsService.DOC_MAX) {
      throw new BadRequestException('Ukuran file melebihi 5 MB');
    }
    if (!allowed.includes(extname(file.originalname).toLowerCase())) {
      throw new BadRequestException('Ekstensi file tidak sesuai tipenya');
    }
    const docId = randomUUID();
    const safeName = file.originalname.replace(/[^\w.\- ]/g, '_').slice(-80);
    const storageKey = `students/${studentId}/${docId}-${safeName}`;
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    const doc = await this.prisma.document.create({
      data: {
        id: docId,
        ownerId: actorId,
        uploadedBy: actorId,
        studentId,
        type: type || 'lainnya',
        storageKey,
        fileName: safeName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: {
        id: true, type: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true,
      },
    });
    await this.audit.log({
      actorId,
      action: 'student.document.upload',
      entity: 'document',
      entityId: doc.id,
      metadata: { studentId, type },
    });
    return doc;
  }

  /** Stream dokumen milik siswa — staf ber-STUDENT_READ. */
  async openDocument(docId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc || !doc.studentId) throw new NotFoundException('Dokumen tidak ditemukan');
    const buffer = await this.storage.getObjectBuffer(doc.storageKey);
    return { doc, buffer };
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

  /**
   * Bentuk input relasi `parent` untuk update siswa:
   * - sudah tertaut → perbarui nama/HP akun ortu
   * - HP cocok akun lain → tautkan (ortu punya >1 anak)
   * - belum ada → buat akun ortu minimal (password acak — direset via WA)
   */
  /** Cari/buat akun ortu lalu kembalikan id-nya — dipakai saat create(). */
  private async resolveParentId(
    dto: Pick<CreateStudentDto, 'parentName' | 'parentPhone'>,
  ): Promise<string | null> {
    const name = dto.parentName?.trim() || undefined;
    const phone = dto.parentPhone?.trim()
      ? normalizePhone(dto.parentPhone.trim())
      : undefined;
    if (!name && !phone) return null;
    if (phone) {
      const found = await this.prisma.user.findUnique({ where: { phone } });
      if (found) {
        if (name) {
          await this.prisma.user.update({ where: { id: found.id }, data: { name } });
        }
        return found.id;
      }
    }
    const parentRole = await this.prisma.role.findUnique({
      where: { key: 'spmb_parent' },
      select: { id: true },
    });
    const user = await this.prisma.user.create({
      data: {
        name: name ?? 'Orang Tua',
        ...(phone !== undefined ? { phone } : {}),
        passwordHash: await argon2.hash(randomBytes(24).toString('hex')),
        ...(parentRole ? { roles: { create: { roleId: parentRole.id } } } : {}),
      },
      select: { id: true },
    });
    return user.id;
  }

  private async parentData(
    parentId: string | null,
    dto: Pick<UpdateStudentDto, 'parentName' | 'parentPhone'>,
  ) {
    const name = dto.parentName?.trim() || undefined;
    const phone = dto.parentPhone?.trim()
      ? normalizePhone(dto.parentPhone.trim())
      : undefined;
    if (!name && !phone) return undefined;

    if (parentId) {
      if (phone) {
        const clash = await this.prisma.user.findFirst({
          where: { phone, id: { not: parentId } },
          select: { id: true },
        });
        if (clash) {
          throw new ConflictException(
            'Nomor HP sudah dipakai akun lain — tautkan ortu lewat HP itu atau kosongkan.',
          );
        }
      }
      return {
        update: {
          ...(name !== undefined ? { name } : {}),
          ...(phone !== undefined ? { phone } : {}),
        },
      };
    }

    if (phone) {
      const found = await this.prisma.user.findUnique({ where: { phone } });
      if (found) {
        return name !== undefined
          ? { connect: { id: found.id }, update: { name } }
          : { connect: { id: found.id } };
      }
    }
    const parentRole = await this.prisma.role.findUnique({
      where: { key: 'spmb_parent' },
      select: { id: true },
    });
    return {
      create: {
        name: name ?? 'Orang Tua',
        ...(phone !== undefined ? { phone } : {}),
        passwordHash: await argon2.hash(randomBytes(24).toString('hex')),
        ...(parentRole ? { roles: { create: { roleId: parentRole.id } } } : {}),
      },
    };
  }

  // ---------- Orang tua / wali ----------

  /** Daftar ortu yang punya anak terdaftar — untuk halaman Kesiswaan → Orang Tua. */
  async listParents(search?: string) {
    const parents = await this.prisma.user.findMany({
      where: {
        status: { not: 'DISABLED' },
        students: { some: { deletedAt: null } },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' as const } },
                {
                  students: {
                    some: {
                      deletedAt: null,
                      name: { contains: search, mode: 'insensitive' as const },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        students: {
          where: { deletedAt: null },
          select: { id: true, name: true, nis: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 300,
    });
    const ids = parents.flatMap((p) => p.students.map((s) => s.id));
    const openTotals = await this.openInvoiceTotals(ids);
    return parents.map((p) => ({
      ...p,
      studentCount: p.students.length,
      openInvoiceTotal: p.students.reduce(
        (sum, s) => sum + (openTotals.get(s.id) ?? 0),
        0,
      ),
    }));
  }

  /**
   * Detail ortu — data diri, anak-anak, tagihan terbuka semua anak,
   * dan kode formulir titipan (sekali pakai) milik ortu.
   */
  async parentDetail(id: string) {
    const parent = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        createdAt: true,
        students: {
          where: { deletedAt: null },
          select: {
            ...studentSelect,
            enrollments: {
              select: {
                academicYear: { select: { name: true, isActive: true } },
                class: { select: { name: true, gradeLevel: true } },
              },
            },
            candidate: {
              select: {
                registrations: {
                  select: { number: true, status: true },
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!parent || parent.students.length === 0) {
      throw new NotFoundException('Orang tua tidak ditemukan');
    }
    const studentIds = parent.students.map((s) => s.id);
    const [invoices, titipan] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          studentId: { in: studentIds },
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        select: {
          id: true,
          number: true,
          title: true,
          kind: true,
          amount: true,
          status: true,
          dueAt: true,
          studentId: true,
          student: { select: { name: true } },
        },
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.titipanEntry.findMany({
        where: { parentId: id },
        select: {
          id: true,
          formCode: true,
          status: true,
          candidateName: true,
          codeSentAt: true,
          codeUsedAt: true,
          academicYear: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const paidMap = await this.invoicePaidTotals(invoices.map((i) => i.id));
    return {
      parent: {
        id: parent.id,
        name: parent.name,
        phone: parent.phone,
        email: parent.email,
        createdAt: parent.createdAt,
      },
      students: parent.students,
      invoices: invoices.map((i) => {
        const paid = paidMap.get(i.id) ?? 0;
        return { ...i, paidAmount: paid, remaining: Math.max(0, i.amount - paid) };
      }),
      titipan,
    };
  }

  /** Kirim pengingat tagihan gabungan semua anak ke WA ortu (antrean gateway). */
  async remindParent(id: string, actorId: string) {
    const detail = await this.parentDetail(id);
    const phone = detail.parent.phone;
    if (!phone) {
      throw new BadRequestException('Nomor WhatsApp orang tua belum tercatat');
    }
    const open = detail.invoices.filter((i) => i.remaining > 0);
    if (open.length === 0) {
      throw new BadRequestException('Tidak ada tagihan terbuka untuk orang tua ini');
    }
    const school = await this.prisma.school.findFirst({
      select: { name: true },
    });
    const lines = open.map(
      (i) =>
        `• ${i.student?.name ?? 'Siswa'}: ${i.title} — sisa Rp${i.remaining.toLocaleString('id-ID')}` +
        (i.dueAt
          ? ` (tempo ${new Date(i.dueAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})`
          : ''),
    );
    const total = open.reduce((s, i) => s + i.remaining, 0);
    const message =
      `Assalamu'alaikum Bpk/Ibu ${detail.parent.name}.\n\n` +
      `Pengingat tagihan sekolah di ${school?.name ?? 'sekolah'}:\n\n` +
      lines.join('\n') +
      `\n\nTotal sisa: *Rp${total.toLocaleString('id-ID')}*\n\n` +
      `Silakan hubungi Tata Usaha bila ada pertanyaan. Terima kasih.`;
    const wa = await this.whatsapp.enqueue({
      type: 'billing_reminder',
      phone,
      message,
      refType: 'user',
      refId: id,
      actorId,
    });
    await this.audit.log({
      actorId,
      action: 'student.parent_remind',
      entity: 'user',
      entityId: id,
      metadata: { invoices: open.length, total },
    });
    return { ...wa, message };
  }

  /** Total terbayar (SETTLED) per invoice — helper internal ortu. */
  private async invoicePaidTotals(ids: string[]) {
    const map = new Map<string, number>();
    if (ids.length === 0) return map;
    const rows = await this.prisma.paymentAllocation.groupBy({
      by: ['invoiceId'],
      where: { invoiceId: { in: ids }, payment: { status: 'SETTLED' } },
      _sum: { amount: true },
    });
    for (const r of rows) map.set(r.invoiceId, r._sum.amount ?? 0);
    return map;
  }

  /** Sisa tagihan terbuka per siswa — untuk ringkasan daftar ortu. */
  private async openInvoiceTotals(studentIds: string[]) {
    const map = new Map<string, number>();
    if (studentIds.length === 0) return map;
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId: { in: studentIds }, status: { in: ['OPEN', 'PARTIAL'] } },
      select: { id: true, studentId: true, amount: true },
    });
    const paid = await this.invoicePaidTotals(invoices.map((i) => i.id));
    for (const inv of invoices) {
      const remaining = Math.max(0, inv.amount - (paid.get(inv.id) ?? 0));
      if (remaining > 0 && inv.studentId) {
        map.set(inv.studentId, (map.get(inv.studentId) ?? 0) + remaining);
      }
    }
    return map;
  }

  /** PATCH parsial — hanya field yang dikirim yang diubah; sisanya utuh. */
  private toUpdateData(dto: UpdateStudentDto): Prisma.StudentUpdateInput {
    const data: Prisma.StudentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.nis !== undefined) data.nis = dto.nis || null;
    if (dto.nisn !== undefined) data.nisn = dto.nisn || null;
    if (dto.nik !== undefined) data.nik = dto.nik || null;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birthPlace !== undefined) data.birthPlace = dto.birthPlace || null;
    if (dto.birthDate !== undefined) {
      data.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    }
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.status !== undefined) data.status = dto.status;
    // Nama/HP ortu juga tersalin ke kolom buku induk siswa — tetap sinkron.
    if (dto.parentName !== undefined) data.fatherName = dto.parentName || null;
    if (dto.parentPhone !== undefined) {
      data.parentPhone = dto.parentPhone ? normalizePhone(dto.parentPhone) : null;
    }
    return data;
  }

  private toData(dto: CreateStudentDto): Prisma.StudentUncheckedCreateInput {
    return {
      name: dto.name.trim(),
      nis: dto.nis ?? null,
      nisn: dto.nisn ?? null,
      nik: dto.nik ?? null,
      fatherName: dto.parentName ?? null,
      parentPhone: dto.parentPhone ? normalizePhone(dto.parentPhone) : null,
      gender: dto.gender ?? null,
      birthPlace: dto.birthPlace ?? null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      address: dto.address ?? null,
      parentId: dto.parentId ?? null,
    };
  }
}
