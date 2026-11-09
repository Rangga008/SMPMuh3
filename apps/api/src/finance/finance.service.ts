import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import type { InvoiceStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { WhatsappService } from '../spmb/whatsapp.service';
import type {
  CreateBankIncomeDto,
  CreateCashAccountDto,
  CreateExpenseDto,
  CreateFinanceCategoryDto,
  CreateFinanceTransactionDto,
  CreateInvoiceDto,
  CreateSavingsDto,
  GenerateBillingDto,
  RecordBillingPaymentDto,
  UpdateCashAccountDto,
  UpdateExpenseDto,
  UpdateFinanceCategoryDto,
  UpdateFinanceTransactionDto,
  UpdateInvoiceDto,
  UpsertFinanceBudgetDto,
} from './dto/finance.dto';

/** Jenis tagihan SPMB → kategori pemasukan keuangan. */
const KIND_CATEGORY: Record<string, string> = {
  registration_fee: 'spmb_pendaftaran',
  dsp: 'spmb_dsp',
  dsp_dp: 'spmb_dsp',
  settlement: 'spmb_dsp',
  spp: 'spmb_spp',
  seragam: 'spmb_seragam',
  installment: 'spmb_angsuran',
  pendaftaran: 'spmb_pendaftaran',
  kat: 'kat',
  daftar_ulang: 'daftar_ulang',
  tabungan: 'tabungan',
};

export interface FinanceTxFilter {
  type?: 'INCOME' | 'EXPENSE' | undefined;
  categoryId?: string | undefined;
  cashAccountId?: string | undefined;
  academicYearId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  search?: string | undefined;
  take?: number | undefined;
  skip?: number | undefined;
}

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wa: WhatsappService,
  ) {}

  // ---------- Auto-record dari pembayaran SPMB ----------

  /**
   * Catat pembayaran SPMB yang telah SETTLED sebagai pemasukan.
   * Idempotent via paymentId unik — aman dipanggil ulang.
   */
  async recordSpmbPayment(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            registration: { include: { candidate: true } },
          },
        },
      },
    });
    if (!payment || payment.status !== 'SETTLED') return null;

    const key = KIND_CATEGORY[payment.invoice.kind] ?? 'spmb_lainnya';
    const category =
      (await this.prisma.financeCategory.findUnique({ where: { key } })) ??
      (await this.prisma.financeCategory.findUnique({
        where: { key: 'income_lainnya' },
      }));
    if (!category) {
      this.logger.warn('Finance categories belum ter-seed — lewati pencatatan');
      return null;
    }

    const reg = payment.invoice.registration;
    if (!reg) return null; // tagihan siswa dicatat lewat recordBillingPayment
    const tx = await this.prisma.financeTransaction.upsert({
      where: { paymentId: payment.id },
      update: {
        ...(payment.cashAccountId
          ? { cashAccountId: payment.cashAccountId }
          : {}),
      },
      create: {
        type: 'INCOME',
        categoryId: category.id,
        amount: payment.amount,
        occurredAt: payment.paidAt ?? payment.verifiedAt ?? new Date(),
        description: `${payment.invoice.number} — ${payment.invoice.title} · ${reg.number} a.n. ${reg.candidate.name}`,
        source: 'spmb',
        paymentId: payment.id,
        cashAccountId: payment.cashAccountId ?? (await this.defaultAccountId()),
        academicYearId: reg.academicYearId ?? null,
        recordedById: payment.verifiedBy ?? null,
      },
    });
    await this.syncTxMovement(tx.id);
    return tx;
  }

  // ---------- Transaksi ----------

  private where(f: FinanceTxFilter): Prisma.FinanceTransactionWhereInput {
    return {
      ...(f.type ? { type: f.type } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.cashAccountId ? { cashAccountId: f.cashAccountId } : {}),
      ...(f.academicYearId ? { academicYearId: f.academicYearId } : {}),
      ...(f.from || f.to
        ? {
            occurredAt: {
              ...(f.from ? { gte: f.from } : {}),
              ...(f.to ? { lte: f.to } : {}),
            },
          }
        : {}),
      ...(f.search
        ? { description: { contains: f.search, mode: 'insensitive' as const } }
        : {}),
    };
  }

  async listTransactions(f: FinanceTxFilter) {
    const [items, total] = await Promise.all([
      this.prisma.financeTransaction.findMany({
        where: this.where(f),
        include: {
          category: { select: { key: true, name: true, type: true } },
          cashAccount: { select: { id: true, name: true, type: true } },
          recordedBy: { select: { name: true } },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: f.take ?? 200,
        skip: f.skip ?? 0,
      }),
      this.prisma.financeTransaction.count({ where: this.where(f) }),
    ]);
    return { items, total };
  }

  async createTransaction(dto: CreateFinanceTransactionDto, actorId: string) {
    const category = await this.prisma.financeCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    if (category.type !== dto.type) {
      throw new BadRequestException(
        `Kategori "${category.name}" bertipe ${category.type}`,
      );
    }
    if (dto.cashAccountId) await this.assertAccount(dto.cashAccountId);
    const tx = await this.prisma.financeTransaction.create({
      data: {
        type: dto.type,
        categoryId: dto.categoryId,
        amount: dto.amount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        description: dto.description ?? null,
        source: 'manual',
        cashAccountId: dto.cashAccountId ?? (await this.defaultAccountId()),
        academicYearId: dto.academicYearId ?? null,
        recordedById: actorId,
      },
      include: { category: true },
    });
    await this.syncTxMovement(tx.id);
    await this.audit.log({
      actorId,
      action: 'finance.transaction.create',
      entity: 'finance_transaction',
      entityId: tx.id,
      metadata: { type: tx.type, amount: tx.amount },
    });
    return tx;
  }

  async updateTransaction(
    id: string,
    dto: UpdateFinanceTransactionDto,
    actorId: string,
  ) {
    const tx = await this.prisma.financeTransaction.findUnique({
      where: { id },
    });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan');
    if (tx.source !== 'manual') {
      throw new ConflictException(
        `Transaksi otomatis dari ${tx.source} tidak dapat diubah — ubah dokumen sumbernya`,
      );
    }
    if (dto.categoryId) {
      const category = await this.prisma.financeCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Kategori tidak ditemukan');
      if (category.type !== tx.type) {
        throw new BadRequestException(
          `Kategori "${category.name}" bertipe ${category.type}`,
        );
      }
    }
    if (dto.cashAccountId) await this.assertAccount(dto.cashAccountId);
    const updated = await this.prisma.financeTransaction.update({
      where: { id },
      data: {
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.occurredAt ? { occurredAt: new Date(dto.occurredAt) } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.cashAccountId !== undefined
          ? { cashAccountId: dto.cashAccountId }
          : {}),
      },
      include: { category: true },
    });
    await this.syncTxMovement(id);
    await this.audit.log({
      actorId,
      action: 'finance.transaction.update',
      entity: 'finance_transaction',
      entityId: id,
    });
    return updated;
  }

  async deleteTransaction(id: string, actorId: string) {
    const tx = await this.prisma.financeTransaction.findUnique({
      where: { id },
    });
    if (!tx) throw new NotFoundException('Transaksi tidak ditemukan');
    if (tx.source !== 'manual') {
      throw new ConflictException(
        `Transaksi otomatis dari ${tx.source} tidak dapat dihapus — batalkan dokumen sumbernya`,
      );
    }
    await this.prisma.cashMovement.deleteMany({
      where: { refType: 'finance_tx', refId: id },
    });
    await this.prisma.financeTransaction.delete({ where: { id } });
    await this.audit.log({
      actorId,
      action: 'finance.transaction.delete',
      entity: 'finance_transaction',
      entityId: id,
      metadata: { amount: tx.amount },
    });
    return { ok: true };
  }

  // ---------- Kategori ----------

  listCategories() {
    return this.prisma.financeCategory.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateFinanceCategoryDto, actorId: string) {
    const key =
      dto.key ??
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
    const existing = await this.prisma.financeCategory.findUnique({
      where: { key },
    });
    if (existing) throw new ConflictException(`Kategori "${key}" sudah ada`);
    const category = await this.prisma.financeCategory.create({
      data: {
        key,
        name: dto.name,
        type: dto.type,
        standardGroup: dto.standardGroup ?? null,
      },
    });
    await this.audit.log({
      actorId,
      action: 'finance.category.create',
      entity: 'finance_category',
      entityId: category.id,
      metadata: { key },
    });
    return category;
  }

  // ---------- Ringkasan & laporan ----------

  async summary(f: Pick<FinanceTxFilter, 'academicYearId' | 'from' | 'to'>) {
    const where = this.where(f);
    const [income, expense, byCat] = await Promise.all([
      this.prisma.financeTransaction.aggregate({
        where: { ...where, type: 'INCOME' },
        _sum: { amount: true },
      }),
      this.prisma.financeTransaction.aggregate({
        where: { ...where, type: 'EXPENSE' },
        _sum: { amount: true },
      }),
      this.prisma.financeTransaction.groupBy({
        by: ['categoryId', 'type'],
        where,
        _sum: { amount: true },
      }),
    ]);
    const categories = await this.prisma.financeCategory.findMany();
    const byCategory = byCat
      .map((g) => ({
        categoryId: g.categoryId,
        name: categories.find((c) => c.id === g.categoryId)?.name ?? '—',
        type: g.type,
        total: g._sum.amount ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Seri bulanan — dihitung dari transaksi terfilter (batas wajar).
    const txForMonths = await this.prisma.financeTransaction.findMany({
      where,
      select: { type: true, amount: true, occurredAt: true },
      take: 10000,
    });
    const monthly = new Map<string, { month: string; income: number; expense: number }>();
    for (const t of txForMonths) {
      const m = t.occurredAt.toISOString().slice(0, 7);
      const row = monthly.get(m) ?? { month: m, income: 0, expense: 0 };
      if (t.type === 'INCOME') row.income += t.amount;
      else row.expense += t.amount;
      monthly.set(m, row);
    }

    const inc = income._sum.amount ?? 0;
    const exp = expense._sum.amount ?? 0;
    return {
      income: inc,
      expense: exp,
      balance: inc - exp,
      byCategory,
      monthly: [...monthly.values()].sort((a, b) =>
        a.month.localeCompare(b.month),
      ),
    };
  }

  /**
   * Laporan konsolidasi: tren bulanan, rincian per kategori/standar/kas,
   * dan RAB vs realisasi. Periode via academicYearId, semesterId, atau from/to.
   */
  async reports(f: {
    academicYearId?: string | undefined;
    semesterId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    cashAccountId?: string | undefined;
  }) {
    let from = f.from;
    let to = f.to;
    let semesterName: string | null = null;
    if (!from && !to && f.semesterId) {
      const sem = await this.prisma.semester.findUnique({
        where: { id: f.semesterId },
      });
      if (sem) {
        semesterName = sem.name;
        from = sem.startDate ?? undefined;
        to = sem.endDate ?? undefined;
      }
    }

    const occurred = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const inRange = from || to ? occurred : undefined;

    // Bulan-bulan YYYY-MM di dalam rentang (untuk cicilan payroll).
    const monthsInRange: string[] | undefined = inRange
      ? (() => {
          const out: string[] = [];
          const d = new Date((from ?? new Date(0)).toISOString().slice(0, 7) + '-01');
          const end = (to ?? new Date()).toISOString().slice(0, 7);
          while (d.toISOString().slice(0, 7) <= end) {
            out.push(d.toISOString().slice(0, 7));
            d.setMonth(d.getMonth() + 1);
          }
          return out;
        })()
      : undefined;

    const where = this.where({
      academicYearId: f.academicYearId,
      from,
      to,
      cashAccountId: f.cashAccountId,
    });
    const [txs, categories, accounts, budgets, allocs, savingsRows, disbursed, repaidRows, outstanding] =
      await Promise.all([
        this.prisma.financeTransaction.findMany({
          where,
          select: {
            type: true,
            amount: true,
            occurredAt: true,
            categoryId: true,
            cashAccountId: true,
            source: true,
          },
          take: 50000,
        }),
        this.prisma.financeCategory.findMany(),
        this.prisma.cashAccount.findMany({ where: { isActive: true } }),
        f.academicYearId
          ? this.prisma.financeBudget.findMany({
              where: { academicYearId: f.academicYearId },
            })
          : Promise.resolve([]),
        // Pembayaran tagihan per siswa per bulan — untuk laporan per kelas/jenjang.
        this.prisma.paymentAllocation.findMany({
          where: {
            payment: {
              status: 'SETTLED',
              ...(inRange ? { paidAt: inRange } : {}),
              ...(f.cashAccountId ? { cashAccountId: f.cashAccountId } : {}),
            },
            invoice: {
              studentId: { not: null },
              registrationId: null, // pembayaran SPMB bukan tagihan siswa
              ...(f.academicYearId ? { academicYearId: f.academicYearId } : {}),
            },
          },
          select: {
            amount: true,
            payment: { select: { paidAt: true } },
            invoice: {
              select: {
                student: { select: { id: true, name: true } },
                class: { select: { id: true, name: true, gradeLevel: true } },
              },
            },
          },
        }),
        // Tabungan — setor/tarik pada rentang (bukan transaksi keuangan, dicatat terpisah).
        this.prisma.savingsEntry.findMany({
          where: {
            ...(inRange ? { occurredAt: inRange } : {}),
            ...(f.cashAccountId ? { cashAccountId: f.cashAccountId } : {}),
          },
          select: { direction: true, amount: true, occurredAt: true },
          take: 50000,
        }),
        // Pinjaman dicairkan pada rentang.
        this.prisma.loan.aggregate({
          where: inRange ? { createdAt: inRange } : {},
          _count: true,
          _sum: { principal: true },
        }),
        // Cicilan pinjaman terpotong di payroll (run tidak batal).
        this.prisma.payrollItemLine.findMany({
          where: {
            kind: 'LOAN',
            item: {
              run: {
                status: { not: 'VOID' },
                ...(monthsInRange ? { month: { in: monthsInRange } } : {}),
              },
            },
          },
          select: { amount: true },
        }),
        // Sisa pinjaman aktif saat ini.
        this.prisma.loan.aggregate({
          where: { status: 'ACTIVE' },
          _sum: { remaining: true },
        }),
      ]);

    const catName = (id: string) =>
      categories.find((c) => c.id === id)?.name ?? '—';
    const catGroup = (id: string) =>
      categories.find((c) => c.id === id)?.standardGroup ?? 'LAINNYA';

    let income = 0;
    let expense = 0;
    const monthly = new Map<string, { month: string; income: number; expense: number }>();
    const byCat = new Map<string, { type: string; total: number }>();
    const byStandard = new Map<string, number>();
    const byAccount = new Map<string, { income: number; expense: number }>();
    const bySource = new Map<string, number>();
    const bySourceExp = new Map<string, number>();

    for (const t of txs) {
      if (t.type === 'INCOME') income += t.amount;
      else expense += t.amount;

      const m = t.occurredAt.toISOString().slice(0, 7);
      const row = monthly.get(m) ?? { month: m, income: 0, expense: 0 };
      if (t.type === 'INCOME') row.income += t.amount;
      else row.expense += t.amount;
      monthly.set(m, row);

      byCat.set(t.categoryId, {
        type: t.type,
        total: (byCat.get(t.categoryId)?.total ?? 0) + t.amount,
      });

      if (t.type === 'EXPENSE') {
        byStandard.set(catGroup(t.categoryId), (byStandard.get(catGroup(t.categoryId)) ?? 0) + t.amount);
        bySourceExp.set(t.source, (bySourceExp.get(t.source) ?? 0) + t.amount);
      } else {
        bySource.set(t.source, (bySource.get(t.source) ?? 0) + t.amount);
      }

      if (t.cashAccountId) {
        const a = byAccount.get(t.cashAccountId) ?? { income: 0, expense: 0 };
        if (t.type === 'INCOME') a.income += t.amount;
        else a.expense += t.amount;
        byAccount.set(t.cashAccountId, a);
      }
    }

    const catRows = [...byCat.entries()].map(([categoryId, v]) => ({
      categoryId,
      name: catName(categoryId),
      total: v.total,
    }));
    const actualByCat = new Map(byCat.entries());

    // Pembayaran tagihan per siswa × bulan (untuk lembar per kelas/jenjang).
    const byStudentMonth = new Map<
      string,
      {
        studentId: string;
        studentName: string;
        classId: string;
        className: string;
        gradeLevel: number;
        month: string;
        total: number;
      }
    >();
    for (const a of allocs) {
      const paidAt = a.payment.paidAt;
      const st = a.invoice.student;
      if (!paidAt || !st) continue;
      const month = paidAt.toISOString().slice(0, 7);
      const key = `${st.id}|${month}`;
      const row = byStudentMonth.get(key) ?? {
        studentId: st.id,
        studentName: st.name,
        classId: a.invoice.class?.id ?? '',
        className: a.invoice.class?.name ?? 'Tanpa Kelas',
        gradeLevel: a.invoice.class?.gradeLevel ?? 0,
        month,
        total: 0,
      };
      row.total += a.amount;
      byStudentMonth.set(key, row);
    }

    // Tabungan — total dan per bulan.
    let savIn = 0;
    let savOut = 0;
    const savMonthly = new Map<string, { month: string; in: number; out: number }>();
    for (const s of savingsRows) {
      const m = s.occurredAt.toISOString().slice(0, 7);
      const row = savMonthly.get(m) ?? { month: m, in: 0, out: 0 };
      if (s.direction === 'IN') {
        row.in += s.amount;
        savIn += s.amount;
      } else {
        row.out += s.amount;
        savOut += s.amount;
      }
      savMonthly.set(m, row);
    }

    const repaidAmount = repaidRows.reduce((s, l) => s - l.amount, 0);

    // RAB vs realisasi — semua kategori yang punya anggaran atau realisasi
    const plannedMap = new Map(budgets.map((b) => [b.categoryId, b.amount]));
    const budgetCatIds = new Set([...plannedMap.keys(), ...actualByCat.keys()]);
    const budgetRows = [...budgetCatIds]
      .map((categoryId) => {
        const planned = plannedMap.get(categoryId) ?? 0;
        const actual = actualByCat.get(categoryId)?.total ?? 0;
        const cat = categories.find((c) => c.id === categoryId);
        return {
          categoryId,
          name: cat?.name ?? '—',
          type: cat?.type ?? 'EXPENSE',
          planned,
          actual,
          diff: planned - actual,
          pct: planned > 0 ? Math.round((actual / planned) * 100) : actual > 0 ? 100 : 0,
        };
      })
      .sort((a, b) => b.planned - a.planned);

    return {
      range: {
        from: from ?? null,
        to: to ?? null,
        semesterName,
      },
      income,
      expense,
      balance: income - expense,
      monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      incomeByCategory: catRows
        .filter((c) => categories.find((x) => x.id === c.categoryId)?.type === 'INCOME')
        .sort((a, b) => b.total - a.total),
      expenseByCategory: catRows
        .filter((c) => categories.find((x) => x.id === c.categoryId)?.type === 'EXPENSE')
        .sort((a, b) => b.total - a.total),
      expenseByStandard: [...byStandard.entries()]
        .map(([group, total]) => ({ group, total }))
        .sort((a, b) => b.total - a.total),
      incomeBySource: [...bySource.entries()]
        .map(([source, total]) => ({ source, total }))
        .sort((a, b) => b.total - a.total),
      expenseBySource: [...bySourceExp.entries()]
        .map(([source, total]) => ({ source, total }))
        .sort((a, b) => b.total - a.total),
      byCashAccount: accounts.map((a) => {
        const v = byAccount.get(a.id) ?? { income: 0, expense: 0 };
        return { accountId: a.id, name: a.name, key: a.key, ...v, net: v.income - v.expense };
      }),
      budgets: budgetRows,
      paymentsByStudentMonth: [...byStudentMonth.values()],
      savings: {
        in: savIn,
        out: savOut,
        monthly: [...savMonthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
      },
      loans: {
        disbursedCount: disbursed._count,
        disbursedAmount: disbursed._sum.principal ?? 0,
        repaidAmount,
        outstanding: outstanding._sum.remaining ?? 0,
      },
    };
  }

  // ---------- Anggaran ----------

  async listBudgets(academicYearId: string) {
    const budgets = await this.prisma.financeBudget.findMany({
      where: { academicYearId },
      include: { category: true },
      orderBy: { category: { name: 'asc' } },
    });
    const realized = await this.prisma.financeTransaction.groupBy({
      by: ['categoryId'],
      where: { academicYearId },
      _sum: { amount: true },
    });
    return budgets.map((b) => ({
      ...b,
      realized:
        realized.find((r) => r.categoryId === b.categoryId)?._sum.amount ?? 0,
    }));
  }

  async upsertBudget(dto: UpsertFinanceBudgetDto, actorId: string) {
    const [year, category] = await Promise.all([
      this.prisma.academicYear.findUnique({
        where: { id: dto.academicYearId },
      }),
      this.prisma.financeCategory.findUnique({
        where: { id: dto.categoryId },
      }),
    ]);
    if (!year) throw new NotFoundException('Tahun ajaran tidak ditemukan');
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    const budget = await this.prisma.financeBudget.upsert({
      where: {
        academicYearId_categoryId: {
          academicYearId: dto.academicYearId,
          categoryId: dto.categoryId,
        },
      },
      update: { amount: dto.amount, note: dto.note ?? null },
      create: {
        academicYearId: dto.academicYearId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        note: dto.note ?? null,
      },
      include: { category: true },
    });
    await this.audit.log({
      actorId,
      action: 'finance.budget.upsert',
      entity: 'finance_budget',
      entityId: budget.id,
      metadata: { categoryId: dto.categoryId, amount: dto.amount },
    });
    return budget;
  }

  // ---------- Kas & buku bank ----------

  /** Kas default untuk pencatatan otomatis — 'tunai' bila ada. */
  private async defaultAccountId() {
    const acc =
      (await this.prisma.cashAccount.findFirst({
        where: { key: 'tunai', isActive: true },
      })) ??
      (await this.prisma.cashAccount.findFirst({ where: { isActive: true } }));
    return acc?.id ?? null;
  }

  private async assertAccount(id: string) {
    const acc = await this.prisma.cashAccount.findUnique({ where: { id } });
    if (!acc) throw new NotFoundException('Akun kas tidak ditemukan');
    return acc;
  }

  /**
   * Samakan gerakan kas dengan baris transaksi: hapus gerakan lama lalu
   * buat ulang bila transaksi menunjuk kas. Idempotent — aman dipanggil ulang.
   */
  private async syncTxMovement(txId: string) {
    const tx = await this.prisma.financeTransaction.findUnique({
      where: { id: txId },
      include: { category: true },
    });
    await this.prisma.cashMovement.deleteMany({
      where: { refType: 'finance_tx', refId: txId },
    });
    if (!tx?.cashAccountId) return;
    await this.prisma.cashMovement.create({
      data: {
        cashAccountId: tx.cashAccountId,
        direction: tx.type === 'INCOME' ? 'IN' : 'OUT',
        amount: tx.amount,
        refType: 'finance_tx',
        refId: tx.id,
        description: tx.description ?? tx.category.name,
        occurredAt: tx.occurredAt,
      },
    });
  }

  /** Saldo per akun — openingBalance + gerakan. */
  private async accountBalanceMap() {
    const groups = await this.prisma.cashMovement.groupBy({
      by: ['cashAccountId', 'direction'],
      _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const g of groups) {
      const cur = map.get(g.cashAccountId) ?? 0;
      map.set(
        g.cashAccountId,
        cur + (g.direction === 'IN' ? 1 : -1) * (g._sum.amount ?? 0),
      );
    }
    return map;
  }

  async listAccounts() {
    const [accounts, balances] = await Promise.all([
      this.prisma.cashAccount.findMany({ orderBy: { name: 'asc' } }),
      this.accountBalanceMap(),
    ]);
    return accounts.map((a) => ({
      ...a,
      balance: a.openingBalance + (balances.get(a.id) ?? 0),
    }));
  }

  async createAccount(dto: CreateCashAccountDto, actorId: string) {
    const key =
      dto.key ??
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    const existing = await this.prisma.cashAccount.findUnique({ where: { key } });
    if (existing) throw new ConflictException(`Akun "${key}" sudah ada`);
    const account = await this.prisma.cashAccount.create({
      data: {
        key,
        name: dto.name,
        type: dto.type ?? 'CASH',
        openingBalance: dto.openingBalance ?? 0,
      },
    });
    await this.audit.log({
      actorId,
      action: 'finance.account.create',
      entity: 'cash_account',
      entityId: account.id,
      metadata: { key },
    });
    return account;
  }

  async updateAccount(id: string, dto: UpdateCashAccountDto, actorId: string) {
    await this.assertAccount(id);
    const account = await this.prisma.cashAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.openingBalance !== undefined
          ? { openingBalance: dto.openingBalance }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'finance.account.update',
      entity: 'cash_account',
      entityId: id,
    });
    return account;
  }

  /**
   * Buku kas satu akun: saldo awal periode + baris gerakan berurut
   * dengan saldo berjalan.
   */
  async accountLedger(accountId: string, from?: Date, to?: Date) {
    const account = await this.assertAccount(accountId);
    const before = from
      ? await this.prisma.cashMovement.groupBy({
          by: ['direction'],
          where: {
            cashAccountId: accountId,
            occurredAt: { lt: from },
          },
          _sum: { amount: true },
        })
      : [];
    let opening = account.openingBalance;
    for (const g of before) {
      opening += (g.direction === 'IN' ? 1 : -1) * (g._sum.amount ?? 0);
    }
    const rows = await this.prisma.cashMovement.findMany({
      where: {
        cashAccountId: accountId,
        ...(from || to
          ? {
              occurredAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 2000,
    });
    let running = opening;
    const items = rows.map((m) => {
      running += (m.direction === 'IN' ? 1 : -1) * m.amount;
      return { ...m, balance: running };
    });
    return { account, opening, items, closing: running };
  }

  async createBankIncome(dto: CreateBankIncomeDto, actorId: string) {
    const account = await this.assertAccount(dto.cashAccountId);
    if (account.type !== 'BANK') {
      throw new BadRequestException('Akun tujuan harus bertipe BANK');
    }
    const category = await this.prisma.financeCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    if (category.type !== 'INCOME') {
      throw new BadRequestException('Kategori buku bank harus pemasukan');
    }
    const at = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    const description = `Transfer ${dto.senderName}${dto.purpose ? ` — ${dto.purpose}` : ''}`;

    const entry = await this.prisma.$transaction(async (tx) => {
      const ftx = await tx.financeTransaction.create({
        data: {
          type: 'INCOME',
          categoryId: dto.categoryId,
          amount: dto.amount,
          occurredAt: at,
          description,
          source: 'manual',
          cashAccountId: dto.cashAccountId,
          recordedById: actorId,
        },
      });
      await tx.cashMovement.create({
        data: {
          cashAccountId: dto.cashAccountId,
          direction: 'IN',
          amount: dto.amount,
          refType: 'finance_tx',
          refId: ftx.id,
          description,
          occurredAt: at,
        },
      });
      return tx.bankIncome.create({
        data: {
          cashAccountId: dto.cashAccountId,
          categoryId: dto.categoryId,
          senderName: dto.senderName,
          purpose: dto.purpose ?? null,
          amount: dto.amount,
          receivedAt: at,
          txId: ftx.id,
          recordedById: actorId,
        },
      });
    });
    await this.audit.log({
      actorId,
      action: 'finance.bank_income.create',
      entity: 'bank_income',
      entityId: entry.id,
      metadata: { amount: dto.amount, accountId: dto.cashAccountId },
    });
    return entry;
  }

  listBankIncome(cashAccountId?: string, from?: Date, to?: Date) {
    return this.prisma.bankIncome.findMany({
      where: {
        ...(cashAccountId ? { cashAccountId } : {}),
        ...(from || to
          ? {
              receivedAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  // ---------- Tagihan siswa (billing) ----------

  private genInvoiceNumber() {
    return `INV-${new Date().getFullYear()}-${String(
      randomInt(0, 1_000_000),
    ).padStart(6, '0')}`;
  }

  /** Σ alokasi pembayaran per invoice — sumber kebenaran status lunas/parsial. */
  private async invoicePaidMap(ids: string[]) {
    if (ids.length === 0) return new Map<string, number>();
    const groups = await this.prisma.paymentAllocation.groupBy({
      by: ['invoiceId'],
      // Hanya pembayaran yang benar-benar terlunasi — alokasi dari payment
      // pending/gagal tidak menghitung, supaya tagihan masih bisa dibatalkan.
      where: { invoiceId: { in: ids }, payment: { status: 'SETTLED' } },
      _sum: { amount: true },
    });
    return new Map(groups.map((g) => [g.invoiceId, g._sum.amount ?? 0]));
  }

  private invoiceWithPaid<T extends { id: string; amount: number; status: string }>(
    inv: T,
    paidMap: Map<string, number>,
  ) {
    const paid = paidMap.get(inv.id) ?? 0;
    return { ...inv, paidAmount: paid, remaining: Math.max(0, inv.amount - paid) };
  }

  async listInvoices(q: {
    studentId?: string | undefined;
    classId?: string | undefined;
    gradeLevel?: number | undefined;
    academicYearId?: string | undefined;
    semesterId?: string | undefined;
    kind?: string | undefined;
    status?: string | undefined;
    search?: string | undefined;
    take?: number | undefined;
    skip?: number | undefined;
  }) {
    const where: Prisma.InvoiceWhereInput = {
      studentId: q.studentId ? q.studentId : { not: null }, // tagihan siswa saja
      registrationId: null, // tagihan pendaftar SPMB dikelola di modul SPMB, bukan tagihan siswa
      ...(q.classId ? { classId: q.classId } : {}),
      ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
      ...(q.semesterId ? { semesterId: q.semesterId } : {}),
      ...(q.kind ? { kind: q.kind } : {}),
      // Alias praktis: active = tagihan berjalan; history = selesai/dibatalkan.
      ...(q.status === 'active'
        ? { status: { in: ['OPEN', 'PARTIAL'] as InvoiceStatus[] } }
        : q.status === 'history'
          ? { status: { in: ['PAID', 'CANCELLED', 'EXPIRED'] as InvoiceStatus[] } }
          : q.status
            ? { status: q.status as InvoiceStatus }
            : {}),
      ...(q.gradeLevel ? { class: { gradeLevel: q.gradeLevel } } : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: 'insensitive' } },
              { title: { contains: q.search, mode: 'insensitive' } },
              { payerLabel: { contains: q.search, mode: 'insensitive' } },
              { student: { name: { contains: q.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              parent: { select: { name: true, phone: true } },
            },
          },
          class: { select: { id: true, name: true, gradeLevel: true } },
          items: { orderBy: { sortOrder: 'asc' } },
        },
        orderBy: [{ issuedAt: 'desc' }],
        take: q.take ?? 50,
        skip: q.skip ?? 0,
      }),
    ]);
    const paidMap = await this.invoicePaidMap(rows.map((r) => r.id));
    return { items: rows.map((r) => this.invoiceWithPaid(r, paidMap)), total };
  }

  async getInvoice(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            parent: { select: { name: true, phone: true } },
          },
        },
        registration: { select: { number: true } },
        class: { select: { id: true, name: true, gradeLevel: true } },
        academicYear: { select: { id: true, name: true } },
        semester: { select: { id: true, name: true } },
        batch: { select: { id: true, title: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        allocations: {
          include: {
            payment: { select: { id: true, paidAt: true, method: true, cashAccountId: true } },
            item: { select: { label: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!inv) throw new NotFoundException('Tagihan tidak ditemukan');
    const paidMap = await this.invoicePaidMap([id]);
    const itemPaid = await this.prisma.paymentAllocation.groupBy({
      by: ['itemId'],
      where: {
        invoiceId: id,
        itemId: { not: null },
        payment: { status: 'SETTLED' },
      },
      _sum: { amount: true },
    });
    const itemMap = new Map(itemPaid.map((g) => [g.itemId, g._sum.amount ?? 0]));
    const items = inv.items.map((i) => {
      const ip = itemMap.get(i.id) ?? 0;
      return { ...i, paidAmount: ip, remaining: Math.max(0, i.amount - ip) };
    });
    return { ...this.invoiceWithPaid(inv, paidMap), items };
  }

  /** Kelas siswa pada TA tertentu (fallback: enrollment terbaru). */
  private async studentClassId(studentId: string, academicYearId?: string) {
    const enr = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        ...(academicYearId ? { academicYearId } : {}),
      },
      orderBy: { academicYear: { startDate: 'desc' } },
      select: { classId: true },
    });
    return enr?.classId ?? null;
  }

  async createInvoice(dto: CreateInvoiceDto, actorId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true, name: true, status: true, deletedAt: true },
    });
    if (!student || student.deletedAt) {
      throw new NotFoundException('Siswa tidak ditemukan');
    }
    const amount = dto.items.reduce((s, i) => s + i.amount, 0);
    const classId = await this.studentClassId(dto.studentId, dto.academicYearId);
    const invoice = await this.prisma.invoice.create({
      data: {
        number: this.genInvoiceNumber(),
        studentId: dto.studentId,
        payerLabel: dto.payerLabel ?? null,
        title: dto.title,
        kind: dto.kind,
        amount,
        academicYearId: dto.academicYearId ?? null,
        semesterId: dto.semesterId ?? null,
        classId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        note: dto.note ?? null,
        items: {
          create: dto.items.map((i, idx) => ({
            kind: i.kind,
            label: i.label,
            amount: i.amount,
            sortOrder: idx,
          })),
        },
      },
      include: { items: true },
    });
    await this.audit.log({
      actorId,
      action: 'finance.invoice.create',
      entity: 'invoice',
      entityId: invoice.id,
      metadata: { number: invoice.number, studentId: dto.studentId, amount },
    });
    const notification =
      dto.notifyParent === false
        ? { queued: false, reason: 'dimatikan' }
        : await this.tryNotifyInvoice(invoice.id, actorId);
    return { ...invoice, notification };
  }

  async updateInvoice(id: string, dto: UpdateInvoiceDto, actorId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv || !inv.studentId) throw new NotFoundException('Tagihan tidak ditemukan');
    if (inv.status === 'PAID') throw new BadRequestException('Tagihan sudah lunas');
    const paidMap = await this.invoicePaidMap([id]);
    const paid = paidMap.get(id) ?? 0;
    if (dto.status === 'CANCELLED') {
      if (paid > 0) {
        throw new BadRequestException(
          'Tagihan sudah ada pembayaran — tidak bisa dibatalkan',
        );
      }
      const updated = await this.prisma.invoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await this.audit.log({
        actorId,
        action: 'finance.invoice.cancel',
        entity: 'invoice',
        entityId: id,
        metadata: { number: inv.number },
      });
      return updated;
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.payerLabel !== undefined ? { payerLabel: dto.payerLabel } : {}),
        ...(dto.dueAt ? { dueAt: new Date(dto.dueAt) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  /** Generator tagihan massal per kelas/jenjang/seluruh siswa aktif. */
  async generateBilling(dto: GenerateBillingDto, actorId: string) {
    const sourceYearId = dto.sourceAcademicYearId ?? dto.academicYearId;
    // Semua siswa aktif ikut — termasuk yang belum punya rombel
    // (siswa baru hasil SPMB/mutasi belum di-enroll). Enrollment
    // hanya dipakai untuk memetakan kelas & menyaring filter.
    const students = await this.prisma.student.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        enrollments: {
          where: {
            academicYearId: sourceYearId,
            ...(dto.classId ? { classId: dto.classId } : {}),
            ...(dto.gradeLevel ? { class: { gradeLevel: dto.gradeLevel } } : {}),
          },
          select: { classId: true },
          take: 1,
        },
      },
    });
    // Filter kelas/jenjang → hanya siswa dengan enrollment cocok; tanpa
    // filter, siswa tanpa rombel tetap ikut (classId null).
    const scoped =
      dto.classId || dto.gradeLevel
        ? students.filter((s) => s.enrollments.length > 0)
        : students;
    const enrollments = scoped.map((s) => ({
      studentId: s.id,
      classId: s.enrollments[0]?.classId ?? null,
    }));
    if (enrollments.length === 0) {
      throw new BadRequestException(
        'Tidak ada siswa aktif pada cakupan yang dipilih',
      );
    }
    // Siswa yang sudah punya tagihan serupa (kind+title+TA, belum dibatalkan) dilewati.
    const existing = await this.prisma.invoice.findMany({
      where: {
        studentId: { in: enrollments.map((e) => e.studentId) },
        academicYearId: dto.academicYearId,
        kind: dto.kind,
        title: dto.title,
        status: { not: 'CANCELLED' },
      },
      select: { studentId: true },
    });
    const skip = new Set(existing.map((e) => e.studentId));
    const targets = enrollments.filter((e) => !skip.has(e.studentId));
    if (targets.length === 0) {
      throw new BadRequestException(
        `Semua ${enrollments.length} siswa pada cakupan ini sudah memiliki tagihan serupa — tidak ada yang dibuat.`,
      );
    }

    const batch = await this.prisma.billingBatch.create({
      data: {
        kind: dto.kind,
        title: dto.title,
        itemLabel: dto.itemLabel,
        amount: dto.amount,
        academicYearId: dto.academicYearId,
        semesterId: dto.semesterId ?? null,
        classId: dto.classId ?? null,
        gradeLevel: dto.gradeLevel ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        generatedCount: targets.length,
        skippedCount: skip.size,
        createdBy: actorId,
        invoices: {
          create: targets.map((t) => ({
            number: this.genInvoiceNumber(),
            studentId: t.studentId,
            title: dto.title,
            kind: dto.kind,
            amount: dto.amount,
            academicYearId: dto.academicYearId,
            semesterId: dto.semesterId ?? null,
            classId: t.classId,
            dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
            items: {
              create: [{ kind: dto.kind, label: dto.itemLabel, amount: dto.amount }],
            },
          })),
        },
      },
      include: { invoices: { select: { id: true } } },
    });
    await this.audit.log({
      actorId,
      action: 'finance.billing.generate',
      entity: 'billing_batch',
      entityId: batch.id,
      metadata: {
        kind: dto.kind,
        title: dto.title,
        generated: targets.length,
        skipped: skip.size,
      },
    });
    // Pengingat WA otomatis ke ortu tiap siswa — best-effort per invoice.
    let notified = 0;
    let notNotified = 0;
    if (dto.notifyParents !== false) {
      for (const inv of batch.invoices) {
        const r = await this.tryNotifyInvoice(inv.id, actorId);
        if (r.queued) notified += 1;
        else notNotified += 1;
      }
    }
    return { ...batch, notified, notNotified };
  }

  async listBatches(q: { academicYearId?: string | undefined }) {
    return this.prisma.billingBatch.findMany({
      where: q.academicYearId ? { academicYearId: q.academicYearId } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Batalkan batch — hanya invoice tanpa pembayaran yang ikut dibatalkan. */
  async voidBatch(id: string, actorId: string) {
    const batch = await this.prisma.billingBatch.findUnique({
      where: { id },
      include: { invoices: { select: { id: true, status: true } } },
    });
    if (!batch) throw new NotFoundException('Batch tidak ditemukan');
    if (batch.invoices.length === 0) {
      throw new BadRequestException('Batch ini tidak memiliki tagihan.');
    }
    const paidMap = await this.invoicePaidMap(batch.invoices.map((i) => i.id));
    const cancellable = batch.invoices.filter(
      (i) => (paidMap.get(i.id) ?? 0) === 0 && i.status !== 'CANCELLED',
    );
    if (cancellable.length === 0) {
      const allCancelled = batch.invoices.every((i) => i.status === 'CANCELLED');
      throw new BadRequestException(
        allCancelled
          ? 'Semua tagihan dalam batch ini sudah dibatalkan.'
          : 'Tidak ada tagihan yang bisa dibatalkan — semua sudah ada pembayaran.',
      );
    }
    await this.prisma.invoice.updateMany({
      where: { id: { in: cancellable.map((i) => i.id) } },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      actorId,
      action: 'finance.billing.void',
      entity: 'billing_batch',
      entityId: id,
      metadata: { cancelled: cancellable.length, kept: batch.invoices.length - cancellable.length },
    });
    return { cancelled: cancellable.length, kept: batch.invoices.length - cancellable.length };
  }

  /**
   * Terima pembayaran siswa — satu pembayaran bisa dibagi ke beberapa
   * komponen/invoice (alokasi), parsial diperbolehkan.
   */
  async recordBillingPayment(dto: RecordBillingPaymentDto, actorId: string) {
    const invoiceIds = [...new Set(dto.allocations.map((a) => a.invoiceId))];
    const invoices = await this.prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
      include: {
        items: true,
        student: { select: { name: true, parentId: true, parent: { select: { phone: true, name: true } } } },
      },
    });
    const byId = new Map(invoices.map((i) => [i.id, i]));
    const primary = byId.get(dto.invoiceId);
    if (!primary || !primary.studentId) {
      throw new NotFoundException('Tagihan utama tidak ditemukan');
    }
    const paidMap = await this.invoicePaidMap(invoiceIds);
    const allocSum = new Map<string, number>();
    for (const a of dto.allocations) {
      const inv = byId.get(a.invoiceId);
      if (!inv || !inv.studentId) {
        throw new NotFoundException(`Tagihan ${a.invoiceId} tidak ditemukan`);
      }
      if (inv.status === 'CANCELLED' || inv.status === 'PAID' || inv.status === 'EXPIRED') {
        throw new BadRequestException(`Tagihan ${inv.number} tidak dapat dibayar`);
      }
      if (a.itemId && !inv.items.some((i) => i.id === a.itemId)) {
        throw new BadRequestException(`Komponen tidak milik tagihan ${inv.number}`);
      }
      allocSum.set(a.invoiceId, (allocSum.get(a.invoiceId) ?? 0) + a.amount);
    }
    for (const [invId, sum] of allocSum) {
      const inv = byId.get(invId)!;
      const remaining = inv.amount - (paidMap.get(invId) ?? 0);
      if (sum > remaining) {
        throw new BadRequestException(
          `Alokasi melebihi sisa tagihan ${inv.number} (sisa Rp${remaining.toLocaleString('id-ID')})`,
        );
      }
    }
    const total = dto.allocations.reduce((s, a) => s + a.amount, 0);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const cashAccountId = dto.cashAccountId ?? (await this.defaultAccountId());

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          invoiceId: dto.invoiceId,
          provider: 'manual',
          method: dto.method ?? 'cash',
          amount: total,
          status: 'SETTLED',
          paidAt,
          verifiedBy: actorId,
          verifiedAt: paidAt,
          cashAccountId,
          allocations: {
            create: dto.allocations.map((a) => ({
              invoiceId: a.invoiceId,
              itemId: a.itemId ?? null,
              amount: a.amount,
            })),
          },
        },
        include: { allocations: true },
      });
      // Satu gerakan kas sebesar total pembayaran.
      if (cashAccountId) {
        await tx.cashMovement.create({
          data: {
            cashAccountId,
            direction: 'IN',
            amount: total,
            refType: 'payment',
            refId: p.id,
            description: `Pembayaran ${primary.number} · ${primary.student?.name ?? 'siswa'}`,
            occurredAt: paidAt,
          },
        });
      }
      // Satu transaksi pemasukan per alokasi → kategori tetap rinci (SPP vs DSP).
      const allocs = await tx.paymentAllocation.findMany({
        where: { paymentId: p.id },
        include: {
          item: true,
          invoice: { include: { student: { select: { name: true } } } },
        },
      });
      for (const a of allocs) {
        const inv = a.invoice;
        const itemKind = a.item?.kind ?? inv.kind;
        const catKey = KIND_CATEGORY[itemKind] ?? 'income_lainnya';
        const cat = await tx.financeCategory.findUnique({ where: { key: catKey } });
        if (cat) {
          await tx.financeTransaction.create({
            data: {
              type: 'INCOME',
              categoryId: cat.id,
              amount: a.amount,
              occurredAt: paidAt,
              description: `${inv.number} — ${a.item?.label ?? inv.title} · ${inv.student?.name ?? 'siswa'}`,
              source: 'billing',
              paymentAllocationId: a.id,
              cashAccountId,
              academicYearId: inv.academicYearId,
              recordedById: actorId,
            },
          });
        }
      }
      // Status tiap invoice terpengaruh.
      const newPaid = new Map(paidMap);
      for (const a of dto.allocations) {
        newPaid.set(a.invoiceId, (newPaid.get(a.invoiceId) ?? 0) + a.amount);
      }
      for (const inv of invoices) {
        const paid = newPaid.get(inv.id) ?? 0;
        const status = paid >= inv.amount ? 'PAID' : paid > 0 ? 'PARTIAL' : inv.status;
        if (status !== inv.status) {
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              status: status as InvoiceStatus,
              ...(status === 'PAID' ? { paidAt } : {}),
            },
          });
        }
      }
      // Kwitansi otomatis per pembayaran — bisa dicetak dari detail siswa.
      const rcpNumber = await this.nextReceiptNumber(tx);
      const allocDesc = allocs
        .map((a) => `${a.item?.label ?? a.invoice.title} Rp${a.amount.toLocaleString('id-ID')}`)
        .join(', ');
      await tx.receipt.create({
        data: {
          number: rcpNumber,
          paymentId: p.id,
          channel: 'print',
          recipient: primary.student?.parent?.phone ?? '-',
          status: 'ISSUED',
          sentAt: new Date(),
          body: [
            'KWITANSI PEMBAYARAN',
            `No: ${rcpNumber}`,
            `Siswa: ${primary.student?.name ?? '-'}`,
            `Rincian: ${allocDesc}`,
            `Jumlah: Rp ${total.toLocaleString('id-ID')}`,
            `Metode: ${dto.method ?? 'cash'}`,
          ].join('\n'),
        },
      });
      return p;
    });

    await this.audit.log({
      actorId,
      action: 'finance.billing.pay',
      entity: 'payment',
      entityId: payment.id,
      metadata: { amount: total, invoiceId: dto.invoiceId, allocations: dto.allocations.length },
    });
    return this.getBillingReceipt(payment.id);
  }

  /** Nomor kwitansi unik KWT-<tahun>-<6 digit> — dalam tx agar atomik. */
  private async nextReceiptNumber(tx: Prisma.TransactionClient) {
    const prefix = `KWT-${new Date().getFullYear()}-`;
    for (let i = 0; i < 10; i++) {
      const number = `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await tx.receipt.findUnique({
        where: { number },
        select: { id: true },
      });
      if (!clash) return number;
    }
    throw new Error('Could not allocate receipt number');
  }

  /** Data kwitansi pembayaran siswa — rincian alokasi + tautan WA. */
  async getBillingReceipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          select: {
            number: true,
            student: {
              select: {
                name: true,
                nis: true,
                parent: { select: { phone: true, name: true } },
              },
            },
          },
        },
        cashAccount: { select: { name: true } },
        receipts: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, number: true, createdAt: true },
        },
        allocations: {
          include: {
            invoice: { select: { number: true, title: true } },
            item: { select: { label: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Pembayaran tidak ditemukan');
    const cashier = payment.verifiedBy
      ? await this.prisma.user.findUnique({
          where: { id: payment.verifiedBy },
          select: { name: true },
        })
      : null;
    const school = await this.prisma.school.findFirst({
      select: {
        name: true,
        address: true,
        phone: true,
        whatsapp: true,
        headmaster: true,
        headmasterNip: true,
        headmasterSignatureUrl: true,
        logoUrl: true,
      },
    });
    return { ...payment, cashierName: cashier?.name ?? null, school };
  }

  /** Kartu piutang + tabungan satu siswa. */
  async studentBills(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        nis: true,
        status: true,
        parent: { select: { name: true, phone: true } },
        enrollments: {
          orderBy: { academicYear: { startDate: 'desc' } },
          take: 1,
          include: {
            class: { select: { name: true, gradeLevel: true } },
            academicYear: { select: { name: true } },
          },
        },
      },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');
    const invoices = await this.prisma.invoice.findMany({
      where: { studentId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        class: { select: { name: true } },
        academicYear: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { issuedAt: 'desc' }],
    });
    const paidMap = await this.invoicePaidMap(invoices.map((i) => i.id));
    const bills = invoices.map((i) => this.invoiceWithPaid(i, paidMap));
    // Riwayat pembayaran + kwitansi — satu pembayaran bisa menyetor
    // ke beberapa tagihan (alokasi).
    const payments = await this.prisma.payment.findMany({
      where: { invoice: { studentId } },
      include: {
        receipts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { number: true },
        },
        allocations: {
          include: {
            invoice: { select: { number: true, title: true } },
            item: { select: { label: true } },
          },
        },
        cashAccount: { select: { name: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 100,
    });
    return {
      student,
      bills,
      payments,
      savings: await this.studentSavingsBalance(studentId),
    };
  }

  /**
   * Kirim pengingat tagihan ke orang tua lewat gateway WA.
   * Pesan masuk antrean anti-spam; caller mendapat waUrl fallback.
   */
  async notifyInvoice(invoiceId: string, actorId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        student: {
          select: {
            name: true,
            nis: true,
            parent: { select: { name: true, phone: true } },
          },
        },
        academicYear: { select: { name: true } },
      },
    });
    if (!inv) throw new NotFoundException('Tagihan tidak ditemukan');
    const phone = inv.student?.parent?.phone;
    if (!phone) {
      throw new BadRequestException(
        'Nomor WhatsApp orang tua belum tercatat — lengkapi data ortu dulu',
      );
    }
    const paidMap = await this.invoicePaidMap([inv.id]);
    const paid = paidMap.get(inv.id) ?? 0;
    const remaining = Math.max(0, inv.amount - paid);
    if (remaining <= 0) throw new BadRequestException('Tagihan sudah lunas');

    const school = await this.prisma.school.findFirst({ select: { name: true } });
    const parentName = inv.student?.parent?.name ?? 'Bapak/Ibu';
    const lines = [
      `Assalamu'alaikum ${parentName},`,
      '',
      `Kami informasikan tagihan a.n. *${inv.student?.name ?? 'Siswa'}*${inv.student?.nis ? ` (NIS ${inv.student.nis})` : ''}:`,
      `• ${inv.title} — sisa *Rp${remaining.toLocaleString('id-ID')}* dari total Rp${inv.amount.toLocaleString('id-ID')}`,
    ];
    if (inv.dueAt) {
      lines.push(`Jatuh tempo: ${inv.dueAt.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    }
    lines.push(
      '',
      'Silakan lakukan pembayaran ke Tata Usaha/transfer bank sekolah.',
      'Abaikan pesan ini bila sudah membayar. Terima kasih.',
      `— ${school?.name ?? 'Sekolah'}`,
    );

    const result = await this.wa.enqueue({
      type: 'billing_reminder',
      phone,
      message: lines.join('\n'),
      refType: 'invoice',
      refId: inv.id,
      actorId,
    });
    await this.audit.log({
      actorId,
      action: 'finance.invoice.notify',
      entity: 'Invoice',
      entityId: inv.id,
      metadata: { phone: phone.replace(/\d(?=\d{4})/g, '*'), remaining },
    });
    return { ...result, phone };
  }

  /**
   * Notify versi aman untuk auto-kirim saat pembuatan tagihan — tidak melempar
   * error (ortu tanpa HP / invoice lunas dilewati saja).
   */
  private async tryNotifyInvoice(invoiceId: string, actorId: string) {
    try {
      const r = await this.notifyInvoice(invoiceId, actorId);
      return { queued: r.queued === true, reason: null as string | null };
    } catch (e) {
      return {
        queued: false,
        reason:
          e instanceof BadRequestException || e instanceof NotFoundException
            ? e.message
            : 'gagal antre',
      };
    }
  }

  // ---------- Tabungan siswa ----------

  async studentSavingsBalance(studentId: string) {
    const g = await this.prisma.savingsEntry.groupBy({
      by: ['direction'],
      where: { studentId },
      _sum: { amount: true },
    });
    let bal = 0;
    for (const r of g) bal += (r.direction === 'IN' ? 1 : -1) * (r._sum.amount ?? 0);
    return bal;
  }

  async listSavingsEntries(studentId: string) {
    const rows = await this.prisma.savingsEntry.findMany({
      where: { studentId },
      include: {
        cashAccount: { select: { name: true } },
        recordedBy: { select: { name: true } },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    let running = 0;
    return {
      student: await this.prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true, name: true, nis: true,
          enrollments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { class: { select: { name: true } } },
          },
        },
      }),
      balance: await this.studentSavingsBalance(studentId),
      items: rows.map((e) => {
        running += (e.direction === 'IN' ? 1 : -1) * e.amount;
        return { ...e, balance: running };
      }),
    };
  }

  async createSavingsEntry(dto: CreateSavingsDto, actorId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true, name: true },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');
    if (dto.direction === 'OUT') {
      const bal = await this.studentSavingsBalance(dto.studentId);
      if (dto.amount > bal) {
        throw new BadRequestException(
          `Saldo tabungan tidak cukup (sisa Rp${bal.toLocaleString('id-ID')})`,
        );
      }
    }
    const cashAccountId = dto.cashAccountId ?? (await this.defaultAccountId());
    const entry = await this.prisma.$transaction(async (tx) => {
      const e = await tx.savingsEntry.create({
        data: {
          studentId: dto.studentId,
          direction: dto.direction,
          amount: dto.amount,
          note: dto.note ?? null,
          cashAccountId,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          recordedById: actorId,
        },
      });
      if (cashAccountId) {
        await tx.cashMovement.create({
          data: {
            cashAccountId,
            direction: dto.direction,
            amount: dto.amount,
            refType: 'savings',
            refId: e.id,
            description: `Tabungan ${dto.direction === 'IN' ? 'setor' : 'tarik'} — ${student.name}`,
            occurredAt: e.occurredAt,
          },
        });
      }
      return e;
    });
    await this.audit.log({
      actorId,
      action: 'finance.savings.create',
      entity: 'savings_entry',
      entityId: entry.id,
      metadata: { studentId: dto.studentId, direction: dto.direction, amount: dto.amount },
    });
    return entry;
  }

  /** Rekap saldo tabungan semua siswa (untuk halaman tabungan). */
  async savingsSummary(q: {
    search?: string | undefined;
    classId?: string | undefined;
    gradeLevel?: number | undefined;
    take?: number | undefined;
  }) {
    const students = await this.prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
        ...(q.classId || q.gradeLevel
          ? {
              enrollments: {
                some: {
                  ...(q.classId ? { classId: q.classId } : {}),
                  ...(q.gradeLevel ? { class: { gradeLevel: q.gradeLevel } } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        nis: true,
        enrollments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { class: { select: { name: true, gradeLevel: true } } },
        },
      },
      orderBy: { name: 'asc' },
      take: q.take ?? 200,
    });
    const groups = await this.prisma.savingsEntry.groupBy({
      by: ['studentId', 'direction'],
      where: { studentId: { in: students.map((s) => s.id) } },
      _sum: { amount: true },
    });
    const map = new Map<string, number>();
    for (const g of groups) {
      map.set(
        g.studentId,
        (map.get(g.studentId) ?? 0) +
          (g.direction === 'IN' ? 1 : -1) * (g._sum.amount ?? 0),
      );
    }
    return students.map((s) => ({
      id: s.id,
      name: s.name,
      nis: s.nis,
      className: s.enrollments[0]?.class?.name ?? null,
      gradeLevel: s.enrollments[0]?.class?.gradeLevel ?? null,
      balance: map.get(s.id) ?? 0,
    }));
  }

  // ---------- Pengeluaran ----------

  private genExpenseNumber() {
    return `EXP-${new Date().getFullYear()}-${String(
      randomInt(0, 1_000_000),
    ).padStart(6, '0')}`;
  }

  async updateCategory(id: string, dto: UpdateFinanceCategoryDto, actorId: string) {
    const cat = await this.prisma.financeCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Kategori tidak ditemukan');
    const updated = await this.prisma.financeCategory.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.standardGroup !== undefined ? { standardGroup: dto.standardGroup } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'finance.category.update',
      entity: 'finance_category',
      entityId: id,
    });
    return updated;
  }

  /** Sinkronkan tx+gerakan kas untuk satu pengeluaran — hapus lalu buat ulang. */
  private async syncExpensePosting(
    tx: Prisma.TransactionClient,
    expense: {
      id: string;
      number: string;
      description: string;
      categoryId: string;
      academicYearId: string | null;
      occurredAt: Date;
    },
    actorId: string,
  ) {
    const oldAllocs = await tx.expenseAllocation.findMany({
      where: { expenseId: expense.id },
      select: { id: true },
    });
    const oldTxs = await tx.financeTransaction.findMany({
      where: { expenseAllocationId: { in: oldAllocs.map((a) => a.id) } },
      select: { id: true },
    });
    if (oldTxs.length > 0) {
      await tx.cashMovement.deleteMany({
        where: { refType: 'finance_tx', refId: { in: oldTxs.map((t) => t.id) } },
      });
      await tx.financeTransaction.deleteMany({
        where: { id: { in: oldTxs.map((t) => t.id) } },
      });
    }
    const allocs = await tx.expenseAllocation.findMany({
      where: { expenseId: expense.id },
      include: { cashAccount: { select: { name: true } } },
    });
    for (const a of allocs) {
      const ftx = await tx.financeTransaction.create({
        data: {
          type: 'EXPENSE',
          categoryId: expense.categoryId,
          amount: a.amount,
          occurredAt: expense.occurredAt,
          description: `${expense.number} — ${expense.description} (${a.cashAccount.name})`,
          source: 'expense',
          expenseAllocationId: a.id,
          cashAccountId: a.cashAccountId,
          academicYearId: expense.academicYearId,
          recordedById: actorId,
        },
      });
      await tx.cashMovement.create({
        data: {
          cashAccountId: a.cashAccountId,
          direction: 'OUT',
          amount: a.amount,
          refType: 'finance_tx',
          refId: ftx.id,
          description: `${expense.number} — ${expense.description}`,
          occurredAt: expense.occurredAt,
        },
      });
    }
  }

  async listExpenses(q: {
    categoryId?: string | undefined;
    standardGroup?: string | undefined;
    cashAccountId?: string | undefined;
    academicYearId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    search?: string | undefined;
    take?: number | undefined;
    skip?: number | undefined;
  }) {
    const where: Prisma.ExpenseWhereInput = {
      status: 'POSTED',
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.standardGroup ? { category: { standardGroup: q.standardGroup } } : {}),
      ...(q.cashAccountId ? { allocations: { some: { cashAccountId: q.cashAccountId } } } : {}),
      ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
      ...(q.from || q.to
        ? {
            occurredAt: {
              ...(q.from ? { gte: q.from } : {}),
              ...(q.to ? { lte: q.to } : {}),
            },
          }
        : {}),
      ...(q.search
        ? {
            OR: [
              { number: { contains: q.search, mode: 'insensitive' } },
              { description: { contains: q.search, mode: 'insensitive' } },
              { vendor: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: {
          category: { select: { name: true, standardGroup: true } },
          allocations: { include: { cashAccount: { select: { name: true } } } },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: q.take ?? 50,
        skip: q.skip ?? 0,
      }),
    ]);
    return { items: rows, total };
  }

  async getExpense(id: string) {
    const e = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        category: { select: { name: true, standardGroup: true } },
        academicYear: { select: { name: true } },
        allocations: { include: { cashAccount: { select: { name: true, type: true } } } },
        creator: { select: { name: true } },
      },
    });
    if (!e) throw new NotFoundException('Pengeluaran tidak ditemukan');
    return e;
  }

  async createExpense(dto: CreateExpenseDto, actorId: string) {
    const category = await this.prisma.financeCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException('Kategori tidak ditemukan');
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException('Kategori harus bertipe pengeluaran');
    }
    const total = dto.allocations.reduce((s, a) => s + a.amount, 0);
    for (const a of dto.allocations) await this.assertAccount(a.cashAccountId);

    const expense = await this.prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          number: this.genExpenseNumber(),
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
          vendor: dto.vendor ?? null,
          description: dto.description,
          categoryId: dto.categoryId,
          academicYearId: dto.academicYearId ?? null,
          totalAmount: total,
          note: dto.note ?? null,
          documentId: dto.documentId ?? null,
          createdBy: actorId,
          allocations: {
            create: dto.allocations.map((a) => ({
              cashAccountId: a.cashAccountId,
              amount: a.amount,
            })),
          },
        },
      });
      await this.syncExpensePosting(tx, e, actorId);
      return e;
    });
    await this.audit.log({
      actorId,
      action: 'finance.expense.create',
      entity: 'expense',
      entityId: expense.id,
      metadata: { number: expense.number, total },
    });
    return expense;
  }

  async updateExpense(id: string, dto: UpdateExpenseDto, actorId: string) {
    const e = await this.getExpense(id);
    if (e.status === 'VOID') {
      throw new BadRequestException('Pengeluaran sudah dibatalkan');
    }
    if (dto.categoryId) {
      const category = await this.prisma.financeCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Kategori tidak ditemukan');
      if (category.type !== 'EXPENSE') {
        throw new BadRequestException('Kategori harus bertipe pengeluaran');
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.allocations) {
        for (const a of dto.allocations) {
          const acc = await tx.cashAccount.findUnique({ where: { id: a.cashAccountId } });
          if (!acc) throw new NotFoundException('Akun kas tidak ditemukan');
        }
        // Hapus tx+gerakan lama SEBELUM alokasi diputus (FK SET NULL akan
        // memutus relasi tx↔alokasi — tx harus dibersihkan lebih dulu).
        const oldAllocs = await tx.expenseAllocation.findMany({
          where: { expenseId: id },
          select: { id: true },
        });
        const oldTxs = await tx.financeTransaction.findMany({
          where: { expenseAllocationId: { in: oldAllocs.map((a) => a.id) } },
          select: { id: true },
        });
        if (oldTxs.length > 0) {
          await tx.cashMovement.deleteMany({
            where: { refType: 'finance_tx', refId: { in: oldTxs.map((t) => t.id) } },
          });
          await tx.financeTransaction.deleteMany({
            where: { id: { in: oldTxs.map((t) => t.id) } },
          });
        }
        await tx.expenseAllocation.deleteMany({ where: { expenseId: id } });
        await tx.expenseAllocation.createMany({
          data: dto.allocations.map((a) => ({
            expenseId: id,
            cashAccountId: a.cashAccountId,
            amount: a.amount,
          })),
        });
      }
      const newTotal = dto.allocations
        ? dto.allocations.reduce((s, a) => s + a.amount, 0)
        : e.totalAmount;
      const u = await tx.expense.update({
        where: { id },
        data: {
          ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
          ...(dto.description ? { description: dto.description } : {}),
          ...(dto.vendor !== undefined ? { vendor: dto.vendor } : {}),
          ...(dto.occurredAt ? { occurredAt: new Date(dto.occurredAt) } : {}),
          ...(dto.academicYearId !== undefined
            ? { academicYearId: dto.academicYearId }
            : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          totalAmount: newTotal,
        },
      });
      await this.syncExpensePosting(tx, u, actorId);
      return u;
    });
    await this.audit.log({
      actorId,
      action: 'finance.expense.update',
      entity: 'expense',
      entityId: id,
    });
    return updated;
  }

  /** Batalkan pengeluaran — tx + gerakan kas ikut ditarik. */
  async voidExpense(id: string, actorId: string) {
    const e = await this.getExpense(id);
    if (e.status === 'VOID') {
      throw new BadRequestException('Sudah dibatalkan');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.expense.update({ where: { id }, data: { status: 'VOID' } });
      const allocs = await tx.expenseAllocation.findMany({
        where: { expenseId: id },
        select: { id: true },
      });
      const txs = await tx.financeTransaction.findMany({
        where: { expenseAllocationId: { in: allocs.map((a) => a.id) } },
        select: { id: true },
      });
      await tx.cashMovement.deleteMany({
        where: { refType: 'finance_tx', refId: { in: txs.map((t) => t.id) } },
      });
      await tx.financeTransaction.deleteMany({
        where: { id: { in: txs.map((t) => t.id) } },
      });
    });
    await this.audit.log({
      actorId,
      action: 'finance.expense.void',
      entity: 'expense',
      entityId: id,
      metadata: { number: e.number },
    });
    return { voided: true };
  }

  /**
   * Rekap penggunaan dana: sumber kas × kategori — menjawab
   * "uang KAT dipakai untuk kategori apa berapa".
   */
  async fundUsage(q: {
    academicYearId?: string | undefined;
    cashAccountId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
  }) {
    const groups = await this.prisma.expenseAllocation.groupBy({
      by: ['cashAccountId'],
      where: {
        ...(q.cashAccountId ? { cashAccountId: q.cashAccountId } : {}),
        expense: {
          status: 'POSTED',
          ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
          ...(q.from || q.to
            ? {
                occurredAt: {
                  ...(q.from ? { gte: q.from } : {}),
                  ...(q.to ? { lte: q.to } : {}),
                },
              }
            : {}),
        },
      },
      _sum: { amount: true },
    });
    const perCat = await this.prisma.expenseAllocation.findMany({
      where: {
        ...(q.cashAccountId ? { cashAccountId: q.cashAccountId } : {}),
        expense: {
          status: 'POSTED',
          ...(q.academicYearId ? { academicYearId: q.academicYearId } : {}),
          ...(q.from || q.to
            ? {
                occurredAt: {
                  ...(q.from ? { gte: q.from } : {}),
                  ...(q.to ? { lte: q.to } : {}),
                },
              }
            : {}),
        },
      },
      select: {
        cashAccountId: true,
        amount: true,
        expense: {
          select: {
            category: { select: { name: true, standardGroup: true } },
          },
        },
      },
    });
    const accounts = await this.prisma.cashAccount.findMany({
      where: { id: { in: groups.map((g) => g.cashAccountId) } },
      select: { id: true, key: true, name: true, type: true },
    });
    // Bentuk: per kas → per kategori (dan per standar).
    const result = accounts.map((a) => {
      const rows = perCat.filter((p) => p.cashAccountId === a.id);
      const byCat = new Map<string, number>();
      const byStd = new Map<string, number>();
      for (const r of rows) {
        const catName = r.expense.category.name;
        const std = r.expense.category.standardGroup ?? 'Tanpa standar';
        byCat.set(catName, (byCat.get(catName) ?? 0) + r.amount);
        byStd.set(std, (byStd.get(std) ?? 0) + r.amount);
      }
      return {
        account: a,
        total: groups.find((g) => g.cashAccountId === a.id)?._sum.amount ?? 0,
        byCategory: [...byCat.entries()].map(([name, amount]) => ({ name, amount })),
        byStandard: [...byStd.entries()].map(([name, amount]) => ({ name, amount })),
      };
    });
    return result.sort((x, y) => y.total - x.total);
  }
}
