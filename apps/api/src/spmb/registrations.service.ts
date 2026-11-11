import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, RegistrationStatus, TitipanEntry } from '@prisma/client';
import {
  PATHWAYS,
  REGISTRATION_EDITABLE,
  REGISTRATION_STATUS_LABELS,
  REQUIRED_DOC_TYPES,
} from '@smpmuh3/types';
import { randomInt } from 'node:crypto';
import argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import {
  normalizePhone,
  UsersService,
} from '../identity/users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { CandidatesService } from './candidates.service';
import { SpmbSettingsService } from './settings.service';
import { TitipanService } from './titipan.service';

const include = {
  candidate: {
    select: {
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
      student: { select: { id: true, name: true, nis: true } },
    },
  },
  wave: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
      psikotesAt: true,
      psikotesNote: true,
      order: true,
    },
  },
} satisfies Prisma.RegistrationInclude;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidatesService,
    private readonly notifications: NotificationsService,
    private readonly settings: SpmbSettingsService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly titipan: TitipanService,
    private readonly users: UsersService,
  ) {}

  listByParent(parentId: string) {
    return this.prisma.registration.findMany({
      where: { parentId },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Ortu login memakai kode formulir — kandidat diambil dari titipannya.
   * Titipan tamu (tanpa kandidat) → kandidat dibuat otomatis dari data
   * titipan di dalam transaksi yang sama; kode terkunci ke kandidat tsb.
   */
  async redeemCode(
    parentId: string,
    dto: { formCode: string; candidateId?: string | undefined; waveId?: string | undefined },
  ) {
    const entry = await this.titipan.findByCode(dto.formCode);
    this.assertCodeUsable(entry);
    if (entry.candidateId && dto.candidateId && entry.candidateId !== dto.candidateId) {
      throw new BadRequestException(
        'Kode formulir ini diterbitkan untuk calon murid lain.',
      );
    }
    return this.redeemForUser(parentId, entry, dto.waveId, dto.candidateId);
  }

  /**
   * Alur utama "Daftar Sekarang": kode unik + No. HP titipan + kata sandi.
   * - HP belum punya akun → akun ortu dibuat (nama sementara "Wali <anak>").
   * - HP sudah punya akun → kata sandi harus cocok (anak kedua dst: pakai
   *   sandi akun yang sama — kode berikutnya otomatis menambah kandidat).
   * Setelah itu kode langsung diredeem → pendaftaran terbuat.
   */
  async redeemPublic(dto: {
    formCode: string;
    phone: string;
    password: string;
    waveId?: string | undefined;
  }) {
    const entry = await this.titipan.findByCode(dto.formCode);
    this.assertCodeUsable(entry);
    const phone = normalizePhone(dto.phone);
    if (!entry.guardianPhone || normalizePhone(entry.guardianPhone) !== phone) {
      throw new BadRequestException(
        'Nomor HP tidak cocok dengan data titipan kode ini — masukkan nomor yang Anda pakai saat titipan.',
      );
    }

    let user = await this.users.findByPhone(phone);
    const existingAccount = !!user;
    if (user) {
      const ok = await argon2
        .verify(user.passwordHash, dto.password)
        .catch(() => false);
      if (!ok) {
        throw new BadRequestException(
          'Nomor HP sudah punya akun — kata sandi salah. Masukkan kata sandi akun Anda, atau pakai Lupa Password bila lupa.',
        );
      }
    } else {
      user = await this.users.createWithRole({
        name: `Wali ${entry.candidateName.trim()}`,
        phone,
        passwordHash: await argon2.hash(dto.password),
        roleKey: 'spmb_parent',
      });
    }

    const registration = await this.redeemForUser(
      user.id,
      entry,
      dto.waveId,
      entry.candidateId ?? undefined,
    );
    return { registration, accountExisted: existingAccount };
  }

  private assertCodeUsable(entry: TitipanEntry) {
    if (entry.status !== 'CODE_SENT') {
      throw new BadRequestException(
        entry.status === 'REGISTERED'
          ? 'Kode formulir ini sudah dipakai.'
          : 'Kode formulir ini belum aktif — tunggu panitia mengirimkannya.',
      );
    }
  }

  /**
   * Inti redeem: resolve kandidat (milik titipan / dibuat dari data
   * titipan), validasi gelombang, lalu buat pendaftaran + klaim kode
   * dalam satu transaksi — kode terkunci ke satu calon murid.
   */
  private async redeemForUser(
    parentId: string,
    entry: TitipanEntry & { academicYear: { id: string; name: string } },
    requestedWaveId?: string | undefined,
    requestedCandidateId?: string | undefined,
  ) {
    // Kandidat: pakai punya titipan; kalau tamu → buat dari data titipan.
    const candidateId = entry.candidateId ?? requestedCandidateId ?? null;
    if (entry.candidateId) {
      await this.candidates.owned(parentId, entry.candidateId);
    } else if (candidateId) {
      await this.candidates.owned(parentId, candidateId);
    }
    const year = entry.academicYear;
    let waveId: string | null = null;
    if (requestedWaveId) {
      const wave = await this.prisma.registrationWave.findUnique({
        where: { id: requestedWaveId },
      });
      if (!wave || !wave.isActive || wave.academicYearId !== year.id) {
        throw new BadRequestException('Gelombang tidak tersedia');
      }
      waveId = wave.id;
    } else {
      // Prioritas: gelombang yang dipasang admin di entri titipan —
      // ortu tak perlu memilih lagi.
      if (entry.waveId) {
        const assigned = await this.prisma.registrationWave.findFirst({
          where: { id: entry.waveId, academicYearId: year.id, isActive: true },
        });
        waveId = assigned?.id ?? null;
      }
      if (!waveId) {
        const waves = await this.prisma.registrationWave.findMany({
          where: { academicYearId: year.id, isActive: true },
          orderBy: { order: 'asc' },
        });
        if (waves.length > 1) {
          throw new BadRequestException(
            `Tahun ajaran ${year.name} punya beberapa gelombang — pilih salah satu.`,
          );
        }
        waveId = waves[0]?.id ?? null;
      }
    }

    const feeAmount = await this.settings.feeAmountFor(waveId, 'registration');
    const number = await this.generateNumber(year);
    // Semua dalam satu transaksi: kandidat titipan-tamu dibuat di sini
    // juga — kode formulir terkunci ke calon murid ini. Klaim entry secara
    // atomik: request kedua yang balapan mendapat count 0 → rollback.
    const registration = await this.prisma.$transaction(async (tx) => {
      let cid = candidateId;
      if (!cid) {
        const cand = await this.candidates.createFromTitipan(parentId, tx, {
          name: entry.candidateName,
          birthPlace: entry.birthPlace,
          birthDate: entry.birthDate,
          previousSchool: entry.previousSchool,
          address: entry.address,
        });
        cid = cand.id;
      } else {
        const existing = await tx.registration.findUnique({
          where: {
            candidateId_academicYearId: {
              candidateId: cid,
              academicYearId: year.id,
            },
          },
        });
        if (existing) {
          throw new ConflictException(
            'Pendaftaran untuk calon siswa ini sudah ada',
          );
        }
      }
      const created = await tx.registration.create({
        data: {
          number,
          candidateId: cid,
          parentId,
          academicYearId: year.id,
          waveId,
          pathway: 'reguler',
          status: 'AWAITING_PAYMENT',
          invoices: {
            create: {
              number: this.generateInvoiceNumber(),
              kind: 'registration_fee',
              title: `Uang Pendaftaran SPMB ${year.name}`,
              amount: feeAmount,
            },
          },
        },
        include: { ...include, invoices: true },
      });
      const claimed = await tx.titipanEntry.updateMany({
        where: { id: entry.id, status: 'CODE_SENT', codeUsedAt: null },
        data: {
          status: 'REGISTERED',
          codeUsedAt: new Date(),
          parentId,
          candidateId: cid,
          registrationId: created.id,
          // Sinkron gelombang entri dengan gelombang pendaftaran yang dipilih.
          waveId,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException('Kode formulir ini sudah dipakai.');
      }
      return created;
    });
    await this.audit.log({
      actorId: parentId,
      action: 'registration.create',
      entity: 'registration',
      entityId: registration.id,
      metadata: { titipanEntryId: entry.id },
    });
    return registration;
  }

  /** Fetch a registration, enforcing parent ownership unless staff. */
  async ownedOrStaff(id: string, userId: string, isStaff: boolean) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include,
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (!isStaff && reg.parentId !== userId) {
      throw new ForbiddenException('Not your registration');
    }
    return reg;
  }

  async updateDraft(
    userId: string,
    id: string,
    dto: {
      pathway?: string | undefined;
      pathwayDetail?: string | undefined;
      formAnswers?: Record<string, string> | undefined;
    },
  ) {
    const reg = await this.ownedOrStaff(id, userId, false);
    this.assertEditable(reg.status);
    if (dto.pathway && !PATHWAYS.includes(dto.pathway as never)) {
      throw new BadRequestException('Jalur pendaftaran tidak valid');
    }
    if (dto.pathway === 'prestasi' && !dto.pathwayDetail) {
      throw new BadRequestException('Pilih jenis prestasi untuk jalur prestasi');
    }
    // Jenis prestasi harus ada aturan diskon aktifnya — jenisnya dikelola
    // admin di Pengaturan SPMB → Diskon (bisa jenis kustom, tak hanya bawaan).
    if (dto.pathway === 'prestasi' && dto.pathwayDetail) {
      const ok = await this.settings.discountSubtypeActive(dto.pathwayDetail);
      if (!ok) {
        throw new BadRequestException(
          'Jenis prestasi tidak aktif — pilih jenis lain atau minta admin mengaktifkannya di pengaturan diskon.',
        );
      }
    }
    const data: Prisma.RegistrationUpdateInput = {};
    if (dto.pathway !== undefined) data.pathway = dto.pathway;
    if (dto.pathwayDetail !== undefined) {
      data.pathwayDetail = dto.pathway === 'prestasi' ? dto.pathwayDetail : null;
    }
    if (dto.formAnswers !== undefined) {
      data.formAnswers = dto.formAnswers;
    }
    const updated = await this.prisma.registration.update({
      where: { id: reg.id },
      data,
      include,
    });
    // Diskon otomatis mengikuti jalur prestasi yang dipilih.
    if (dto.pathway !== undefined || dto.pathwayDetail !== undefined) {
      const detail =
        updated.pathway === 'prestasi' ? updated.pathwayDetail : null;
      const percent = await this.settings.suggestedDiscount(detail);
      if (percent !== updated.discountPercent) {
        await this.prisma.registration.update({
          where: { id: reg.id },
          data: { discountPercent: percent },
        });
        updated.discountPercent = percent;
      }
    }
    return updated;
  }

  /**
   * Kirim pendaftaran — wajib: dokumen (KK, akta, KTP ortu, ijazah/SK),
   * sertifikat untuk jalur prestasi, dan semua pertanyaan wajib terisi.
   */
  async submit(userId: string, id: string) {
    const reg = await this.ownedOrStaff(id, userId, false);
    if (!['FORM_FILLING', 'NEEDS_REVISION'].includes(reg.status)) {
      throw new BadRequestException(
        `Pendaftaran tidak bisa dikirim pada status ${REGISTRATION_STATUS_LABELS[reg.status]}`,
      );
    }

    const docs = await this.prisma.document.findMany({
      where: { registrationId: reg.id },
      select: { type: true },
    });
    const types = new Set(docs.map((d) => d.type));
    const missing = REQUIRED_DOC_TYPES.filter((t) => !types.has(t));
    if (!types.has('ijazah') && !types.has('sk_sekolah')) {
      missing.push('ijazah');
    }
    if (reg.pathway === 'prestasi' && !types.has('sertifikat')) {
      missing.push('sertifikat');
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Dokumen belum lengkap: ${missing.join(', ')}`,
      );
    }

    const cand = reg.candidate as Record<string, unknown> | null;
    const missingFields = [
      ['gender', 'jenis kelamin'],
      ['birthPlace', 'tempat lahir'],
      ['birthDate', 'tanggal lahir'],
      ['nik', 'NIK'],
      ['motherName', 'nama ibu kandung'],
      ['previousSchool', 'asal sekolah'],
      ['address', 'alamat'],
    ]
      .filter(([f]) => !cand?.[f ?? ''])
      .map(([, l]) => l);
    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Lengkapi data calon murid: ${missingFields.join(', ')}`,
      );
    }

    const questions = await this.settings.listQuestions(true);
    const answers = (reg.formAnswers ?? {}) as Record<string, string>;
    const unanswered = questions.filter(
      (q) => q.required && !answers[q.id]?.trim(),
    );
    if (unanswered.length > 0) {
      throw new BadRequestException(
        `Formulir belum lengkap: ${unanswered[0]!.label}`,
      );
    }

    const updated = await this.prisma.registration.update({
      where: { id: reg.id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), revisionNote: null },
      include,
    });
    await this.notifications.notify(userId, {
      title: 'Pendaftaran terkirim',
      body: `Pendaftaran ${reg.number} berhasil dikirim dan menunggu verifikasi berkas.`,
      data: { registrationId: reg.id, number: reg.number },
    });
    await this.audit.log({
      actorId: userId,
      action: 'registration.submit',
      entity: 'registration',
      entityId: reg.id,
      metadata: { number: reg.number },
    });
    return updated;
  }

  /**
   * Cek status publik — nomor pendaftaran + email ATAU nomor HP orang tua.
   */
  async lookup(number: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { number },
      include: {
        wave: { select: { name: true } },
        candidate: { select: { name: true } },
      },
    });
    if (!reg) return null;

    const note =
      reg.status === 'NEEDS_REVISION'
        ? reg.revisionNote
        : reg.status === 'REJECTED' || reg.status === 'ACCEPTED'
          ? reg.decisionNote
          : null;
    return {
      number: reg.number,
      status: reg.status,
      statusLabel: REGISTRATION_STATUS_LABELS[reg.status],
      wave: reg.wave?.name,
      pathway: reg.pathway,
      candidateName: reg.candidate.name,
      submittedAt: reg.submittedAt ?? undefined,
      psikotesAt: reg.psikotesAt ?? undefined,
      psikotesNote: reg.psikotesNote ?? undefined,
      note: note ?? undefined,
      updatedAt: reg.updatedAt,
    };
  }

  /** Staff view — filtered registrations, newest first. */
  listForStaff(options: {
    status?: RegistrationStatus | undefined;
    waveId?: string | undefined;
    academicYearId?: string | undefined;
    search?: string | undefined;
    take?: number | undefined;
  }) {
    const where: Prisma.RegistrationWhereInput = {};
    if (options.status) where.status = options.status;
    if (options.waveId) where.waveId = options.waveId;
    if (options.academicYearId) where.academicYearId = options.academicYearId;
    if (options.search) {
      where.OR = [
        { number: { contains: options.search, mode: 'insensitive' } },
        { candidate: { name: { contains: options.search, mode: 'insensitive' } } },
        { parent: { email: { contains: options.search, mode: 'insensitive' } } },
        { parent: { phone: { contains: options.search } } },
      ];
    }
    return this.prisma.registration.findMany({
      where,
      include: {
        ...include,
        parent: { select: { id: true, email: true, phone: true, name: true } },
        documents: { select: { type: true, verifiedAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(options.take ?? 50, 200),
    });
  }

  /** Staff dashboard — count per status + total. */
  async staffSummary() {
    const rows = await this.prisma.registration.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    );
    return {
      total: rows.reduce((n, r) => n + r._count._all, 0),
      byStatus,
    };
  }

  /** Staff detail — registration + candidate + docs + invoices + parent. */
  staffDetail(id: string) {
    return this.prisma.registration.findUniqueOrThrow({
      where: { id },
      include: {
        ...include,
        parent: { select: { id: true, email: true, phone: true, name: true } },
        documents: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            type: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            verifiedAt: true,
            verifiedBy: true,
            verificationNote: true,
            createdAt: true,
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            payments: { include: { proofDocument: true, receipts: true } },
          },
        },
        installmentPlans: { include: { invoices: true } },
        academicYear: { select: { id: true, name: true, isActive: true } },
      },
    });
  }

  /** Staff-side status transition + audit + parent notification. */
  async transition(
    id: string,
    status: RegistrationStatus,
    actorId: string,
    note?: string | undefined,
  ) {
    const updated = await this.prisma.registration.update({
      where: { id },
      data: {
        status,
        ...(status === 'NEEDS_REVISION'
          ? { revisionNote: note ?? null }
          : {}),
        ...(status === 'ACCEPTED' || status === 'REJECTED'
          ? { decisionNote: note ?? null }
          : {}),
      },
      include: { ...include, parent: { select: { id: true } } },
    });
    await this.audit.log({
      actorId,
      action: `registration.${status.toLowerCase()}`,
      entity: 'registration',
      entityId: id,
      metadata: note ? { note } : undefined,
    });
    const labels: Partial<Record<RegistrationStatus, string>> = {
      NEEDS_REVISION: `Perbaikan diminta: ${note ?? 'lihat catatan'}`,
      VERIFIED:
        'Berkas Anda terverifikasi. Menunggu tagihan pembayaran selanjutnya.',
      SELECTION:
        'Anda dijadwalkan mengikuti psikotes. Lihat detail pada cek status.',
      ACCEPTED: `Selamat — Anda diterima! ${note ?? ''}`.trim(),
      REJECTED: `Pendaftaran tidak dapat dilanjutkan. ${note ?? ''}`.trim(),
      RE_REGISTRATION:
        'Silakan melakukan daftar ulang sekaligus pelunasan di sekolah.',
    };
    const msg = labels[status];
    if (msg) {
      await this.notifications.notify(updated.parentId, {
        title: `Status ${updated.number}`,
        body: msg,
        data: { registrationId: id },
      });
    }
    // Berkas terverifikasi → terbitkan otomatis tagihan DP DSP
    // (diskon jalur prestasi sudah termasuk).
    if (status === 'VERIFIED') {
      await this.payments.issueDpInvoiceIfNeeded(id, actorId);
    }
    // Diterima → terbitkan tagihan pelunasan (dibayar di sekolah).
    if (status === 'ACCEPTED') {
      await this.payments.issueSettlementInvoiceIfNeeded(id, actorId);
    }
    return updated;
  }

  /** Staff: transisi banyak pendaftar sekaligus (mis. lolos psikotes). */
  async bulkTransition(
    ids: string[],
    status: RegistrationStatus,
    actorId: string,
    note?: string | undefined,
  ) {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.transition(id, status, actorId, note);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : 'Gagal',
        });
      }
    }
    return results;
  }

  /**
   * Staff: jadikan calon murid pendaftar yang diterima — membuat record
   * Student (status aktif, kelas belum ditetapkan) tertaut ke candidate.
   */
  async promoteToStudent(id: string, actorId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { candidate: { include: { student: true } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'ACCEPTED' && reg.status !== 'RE_REGISTRATION' && reg.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Hanya pendaftar yang diterima bisa dijadikan murid',
      );
    }
    const cand = reg.candidate;
    if (cand.student) return cand.student; // sudah jadi murid
    // Nama/HP ortu berasal dari akun ortu pendaftar — disalin ke kolom buku
    // induk (fatherName/parentPhone) agar tidak input ulang.
    const parent = reg.parentId
      ? await this.prisma.user.findUnique({
          where: { id: reg.parentId },
          select: { name: true, phone: true },
        })
      : null;
    // Siswa + alih tagihan atomik — siswa tak terbentuk separuh bila
    // pemindahan invoice gagal (retry tak bikin siswa kembar dari kandidat
    // yang sama karena `studentId` unik per kandidat).
    const student = await this.prisma.$transaction(async (tx) => {
      const s = await tx.student.create({
        data: {
          name: cand.name,
          gender: cand.gender,
          birthPlace: cand.birthPlace,
          birthDate: cand.birthDate,
          nisn: cand.nisn,
          nik: cand.nik,
          address: cand.address,
          previousSchool: cand.previousSchool,
          fatherName: parent?.name ?? null,
          motherName: cand.motherName ?? null,
          parentPhone: parent?.phone ?? null,
          candidateId: cand.id,
          parentId: reg.parentId,
        },
      });
      // Tagihan SPMB yang belum lunas (sisa DSP/seragam/dst) ikut ke siswa —
      // penagihan berlanjut di modul keuangan, bukan lagi bagian SPMB.
      await tx.invoice.updateMany({
        where: { registrationId: id, studentId: null, status: { notIn: ['PAID', 'CANCELLED', 'EXPIRED'] } },
        data: { studentId: s.id, academicYearId: reg.academicYearId },
      });
      return s;
    });
    await this.audit.log({
      actorId,
      action: 'registration.promote_student',
      entity: 'student',
      entityId: student.id,
      metadata: { registrationId: id, number: reg.number },
    });
    return student;
  }

  /** Staff: jadikan murid beberapa pendaftar sekaligus. */
  async bulkPromote(ids: string[], actorId: string) {
    const results: { id: string; ok: boolean; studentId?: string; error?: string }[] = [];
    for (const id of ids) {
      try {
        const s = await this.promoteToStudent(id, actorId);
        results.push({ id, ok: true, studentId: s.id });
      } catch (e) {
        results.push({
          id,
          ok: false,
          error: e instanceof Error ? e.message : 'Gagal',
        });
      }
    }
    return results;
  }

  /** Staff: atur jadwal/catatan psikotes — tampil di cek status ortu. */
  async setPsikotes(
    id: string,
    dto: { psikotesAt?: string | undefined; note?: string | undefined },
    actorId: string,
  ) {
    const reg = await this.prisma.registration.update({
      where: { id },
      data: {
        ...(dto.psikotesAt ? { psikotesAt: new Date(dto.psikotesAt) } : {}),
        ...(dto.note !== undefined ? { psikotesNote: dto.note } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'registration.psikotes',
      entity: 'registration',
      entityId: id,
    });
    return reg;
  }

  /** Staff: atur diskon DSP (jalur prestasi, setelah sertifikat diverifikasi). */
  async setDiscount(id: string, percent: number, actorId: string) {
    if (percent < 0 || percent > 100) {
      throw new BadRequestException('Persen diskon harus 0–100');
    }
    const reg = await this.prisma.registration.update({
      where: { id },
      data: { discountPercent: percent },
    });
    await this.audit.log({
      actorId,
      action: 'registration.discount',
      entity: 'registration',
      entityId: id,
      metadata: { percent },
    });
    return reg;
  }

  assertEditable(status: RegistrationStatus) {
    if (!REGISTRATION_EDITABLE.includes(status)) {
      throw new BadRequestException(
        `Registration cannot be edited in status ${status}`,
      );
    }
  }

  private async generateNumber(year: { name: string }) {
    const prefix = `SPMB-${year.name.split('/')[0]}-`;
    for (let i = 0; i < 10; i++) {
      const number = `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await this.prisma.registration.findUnique({
        where: { number },
        select: { id: true },
      });
      if (!clash) return number;
    }
    throw new ConflictException('Could not allocate registration number');
  }

  private generateInvoiceNumber() {
    return `INV-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
  }
}
