import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';

/**
 * Pengaturan SPMB yang dikelola admin:
 * gelombang pendaftaran, biaya, aturan diskon prestasi, dan pertanyaan formulir.
 */
@Injectable()
export class SpmbSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Gelombang ----------
  listWaves(academicYearId?: string) {
    return this.prisma.registrationWave.findMany({
      where: academicYearId ? { academicYearId } : {},
      orderBy: { order: 'asc' },
      include: { academicYear: { select: { name: true } } },
    });
  }

  /** Gelombang aktif untuk tahun ajaran aktif — dipakai ortu saat mendaftar. */
  async activeWaves() {
    const year = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
    });
    if (!year) return [];
    return this.prisma.registrationWave.findMany({
      where: { academicYearId: year.id, isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  async saveWave(
    id: string | undefined,
    dto: {
      name: string;
      startDate: string;
      endDate: string;
      order?: number;
      isActive?: boolean;
      academicYearId?: string;
      psikotesAt?: string;
      psikotesNote?: string;
    },
  ) {
    const yearId =
      dto.academicYearId ??
      (
        await this.prisma.academicYear.findFirstOrThrow({
          where: { isActive: true },
        })
      ).id;
    const data = {
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      order: dto.order ?? 1,
      isActive: dto.isActive ?? true,
      academicYearId: yearId,
      ...(dto.psikotesAt !== undefined
        ? { psikotesAt: dto.psikotesAt ? new Date(dto.psikotesAt) : null }
        : {}),
      ...(dto.psikotesNote !== undefined
        ? { psikotesNote: dto.psikotesNote || null }
        : {}),
    };
    if (id) {
      return this.prisma.registrationWave.update({ where: { id }, data });
    }
    return this.prisma.registrationWave.create({ data });
  }

  deleteWave(id: string) {
    return this.prisma.registrationWave.delete({ where: { id } });
  }

  // ---------- Biaya ----------
  listFees() {
    return this.prisma.spmbFee.findMany({ orderBy: { key: 'asc' } });
  }

  async feeAmount(key: string): Promise<number> {
    const fee = await this.prisma.spmbFee.findUnique({ where: { key } });
    if (!fee) throw new BadRequestException(`Biaya '${key}' belum diatur`);
    return fee.amount;
  }

  async updateFee(key: string, amount: number, actorId: string) {
    const fee = await this.prisma.spmbFee.findUnique({ where: { key } });
    if (!fee) throw new NotFoundException(`Biaya '${key}' tidak ditemukan`);
    return this.prisma.spmbFee.update({
      where: { key },
      data: { amount, updatedBy: actorId },
    });
  }

  // ---------- Biaya per gelombang (override) ----------

  /**
   * Biaya efektif untuk sebuah gelombang: override WaveFee bila ada,
   * jika tidak pakai fee global. Mengembalikan { key, label, global, amount, overridden }.
   */
  async feesForWave(waveId: string) {
    const wave = await this.prisma.registrationWave.findUnique({
      where: { id: waveId },
      include: { fees: true },
    });
    if (!wave) throw new NotFoundException('Gelombang tidak ditemukan');
    const globals = await this.listFees();
    const overrides = new Map(wave.fees.map((f) => [f.key, f.amount]));
    return globals.map((g) => ({
      key: g.key,
      label: g.label,
      global: g.amount,
      amount: overrides.get(g.key) ?? g.amount,
      overridden: overrides.has(g.key),
    }));
  }

  /** Nominal biaya untuk pasangan (gelombang, key) — dipakai saat membuat tagihan. */
  async feeAmountFor(waveId: string | null, key: string): Promise<number> {
    if (waveId) {
      const override = await this.prisma.waveFee.findUnique({
        where: { waveId_key: { waveId, key } },
      });
      if (override) return override.amount;
    }
    return this.feeAmount(key);
  }

  async saveWaveFee(waveId: string, key: string, amount: number, actorId: string) {
    await this.prisma.registrationWave.findUniqueOrThrow({
      where: { id: waveId },
    });
    return this.prisma.waveFee.upsert({
      where: { waveId_key: { waveId, key } },
      update: { amount, updatedBy: actorId },
      create: { waveId, key, amount, updatedBy: actorId },
    });
  }

  /** Hapus override → gelombang kembali ke tarif global. */
  deleteWaveFee(waveId: string, key: string) {
    return this.prisma.waveFee.deleteMany({
      where: { waveId, key },
    });
  }

  // ---------- Diskon ----------
  listDiscounts() {
    return this.prisma.discountRule.findMany({ orderBy: { subType: 'asc' } });
  }

  async upsertDiscount(
    subType: string,
    dto: { label: string; percent: number; minScore?: number; isActive?: boolean },
  ) {
    const data = {
      label: dto.label,
      percent: dto.percent,
      minScore: dto.minScore ?? null,
      isActive: dto.isActive ?? true,
    };
    return this.prisma.discountRule.upsert({
      where: { subType },
      update: data,
      create: { subType, ...data },
    });
  }

  /** Diskon yang disarankan untuk sub-jalur prestasi (dari aturan aktif). */
  async suggestedDiscount(subType?: string | null): Promise<number> {
    if (!subType) return 0;
    const rule = await this.prisma.discountRule.findUnique({
      where: { subType },
    });
    return rule?.isActive ? rule.percent : 0;
  }

  // ---------- Pertanyaan formulir ----------
  listQuestions(activeOnly = false) {
    return this.prisma.formQuestion.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { order: 'asc' },
    });
  }

  async saveQuestion(
    id: string | undefined,
    dto: {
      label: string;
      helpText?: string;
      fieldType?: string;
      options?: string[];
      required?: boolean;
      order?: number;
      isActive?: boolean;
    },
  ) {
    const data = {
      label: dto.label,
      helpText: dto.helpText ?? null,
      fieldType: dto.fieldType ?? 'text',
      ...(dto.options ? { options: dto.options } : {}),
      required: dto.required ?? false,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    };
    if (id) {
      return this.prisma.formQuestion.update({ where: { id }, data });
    }
    return this.prisma.formQuestion.create({ data });
  }

  deleteQuestion(id: string) {
    return this.prisma.formQuestion.delete({ where: { id } });
  }
}
