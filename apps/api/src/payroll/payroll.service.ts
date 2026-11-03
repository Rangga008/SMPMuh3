import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import type {
  AttendanceEntryDto,
  BosHonorDto,
  CreateLoanDto,
  CreatePayrollRunDto,
  DeductionTypeDto,
  EmployeeDeductionDto,
  EmployeeHonorDto,
  EmployeePayrollSettingsDto,
  HonorTypeDto,
  PayScaleDto,
  UpdateLoanDto,
  UpdatePayScaleDto,
} from './dto/payroll.dto';

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map((x) => Number(x) || 0);
  return { gte: new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)), lt: new Date(Date.UTC(y ?? 1970, m ?? 1, 1)) };
};

const PENSION_KEY = 'pensiun';
const SALARY_CATEGORY_KEY = 'ops_gaji';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertMonth(m: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
      throw new BadRequestException('Format bulan harus YYYY-MM');
    }
    return m;
  }

  // ---------- Pay scale ----------

  listPayScales() {
    return this.prisma.payScale.findMany({
      orderBy: { minYears: 'asc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async createPayScale(dto: PayScaleDto, actorId: string) {
    const scale = await this.prisma.payScale.create({
      data: {
        name: dto.name,
        minYears: dto.minYears,
        maxYears: dto.maxYears ?? null,
        hourlyRate: dto.hourlyRate,
        transportRate: dto.transportRate,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({ actorId, action: 'payroll.payscale.create', entity: 'pay_scale', entityId: scale.id });
    return scale;
  }

  async updatePayScale(id: string, dto: UpdatePayScaleDto, actorId: string) {
    const s = await this.prisma.payScale.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Golongan tidak ditemukan');
    const u = await this.prisma.payScale.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.minYears !== undefined ? { minYears: dto.minYears } : {}),
        ...(dto.maxYears !== undefined ? { maxYears: dto.maxYears } : {}),
        ...(dto.hourlyRate !== undefined ? { hourlyRate: dto.hourlyRate } : {}),
        ...(dto.transportRate !== undefined ? { transportRate: dto.transportRate } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'payroll.payscale.update', entity: 'pay_scale', entityId: id });
    return u;
  }

  async deletePayScale(id: string, actorId: string) {
    const used = await this.prisma.employee.count({ where: { payScaleId: id } });
    if (used > 0) {
      throw new ConflictException(`Golongan masih dipakai ${used} pegawai`);
    }
    await this.prisma.payScale.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'payroll.payscale.delete', entity: 'pay_scale', entityId: id });
    return { deleted: true };
  }

  /** Pengaturan payroll pegawai: golongan, masa kerja, jam wajib, tarif. */
  async updateEmployeeSettings(employeeId: string, dto: EmployeePayrollSettingsDto, actorId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    if (dto.payScaleId) {
      const s = await this.prisma.payScale.findUnique({ where: { id: dto.payScaleId } });
      if (!s) throw new NotFoundException('Golongan tidak ditemukan');
    }
    const u = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(dto.payScaleId !== undefined ? { payScaleId: dto.payScaleId } : {}),
        ...(dto.workStartDate !== undefined
          ? { workStartDate: dto.workStartDate ? new Date(dto.workStartDate) : null }
          : {}),
        ...(dto.weeklyRequiredMinutes !== undefined ? { weeklyRequiredMinutes: dto.weeklyRequiredMinutes } : {}),
        ...(dto.hourlyRate !== undefined ? { hourlyRate: dto.hourlyRate } : {}),
        ...(dto.transportRate !== undefined ? { transportRate: dto.transportRate } : {}),
        ...(dto.isCertified !== undefined ? { isCertified: dto.isCertified } : {}),
      },
      include: { payScale: true },
    });
    await this.audit.log({ actorId, action: 'payroll.employee.update', entity: 'employee', entityId: employeeId });
    return u;
  }

  /** Daftar pegawai + ringkasan payroll (golongan efektif dari masa kerja). */
  async listEmployeePayroll() {
    const emps = await this.prisma.employee.findMany({
      where: { isActive: true },
      include: { payScale: true },
      orderBy: { name: 'asc' },
    });
    const now = new Date();
    return emps.map((e) => {
      const years = e.workStartDate
        ? Math.max(0, Math.floor((now.getTime() - e.workStartDate.getTime()) / (365.25 * 864e5)))
        : null;
      return { ...e, serviceYears: years };
    });
  }

  // ---------- Absensi ----------

  async upsertAttendance(date: string, entries: AttendanceEntryDto[], actorId: string) {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Tanggal tidak valid');
    const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    await this.prisma.$transaction(
      entries.map((e) =>
        this.prisma.employeeAttendance.upsert({
          where: { employeeId_date: { employeeId: e.employeeId, date: day } },
          update: {
            status: e.status,
            teachingMinutes: e.teachingMinutes ?? 0,
            note: e.note ?? null,
            recordedBy: actorId,
          },
          create: {
            employeeId: e.employeeId,
            date: day,
            status: e.status,
            teachingMinutes: e.teachingMinutes ?? 0,
            note: e.note ?? null,
            recordedBy: actorId,
          },
        }),
      ),
    );
    await this.audit.log({ actorId, action: 'payroll.attendance.upsert', entity: 'employee_attendance', entityId: date, metadata: { count: entries.length } });
    return { saved: entries.length };
  }

  listAttendance(month: string, employeeId?: string) {
    this.assertMonth(month);
    const range = monthRange(month);
    return this.prisma.employeeAttendance.findMany({
      where: {
        date: { gte: range.gte, lt: range.lt },
        ...(employeeId ? { employeeId } : {}),
      },
      include: { employee: { select: { name: true, nip: true } } },
      orderBy: [{ date: 'asc' }, { employee: { name: 'asc' } }],
    });
  }

  // ---------- Honor ----------

  private slug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }

  listHonorTypes() {
    return this.prisma.honorType.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { honors: true } } },
    });
  }

  async createHonorType(dto: HonorTypeDto, actorId: string) {
    const key = dto.key ?? this.slug(dto.name);
    const existing = await this.prisma.honorType.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`Tipe honor "${key}" sudah ada`);
    const t = await this.prisma.honorType.create({
      data: { key, name: dto.name, period: dto.period, defaultAmount: dto.defaultAmount ?? 0 },
    });
    await this.audit.log({ actorId, action: 'payroll.honortype.create', entity: 'honor_type', entityId: t.id });
    return t;
  }

  async updateHonorType(id: string, dto: Partial<HonorTypeDto> & { isActive?: boolean }, actorId: string) {
    const t = await this.prisma.honorType.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tipe honor tidak ditemukan');
    const u = await this.prisma.honorType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.period !== undefined ? { period: dto.period } : {}),
        ...(dto.defaultAmount !== undefined ? { defaultAmount: dto.defaultAmount } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'payroll.honortype.update', entity: 'honor_type', entityId: id });
    return u;
  }

  async deleteHonorType(id: string, actorId: string) {
    const used = await this.prisma.employeeHonor.count({ where: { honorTypeId: id } });
    if (used > 0) throw new ConflictException(`Masih dipakai ${used} honor pegawai`);
    await this.prisma.honorType.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'payroll.honortype.delete', entity: 'honor_type', entityId: id });
    return { deleted: true };
  }

  listEmployeeHonors(employeeId?: string) {
    return this.prisma.employeeHonor.findMany({
      where: employeeId ? { employeeId } : {},
      include: {
        employee: { select: { name: true } },
        honorType: { select: { name: true, period: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createEmployeeHonor(dto: EmployeeHonorDto, actorId: string) {
    const [emp, type] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: dto.employeeId } }),
      this.prisma.honorType.findUnique({ where: { id: dto.honorTypeId } }),
    ]);
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    if (!type) throw new NotFoundException('Tipe honor tidak ditemukan');
    if (type.period === 'ONE_TIME' && (!dto.eventName || !dto.eventMonth)) {
      throw new BadRequestException('Honor sekali bayar wajib nama kegiatan + bulan (eventMonth)');
    }
    const h = await this.prisma.employeeHonor.create({
      data: {
        employeeId: dto.employeeId,
        honorTypeId: dto.honorTypeId,
        amount: dto.amount ?? null,
        sessions: dto.sessions ?? 1,
        eventName: dto.eventName ?? null,
        eventMonth: dto.eventMonth ?? null,
        validFrom: dto.validFrom ?? null,
        validTo: dto.validTo ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({ actorId, action: 'payroll.honor.create', entity: 'employee_honor', entityId: h.id });
    return h;
  }

  async updateEmployeeHonor(id: string, dto: Partial<EmployeeHonorDto>, actorId: string) {
    const h = await this.prisma.employeeHonor.findUnique({ where: { id } });
    if (!h) throw new NotFoundException('Honor tidak ditemukan');
    const u = await this.prisma.employeeHonor.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.sessions !== undefined ? { sessions: dto.sessions } : {}),
        ...(dto.eventName !== undefined ? { eventName: dto.eventName } : {}),
        ...(dto.eventMonth !== undefined ? { eventMonth: dto.eventMonth } : {}),
        ...(dto.validFrom !== undefined ? { validFrom: dto.validFrom } : {}),
        ...(dto.validTo !== undefined ? { validTo: dto.validTo } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'payroll.honor.update', entity: 'employee_honor', entityId: id });
    return u;
  }

  async deleteEmployeeHonor(id: string, actorId: string) {
    await this.prisma.employeeHonor.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'payroll.honor.delete', entity: 'employee_honor', entityId: id });
    return { deleted: true };
  }

  // ---------- Potongan ----------

  listDeductionTypes() {
    return this.prisma.deductionType.findMany({ orderBy: { name: 'asc' } });
  }

  async createDeductionType(dto: DeductionTypeDto, actorId: string) {
    const key = dto.key ?? this.slug(dto.name);
    const existing = await this.prisma.deductionType.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`Tipe potongan "${key}" sudah ada`);
    const t = await this.prisma.deductionType.create({
      data: {
        key,
        name: dto.name,
        defaultAmount: dto.defaultAmount ?? 0,
        isRecurring: dto.isRecurring ?? true,
      },
    });
    await this.audit.log({ actorId, action: 'payroll.dedtype.create', entity: 'deduction_type', entityId: t.id });
    return t;
  }

  async updateDeductionType(id: string, dto: Partial<DeductionTypeDto> & { isActive?: boolean }, actorId: string) {
    const u = await this.prisma.deductionType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.defaultAmount !== undefined ? { defaultAmount: dto.defaultAmount } : {}),
        ...(dto.isRecurring !== undefined ? { isRecurring: dto.isRecurring } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'payroll.dedtype.update', entity: 'deduction_type', entityId: id });
    return u;
  }

  listEmployeeDeductions(employeeId?: string) {
    return this.prisma.employeeDeduction.findMany({
      where: employeeId ? { employeeId } : {},
      include: {
        employee: { select: { name: true } },
        deductionType: { select: { name: true, key: true, isRecurring: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createEmployeeDeduction(dto: EmployeeDeductionDto, actorId: string) {
    const [emp, type] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: dto.employeeId } }),
      this.prisma.deductionType.findUnique({ where: { id: dto.deductionTypeId } }),
    ]);
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    if (!type) throw new NotFoundException('Tipe potongan tidak ditemukan');
    const d = await this.prisma.employeeDeduction.create({
      data: {
        employeeId: dto.employeeId,
        deductionTypeId: dto.deductionTypeId,
        amount: dto.amount ?? null,
        month: dto.month || null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({ actorId, action: 'payroll.deduction.create', entity: 'employee_deduction', entityId: d.id });
    return d;
  }

  async updateEmployeeDeduction(id: string, dto: Partial<EmployeeDeductionDto>, actorId: string) {
    const u = await this.prisma.employeeDeduction.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.month !== undefined ? { month: dto.month || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({ actorId, action: 'payroll.deduction.update', entity: 'employee_deduction', entityId: id });
    return u;
  }

  async deleteEmployeeDeduction(id: string, actorId: string) {
    await this.prisma.employeeDeduction.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'payroll.deduction.delete', entity: 'employee_deduction', entityId: id });
    return { deleted: true };
  }

  // ---------- Pinjaman / koperasi ----------

  listLoans(employeeId?: string, status?: string) {
    return this.prisma.loan.findMany({
      where: {
        ...(employeeId ? { employeeId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: {
        employee: { select: { name: true, nip: true } },
        cashAccount: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createLoan(dto: CreateLoanDto, actorId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    this.assertMonth(dto.startMonth);
    const fee = dto.fee ?? 0;
    const total = dto.principal + fee;
    const monthly = Math.ceil(total / dto.installments);

    if (dto.source === 'KASBON') {
      if (!dto.cashAccountId) {
        throw new BadRequestException('Kasbon wajib memilih kas sumber dana');
      }
      const acc = await this.prisma.cashAccount.findUnique({ where: { id: dto.cashAccountId } });
      if (!acc) throw new NotFoundException('Akun kas tidak ditemukan');
    }

    const loan = await this.prisma.$transaction(async (tx) => {
      const l = await tx.loan.create({
        data: {
          employeeId: dto.employeeId,
          source: dto.source,
          principal: dto.principal,
          fee,
          installments: dto.installments,
          monthlyAmount: monthly,
          remaining: total,
          startMonth: dto.startMonth,
          cashAccountId: dto.source === 'KASBON' ? dto.cashAccountId ?? null : null,
          note: dto.note ?? null,
        },
      });
      // KASBON → uang keluar dari kas sekolah sekarang
      if (dto.source === 'KASBON' && dto.cashAccountId) {
        await tx.cashMovement.create({
          data: {
            cashAccountId: dto.cashAccountId,
            direction: 'OUT',
            amount: dto.principal,
            refType: 'loan',
            refId: l.id,
            description: `Kasbon ${emp.name}`,
            occurredAt: new Date(),
          },
        });
      }
      return l;
    });
    await this.audit.log({ actorId, action: 'payroll.loan.create', entity: 'loan', entityId: loan.id, metadata: { source: dto.source, principal: dto.principal } });
    return loan;
  }

  async updateLoan(id: string, dto: UpdateLoanDto, actorId: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException('Pinjaman tidak ditemukan');
    const wasCancelled = loan.status === 'CANCELLED';
    const u = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.loan.update({
        where: { id },
        data: {
          ...(dto.monthlyAmount !== undefined ? { monthlyAmount: dto.monthlyAmount } : {}),
          ...(dto.remaining !== undefined ? { remaining: dto.remaining } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });
      // Batalkan kasbon → kembalikan uang ke kas (in reversal)
      if (!wasCancelled && dto.status === 'CANCELLED' && loan.source === 'KASBON' && loan.cashAccountId) {
        const outstanding = updated.remaining;
        const paidBack = loan.principal + loan.fee - outstanding;
        const toReturn = loan.principal - paidBack;
        if (toReturn > 0) {
          await tx.cashMovement.create({
            data: {
              cashAccountId: loan.cashAccountId,
              direction: 'IN',
              amount: toReturn,
              refType: 'loan',
              refId: loan.id,
              description: 'Pembatalan kasbon — sisa pokok kembali ke kas',
              occurredAt: new Date(),
            },
          });
        }
      }
      return updated;
    });
    await this.audit.log({ actorId, action: 'payroll.loan.update', entity: 'loan', entityId: id });
    return u;
  }

  // ---------- Dana pensiun ----------

  async pensionLedger(employeeId: string) {
    const entries = await this.prisma.pensionEntry.findMany({
      where: { employeeId },
      orderBy: [{ month: 'asc' }],
    });
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, name: true, nip: true },
    });
    if (!employee) throw new NotFoundException('Pegawai tidak ditemukan');
    const total = entries.reduce((s, e) => s + e.amount, 0);
    return { employee, entries, total };
  }

  async pensionSummary() {
    const groups = await this.prisma.pensionEntry.groupBy({
      by: ['employeeId'],
      _sum: { amount: true },
    });
    const emps = await this.prisma.employee.findMany({
      where: { id: { in: groups.map((g) => g.employeeId) } },
      select: { id: true, name: true, nip: true },
    });
    return emps
      .map((e) => ({
        employee: e,
        total: groups.find((g) => g.employeeId === e.id)?._sum.amount ?? 0,
      }))
      .sort((a, b) => b.total - a.total);
  }

  // ---------- Honor BOS ----------

  listBosHonors(month?: string, employeeId?: string) {
    if (month) this.assertMonth(month);
    return this.prisma.bosHonor.findMany({
      where: {
        ...(month ? { month } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: { employee: { select: { name: true, nip: true, isCertified: true } } },
      orderBy: [{ month: 'desc' }, { employee: { name: 'asc' } }],
    });
  }

  async upsertBosHonor(dto: BosHonorDto, actorId: string) {
    this.assertMonth(dto.month);
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new NotFoundException('Pegawai tidak ditemukan');
    const h = await this.prisma.bosHonor.upsert({
      where: { employeeId_month: { employeeId: dto.employeeId, month: dto.month } },
      update: {
        amount: dto.amount,
        certified: dto.certified ?? emp.isCertified,
        note: dto.note ?? null,
      },
      create: {
        employeeId: dto.employeeId,
        month: dto.month,
        amount: dto.amount,
        certified: dto.certified ?? emp.isCertified,
        note: dto.note ?? null,
      },
    });
    await this.audit.log({ actorId, action: 'payroll.boshonor.upsert', entity: 'bos_honor', entityId: h.id });
    return h;
  }

  async deleteBosHonor(id: string, actorId: string) {
    await this.prisma.bosHonor.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'payroll.boshonor.delete', entity: 'bos_honor', entityId: id });
    return { deleted: true };
  }

  // ---------- Payroll run ----------

  async listRuns() {
    const runs = await this.prisma.payrollRun.findMany({
      include: {
        academicYear: { select: { name: true } },
        cashAccount: { select: { name: true } },
        items: { select: { netAmount: true } },
        _count: { select: { items: true } },
      },
      orderBy: { month: 'desc' },
    });
    return runs.map(({ items, ...r }) => ({
      ...r,
      totalNet: items.reduce((s, i) => s + i.netAmount, 0),
    }));
  }

  getRun(id: string) {
    return this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        academicYear: { select: { name: true } },
        cashAccount: { select: { name: true } },
        items: {
          include: {
            employee: {
              select: { name: true, nip: true, type: true, payScale: { select: { name: true } } },
            },
            lines: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { employee: { name: 'asc' } },
        },
      },
    });
  }

  private async computeItems(tx: Prisma.TransactionClient, runId: string) {
    const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    const month = run.month;
    const range = monthRange(month);

    const employees = await tx.employee.findMany({
      where: { isActive: true },
      include: { payScale: true },
      orderBy: { name: 'asc' },
    });
    const attendance = await tx.employeeAttendance.findMany({
      where: { date: { gte: range.gte, lt: range.lt } },
    });
    const honors = await tx.employeeHonor.findMany({
      where: { isActive: true },
      include: { honorType: true },
    });
    const deductions = await tx.employeeDeduction.findMany({
      where: { isActive: true },
      include: { deductionType: true },
    });
    const loans = await tx.loan.findMany({
      where: { status: 'ACTIVE', startMonth: { lte: month } },
    });
    const bos = await tx.bosHonor.findMany({ where: { month } });
    const now = new Date();

    // hapus item lama (recompute)
    await tx.payrollItem.deleteMany({ where: { runId } });

    const items: {
      employeeId: string;
      workedMinutes: number;
      requiredMinutes: number;
      basePay: number;
      transportPay: number;
      grossAmount: number;
      deductionAmount: number;
      netAmount: number;
      lines: { kind: 'BASE' | 'TRANSPORT' | 'HONOR' | 'DEDUCTION' | 'LOAN' | 'PENSION' | 'BOS_HONOR'; label: string; amount: number; refId?: string | null }[];
    }[] = [];

    for (const emp of employees) {
      const att = attendance.filter((a) => a.employeeId === emp.id);
      const worked = att
        .filter((a) => a.status === 'HADIR' || a.status === 'TELAT')
        .reduce((s, a) => s + a.teachingMinutes, 0);

      const required = emp.weeklyRequiredMinutes * run.weeks;
      // transport: menit hadir aktual bila ada catatan, else jam wajib
      const transportMinutes = att.length > 0 ? worked : required;

      const years = emp.workStartDate
        ? Math.max(0, Math.floor((now.getTime() - emp.workStartDate.getTime()) / (365.25 * 864e5)))
        : null;
      const scale =
        emp.payScale ??
        (years !== null
          ? await tx.payScale.findFirst({
              where: {
                isActive: true,
                minYears: { lte: years },
                OR: [{ maxYears: null }, { maxYears: { gte: years } }],
              },
              orderBy: { minYears: 'desc' },
            })
          : null);
      const hourly = emp.hourlyRate ?? scale?.hourlyRate ?? 0;
      const transportRate = emp.transportRate ?? scale?.transportRate ?? 0;

      const basePay = Math.round((required / 60) * hourly);
      const transportPay = Math.round((transportMinutes / 60) * transportRate);

      const lines: (typeof items)[number]['lines'] = [];
      if (basePay > 0)
        lines.push({
          kind: 'BASE',
          label: `Gaji wajib ${Math.round(required / 60)} jam × ${run.weeks} minggu`,
          amount: basePay,
        });
      if (transportPay > 0)
        lines.push({
          kind: 'TRANSPORT',
          label: `Transport ${Math.round(transportMinutes / 60)} jam`,
          amount: transportPay,
        });

      let gross = basePay + transportPay;
      let ded = 0;

      for (const h of honors.filter((x) => x.employeeId === emp.id)) {
        if (h.validFrom && h.validFrom > month) continue;
        if (h.validTo && h.validTo < month) continue;
        const t = h.honorType;
        if (t.period === 'ONE_TIME' && h.eventMonth !== month) continue;
        const amt = (h.amount ?? t.defaultAmount) * (t.period === 'PER_SESSION' ? h.sessions : 1);
        if (amt <= 0) continue;
        const label =
          t.period === 'PER_SESSION'
            ? `${t.name} (${h.sessions} sesi)`
            : t.period === 'ONE_TIME'
              ? `${t.name}${h.eventName ? ` — ${h.eventName}` : ''}`
              : t.name;
        lines.push({ kind: 'HONOR', label, amount: amt, refId: h.id });
        gross += amt;
      }

      for (const b of bos.filter((x) => x.employeeId === emp.id && !x.certified)) {
        if (b.amount <= 0) continue;
        lines.push({ kind: 'BOS_HONOR', label: 'Honor BOS (non-sertifikasi)', amount: b.amount, refId: b.id });
        gross += b.amount;
      }

      for (const d of deductions.filter((x) => x.employeeId === emp.id)) {
        if (d.month && d.month !== month) continue;
        const amt = d.amount ?? d.deductionType.defaultAmount;
        if (amt <= 0) continue;
        const kind = d.deductionType.key === PENSION_KEY ? 'PENSION' : 'DEDUCTION';
        lines.push({ kind, label: d.deductionType.name, amount: -amt, refId: d.id });
        ded += amt;
      }

      for (const l of loans.filter((x) => x.employeeId === emp.id)) {
        const amt = Math.min(l.monthlyAmount, l.remaining);
        if (amt <= 0) continue;
        const src = l.source === 'KASBON' ? 'Kasbon' : l.source === 'KOOPERASI' ? 'Koperasi' : 'Pinjaman luar';
        lines.push({ kind: 'LOAN', label: `Angsuran ${src} (sisa ${l.remaining - amt})`, amount: -amt, refId: l.id });
        ded += amt;
      }

      items.push({
        employeeId: emp.id,
        workedMinutes: worked,
        requiredMinutes: required,
        basePay,
        transportPay,
        grossAmount: gross,
        deductionAmount: ded,
        netAmount: gross - ded,
        lines,
      });
    }

    for (const it of items) {
      await tx.payrollItem.create({
        data: {
          runId,
          employeeId: it.employeeId,
          workedMinutes: it.workedMinutes,
          requiredMinutes: it.requiredMinutes,
          basePay: it.basePay,
          transportPay: it.transportPay,
          grossAmount: it.grossAmount,
          deductionAmount: it.deductionAmount,
          netAmount: it.netAmount,
          lines: { create: it.lines },
        },
      });
    }
    return items.length;
  }

  async createRun(dto: CreatePayrollRunDto, actorId: string) {
    this.assertMonth(dto.month);
    const existing = await this.prisma.payrollRun.findUnique({ where: { month: dto.month } });
    if (existing) throw new ConflictException(`Run ${dto.month} sudah ada (status ${existing.status})`);
    const run = await this.prisma.$transaction(async (tx) => {
      const r = await tx.payrollRun.create({
        data: {
          month: dto.month,
          weeks: dto.weeks ?? 4,
          academicYearId: dto.academicYearId ?? null,
          note: dto.note ?? null,
          createdBy: actorId,
        },
      });
      await this.computeItems(tx, r.id);
      return r;
    });
    await this.audit.log({ actorId, action: 'payroll.run.create', entity: 'payroll_run', entityId: run.id, metadata: { month: dto.month } });
    return this.getRun(run.id);
  }

  async recomputeRun(id: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Run tidak ditemukan');
    if (run.status !== 'DRAFT') {
      throw new ConflictException('Hanya run DRAFT yang bisa dihitung ulang');
    }
    await this.prisma.$transaction((tx) => this.computeItems(tx, id));
    await this.audit.log({ actorId, action: 'payroll.run.recompute', entity: 'payroll_run', entityId: id });
    return this.getRun(id);
  }

  async finalizeRun(id: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Run tidak ditemukan');
    if (run.status !== 'DRAFT') {
      throw new ConflictException(`Status ${run.status} tidak bisa difinalkan`);
    }
    const u = await this.prisma.payrollRun.update({
      where: { id },
      data: { status: 'FINALIZED', finalizedBy: actorId, finalizedAt: new Date() },
    });
    await this.audit.log({ actorId, action: 'payroll.run.finalize', entity: 'payroll_run', entityId: id });
    return u;
  }

  /** Bayar run: gerakan kas + tx per item + potong pinjaman + catat pensiun. */
  async payRun(id: string, cashAccountId: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { items: { include: { lines: true, employee: { select: { name: true } } } } },
    });
    if (!run) throw new NotFoundException('Run tidak ditemukan');
    if (run.status !== 'FINALIZED') {
      throw new ConflictException('Run harus FINALIZED sebelum dibayar');
    }
    const acc = await this.prisma.cashAccount.findUnique({ where: { id: cashAccountId } });
    if (!acc) throw new NotFoundException('Akun kas tidak ditemukan');
    const salaryCat = await this.prisma.financeCategory.findUnique({
      where: { key: SALARY_CATEGORY_KEY },
    });
    if (!salaryCat) throw new NotFoundException('Kategori gaji belum ada');

    await this.prisma.$transaction(async (tx) => {
      for (const item of run.items) {
        if (item.netAmount > 0) {
          const ftx = await tx.financeTransaction.create({
            data: {
              type: 'EXPENSE',
              categoryId: salaryCat.id,
              amount: item.netAmount,
              occurredAt: new Date(),
              description: `Gaji ${item.employee.name} — ${run.month}`,
              source: 'payroll',
              payrollItemId: item.id,
              cashAccountId,
              recordedById: actorId,
            },
          });
          await tx.cashMovement.create({
            data: {
              cashAccountId,
              direction: 'OUT',
              amount: item.netAmount,
              refType: 'finance_tx',
              refId: ftx.id,
              description: `Gaji ${item.employee.name} — ${run.month}`,
              occurredAt: new Date(),
            },
          });
        }
        // angsuran pinjaman → kurangi sisa
        for (const line of item.lines.filter((l) => l.kind === 'LOAN' && l.refId)) {
          await tx.loan.update({
            where: { id: line.refId as string },
            data: {
              remaining: { decrement: Math.abs(line.amount) },
            },
          });
          const l = await tx.loan.findUniqueOrThrow({ where: { id: line.refId as string } });
          if (l.remaining <= 0) {
            await tx.loan.update({ where: { id: l.id }, data: { status: 'PAID_OFF', remaining: 0 } });
          }
        }
        // potongan pensiun → buku pensiun
        for (const line of item.lines.filter((l) => l.kind === 'PENSION')) {
          await tx.pensionEntry.create({
            data: {
              employeeId: item.employeeId,
              month: run.month,
              amount: Math.abs(line.amount),
              payrollItemId: item.id,
              note: line.label,
            },
          });
        }
      }
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date(), cashAccountId },
      });
    });
    await this.audit.log({ actorId, action: 'payroll.run.pay', entity: 'payroll_run', entityId: id, metadata: { cashAccountId } });
    return this.getRun(id);
  }

  /** Void: DRAFT/FINALIZED → hapus item; PAID → tarik kas + kembalikan pinjaman/pensiun. */
  async voidRun(id: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { items: { include: { lines: true } } },
    });
    if (!run) throw new NotFoundException('Run tidak ditemukan');
    if (run.status === 'VOID') throw new BadRequestException('Sudah VOID');

    await this.prisma.$transaction(async (tx) => {
      if (run.status === 'PAID') {
        const txs = await tx.financeTransaction.findMany({
          where: { payrollItem: { runId: id } },
          select: { id: true },
        });
        await tx.cashMovement.deleteMany({
          where: { refType: 'finance_tx', refId: { in: txs.map((t) => t.id) } },
        });
        await tx.financeTransaction.deleteMany({ where: { id: { in: txs.map((t) => t.id) } } });
        // kembalikan angsuran pinjaman
        for (const item of run.items) {
          for (const line of item.lines.filter((l) => l.kind === 'LOAN' && l.refId)) {
            const l = await tx.loan.findUnique({ where: { id: line.refId as string } });
            if (l) {
              await tx.loan.update({
                where: { id: l.id },
                data: {
                  remaining: { increment: Math.abs(line.amount) },
                  status: 'ACTIVE',
                },
              });
            }
          }
        }
        await tx.pensionEntry.deleteMany({
          where: { payrollItemId: { in: run.items.map((i) => i.id) } },
        });
      }
      await tx.payrollRun.update({
        where: { id },
        data: { status: 'VOID', paidAt: null },
      });
    });
    await this.audit.log({ actorId, action: 'payroll.run.void', entity: 'payroll_run', entityId: id });
    return { voided: true };
  }

  async deleteRun(id: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Run tidak ditemukan');
    if (run.status !== 'DRAFT' && run.status !== 'VOID') {
      throw new ConflictException('Hanya run DRAFT/VOID yang bisa dihapus');
    }
    await this.prisma.payrollRun.delete({ where: { id } });
    await this.audit.log({ actorId, action: 'payroll.run.delete', entity: 'payroll_run', entityId: id });
    return { deleted: true };
  }
}
