import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import type {
  CreateFinanceCategoryDto,
  CreateFinanceTransactionDto,
  UpdateFinanceTransactionDto,
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
};

export interface FinanceTxFilter {
  type?: 'INCOME' | 'EXPENSE' | undefined;
  categoryId?: string | undefined;
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
    return this.prisma.financeTransaction.upsert({
      where: { paymentId: payment.id },
      update: {},
      create: {
        type: 'INCOME',
        categoryId: category.id,
        amount: payment.amount,
        occurredAt: payment.paidAt ?? payment.verifiedAt ?? new Date(),
        description: `${payment.invoice.number} — ${payment.invoice.title} · ${reg.number} a.n. ${reg.candidate.name}`,
        source: 'spmb',
        paymentId: payment.id,
        academicYearId: reg.academicYearId ?? null,
        recordedById: payment.verifiedBy ?? null,
      },
    });
  }

  // ---------- Transaksi ----------

  private where(f: FinanceTxFilter): Prisma.FinanceTransactionWhereInput {
    return {
      ...(f.type ? { type: f.type } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
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
    const tx = await this.prisma.financeTransaction.create({
      data: {
        type: dto.type,
        categoryId: dto.categoryId,
        amount: dto.amount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        description: dto.description ?? null,
        source: 'manual',
        academicYearId: dto.academicYearId ?? null,
        recordedById: actorId,
      },
      include: { category: true },
    });
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
        'Transaksi otomatis dari SPMB tidak dapat diubah — ubah pembayarannya',
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
    const updated = await this.prisma.financeTransaction.update({
      where: { id },
      data: {
        ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.occurredAt ? { occurredAt: new Date(dto.occurredAt) } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      include: { category: true },
    });
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
        'Transaksi otomatis dari SPMB tidak dapat dihapus',
      );
    }
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
      data: { key, name: dto.name, type: dto.type },
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
}
