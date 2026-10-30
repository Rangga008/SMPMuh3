import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  Invoice,
  Payment,
  PaymentStatus,
  RegistrationStatus,
} from '@prisma/client';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReceiptsService } from './receipts.service';

/**
 * Payment provider adapter — swap implementations per provider
 * (mock in dev; Midtrans/Xendit/etc. behind the same interface later).
 */
export interface PaymentProvider {
  key: string;
  createInvoice(input: {
    invoiceId: string;
    number: string;
    title: string;
    amount: number;
  }): Promise<{ providerRef: string; method?: string; raw?: unknown }>;
  /** Verify + normalize a webhook payload → providerRef + resulting status. */
  verifyWebhook(input: {
    headers: Record<string, string | undefined>;
    rawBody: string;
  }): { providerRef: string; status: PaymentStatus };
}

/**
 * Dev provider: webhook is an HMAC-signed POST with JSON
 * { providerRef, status }. Signature = sha256(rawBody + secret).
 * Secret comes from MOCK_PAYMENT_SECRET env (default dev value).
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly key = 'mock';
  private readonly secret =
    process.env.MOCK_PAYMENT_SECRET ?? 'mock_dev_secret';

  async createInvoice(input: {
    invoiceId: string;
    number: string;
    title: string;
    amount: number;
  }) {
    return {
      providerRef: `mock-${input.invoiceId}`,
      method: 'mock_transfer',
      raw: { simulated: true },
    };
  }

  verifyWebhook(input: { headers: Record<string, string | undefined>; rawBody: string }) {
    const sig = input.headers['x-signature'];
    const expected = createHash('sha256')
      .update(input.rawBody + this.secret)
      .digest('hex');
    const ok =
      sig !== undefined &&
      sig.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) throw new UnauthorizedException('Invalid webhook signature');
    const body = JSON.parse(input.rawBody) as {
      providerRef?: string;
      status?: string;
    };
    if (!body.providerRef || !body.status) {
      throw new BadRequestException('Malformed webhook payload');
    }
    return { providerRef: body.providerRef, status: body.status as PaymentStatus };
  }
}

const FINAL_PAYMENT: readonly PaymentStatus[] = [
  'SETTLED',
  'FAILED',
  'EXPIRED',
  'REFUNDED',
];

/** Status pendaftaran yang menunggu verifikasi pembayaran per jenis tagihan. */
const REVIEW_STATUS: Record<string, RegistrationStatus> = {
  registration_fee: 'PAYMENT_REVIEW',
  dsp_dp: 'FINAL_PAYMENT_REVIEW',
};
/** Setelah pembayaran dikonfirmasi → status berikutnya per jenis tagihan. */
const PAID_STATUS: Record<string, RegistrationStatus> = {
  registration_fee: 'FORM_FILLING',
  dsp_dp: 'SELECTION',
  settlement: 'RE_REGISTRATION',
};
/** Jika bukti ditolak → kembali menunggu pembayaran per jenis tagihan. */
const AWAITING_STATUS: Record<string, RegistrationStatus> = {
  registration_fee: 'AWAITING_PAYMENT',
  dsp_dp: 'AWAITING_FINAL_PAYMENT',
};

@Injectable()
export class PaymentsService {
  readonly provider: PaymentProvider = new MockPaymentProvider();
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly receipts: ReceiptsService,
    private readonly finance: FinanceService,
  ) {}

  /** Create an invoice for a registration (staff action). */
  async createInvoice(
    registrationId: string,
    title: string,
    amount: number,
    actorId: string,
    options: {
      kind?: string | undefined;
      applyDiscount?: boolean | undefined;
      dueAt?: Date | undefined;
      note?: string | undefined;
    } = {},
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    // Diskon jalur prestasi — dipotong dari nominal tagihan.
    let finalAmount = amount;
    let discountPercent = 0;
    if (options.applyDiscount && reg.discountPercent > 0) {
      discountPercent = reg.discountPercent;
      finalAmount = Math.round(amount * (1 - discountPercent / 100));
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        number: `INV-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`,
        registrationId,
        title,
        kind: options.kind ?? 'other',
        amount: finalAmount,
        ...(discountPercent > 0
          ? { baseAmount: amount, discountPercent }
          : {}),
        dueAt: options.dueAt ?? null,
        note: options.note ?? null,
      },
    });

    // Tagihan DP DSP → pendaftaran menunggu pembayaran lanjutan.
    if (invoice.kind === 'dsp_dp' && reg.status === 'VERIFIED') {
      await this.prisma.registration.update({
        where: { id: reg.id },
        data: { status: 'AWAITING_FINAL_PAYMENT' },
      });
      await this.notifications.notify(reg.parentId, {
        title: 'Tagihan pembayaran',
        body: `${invoice.title} sebesar Rp ${finalAmount.toLocaleString('id-ID')} telah diterbitkan. Sisa pembayaran dilunasi saat daftar ulang di sekolah.`,
        data: { registrationId: reg.id, invoiceId: invoice.id },
      });
    }

    await this.audit.log({
      actorId,
      action: 'invoice.create',
      entity: 'invoice',
      entityId: invoice.id,
      metadata: { number: invoice.number, amount: finalAmount, kind: invoice.kind },
    });
    return invoice;
  }

  /**
   * Terbitkan otomatis tagihan DP DSP setelah berkas terverifikasi.
   * Nominal diambil dari pengaturan biaya `dsp_dp` (default: setengah
   * dari biaya DSP) lalu dipotong diskon jalur prestasi — tidak
   * membuat duplikat jika sudah ada tagihan DP yang belum lunas.
   */
  /** Tarif efektif: override gelombang bila ada, jika tidak fee global. */
  private async feeAmountFor(
    waveId: string | null,
    key: string,
  ): Promise<number | null> {
    if (waveId) {
      const override = await this.prisma.waveFee.findUnique({
        where: { waveId_key: { waveId, key } },
      });
      if (override) return override.amount;
    }
    const fee = await this.prisma.spmbFee.findUnique({ where: { key } });
    return fee?.amount ?? null;
  }

  async issueDpInvoiceIfNeeded(registrationId: string, actorId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg || reg.status !== 'VERIFIED') return null;
    const existing = await this.prisma.invoice.findFirst({
      where: { registrationId, kind: 'dsp_dp', status: 'OPEN' },
    });
    if (existing) return existing;

    // Tarif spesifik gelombang menang atas fee global.
    const dpFee = await this.feeAmountFor(reg.waveId, 'dsp_dp');
    const dspFee = await this.feeAmountFor(reg.waveId, 'dsp');
    const base = (dpFee ?? Math.round((dspFee ?? 0) / 2)) || 1;
    return this.createInvoice(
      registrationId,
      `Uang Muka DSP (DP) — ${reg.number}`,
      base,
      actorId,
      { kind: 'dsp_dp', applyDiscount: true },
    );
  }

  /**
   * Terbitkan otomatis tagihan pelunasan (sisa DSP setelah diskon & DP
   * + seragam) saat pendaftar dinyatakan diterima. Dibayar tunai di
   * sekolah saat daftar ulang — tidak diunggah online oleh ortu.
   */
  async issueSettlementInvoiceIfNeeded(registrationId: string, actorId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { invoices: true },
    });
    if (!reg || reg.status !== 'ACCEPTED') return null;
    const existing = reg.invoices.find(
      (i) => i.kind === 'settlement' && i.status !== 'CANCELLED',
    );
    if (existing) return existing;

    const dsp = (await this.feeAmountFor(reg.waveId, 'dsp')) ?? 0;
    const seragam = (await this.feeAmountFor(reg.waveId, 'seragam')) ?? 0;
    const dpPaid = reg.invoices
      .filter((i) => i.kind === 'dsp_dp' && i.status === 'PAID')
      .reduce((s, i) => s + i.amount, 0);
    const dspDue = Math.max(
      0,
      Math.round(dsp * (1 - reg.discountPercent / 100)) - dpPaid,
    );
    const total = dspDue + seragam;
    if (total <= 0) return null;

    const invoice = await this.createInvoice(
      registrationId,
      `Pelunasan Daftar Ulang — ${reg.number} (sisa DSP + seragam, dibayar di sekolah)`,
      total,
      actorId,
      { kind: 'settlement' },
    );
    await this.notifications.notify(reg.parentId, {
      title: 'Selamat — daftar ulang',
      body: `Tagihan pelunasan ${invoice.number} sebesar Rp ${total.toLocaleString('id-ID')} diterbitkan. Bayar di sekolah saat daftar ulang.`,
      data: { registrationId: reg.id, invoiceId: invoice.id },
    });
    return invoice;
  }

  /**
   * Admin mencatat pembayaran tunai di sekolah — langsung menandai
   * pembayaran SETTLED + invoice PAID + status pendaftaran maju.
   */
  async recordCash(
    invoiceId: string,
    note: string | undefined,
    staffId: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { registration: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'OPEN') {
      throw new ConflictException('Tagihan sudah diproses');
    }
    const now = new Date();
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        provider: 'manual',
        method: 'cash',
        amount: invoice.amount,
        status: 'SETTLED',
        paidAt: now,
        verifiedBy: staffId,
        verifiedAt: now,
        verifyNote: note ?? 'Dibayar tunai di sekolah',
      },
      include: { invoice: true },
    });
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: now },
    });
    await this.onSettled(payment);
    await this.audit.log({
      actorId: staffId,
      action: 'payment.cash_recorded',
      entity: 'payment',
      entityId: payment.id,
      metadata: note ? { note } : undefined,
    });
    return payment;
  }

  /**
   * Buat rencana angsuran — menghasilkan N tagihan dengan jatuh tempo
   * bulanan berurutan. Dipakai untuk DSP/seragam yang dicicil.
   */
  async createInstallmentPlan(
    registrationId: string,
    dto: {
      title: string;
      totalAmount: number;
      count: number;
      applyDiscount?: boolean | undefined;
    },
    actorId: string,
  ) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (dto.totalAmount <= 0 || dto.count < 2) {
      throw new BadRequestException('Total/nominal angsuran tidak valid');
    }

    let total = dto.totalAmount;
    if (dto.applyDiscount && reg.discountPercent > 0) {
      total = Math.round(total * (1 - reg.discountPercent / 100));
    }
    const per = Math.round(total / dto.count);
    const remainder = total - per * dto.count;

    const plan = await this.prisma.installmentPlan.create({
      data: {
        registrationId,
        title: dto.title,
        totalAmount: total,
        count: dto.count,
        createdBy: actorId,
      },
    });
    const now = new Date();
    for (let i = 1; i <= dto.count; i++) {
      const due = new Date(now);
      due.setMonth(due.getMonth() + (i - 1));
      await this.prisma.invoice.create({
        data: {
          number: `INV-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`,
          registrationId,
          planId: plan.id,
          kind: 'installment',
          title: `${dto.title} — Angsuran ${i}/${dto.count}`,
          amount: i === dto.count ? per + remainder : per,
          installmentNo: i,
          dueAt: due,
        },
      });
    }
    await this.audit.log({
      actorId,
      action: 'installment-plan.create',
      entity: 'installment_plan',
      entityId: plan.id,
      metadata: { total, count: dto.count },
    });
    return this.prisma.installmentPlan.findUnique({
      where: { id: plan.id },
      include: { invoices: true },
    });
  }

  /** Parent-facing: invoices for a registration they own. */
  async listForParent(registrationId: string, parentId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { parentId: true },
    });
    if (!reg || reg.parentId !== parentId) {
      throw new NotFoundException('Registration not found');
    }
    return this.prisma.invoice.findMany({
      where: { registrationId },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Ortu membayar: transfer (wajib unggah bukti) atau tunai di sekolah.
   * Menghasilkan Payment PENDING → diverifikasi admin.
   */
  async pay(
    invoiceId: string,
    parentId: string,
    dto: { method: 'transfer' | 'cash'; proofDocumentId?: string | undefined },
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { registration: { select: { parentId: true } } },
    });
    if (!invoice || invoice.registration.parentId !== parentId) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status !== 'OPEN') {
      throw new ConflictException('Tagihan tidak dapat dibayar');
    }
    const existing = await this.prisma.payment.findFirst({
      where: { invoiceId, status: 'PENDING' },
    });
    if (existing) return { invoice, payment: existing }; // idempotent

    if (dto.method === 'transfer') {
      if (!dto.proofDocumentId) {
        throw new BadRequestException('Bukti transfer wajib diunggah');
      }
      const doc = await this.prisma.document.findUnique({
        where: { id: dto.proofDocumentId },
      });
      if (
        !doc ||
        doc.ownerId !== parentId ||
        doc.type !== 'bukti_bayar' ||
        doc.registrationId !== invoice.registrationId
      ) {
        throw new BadRequestException('Bukti pembayaran tidak valid');
      }
    }

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        provider: 'manual',
        method: dto.method,
        amount: invoice.amount,
        proofDocumentId: dto.proofDocumentId ?? null,
      },
    });

    // Status pendaftaran ikut maju → menunggu verifikasi admin.
    const review = REVIEW_STATUS[invoice.kind];
    if (review) {
      await this.prisma.registration.updateMany({
        where: { id: invoice.registrationId },
        data: { status: review },
      });
    }
    await this.audit.log({
      actorId: parentId,
      action: 'payment.submit',
      entity: 'payment',
      entityId: payment.id,
      metadata: { method: dto.method, invoiceId },
    });
    return { invoice, payment };
  }

  /** Admin: konfirmasi atau tolak pembayaran manual (transfer/tunai). */
  async verifyPayment(
    paymentId: string,
    action: 'confirm' | 'reject',
    note: string | undefined,
    staffId: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: {
            registration: { include: { candidate: true, parent: true } },
          },
        },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'PENDING') {
      throw new ConflictException('Pembayaran sudah diproses');
    }

    if (action === 'confirm') {
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SETTLED',
            paidAt: new Date(),
            verifiedBy: staffId,
            verifiedAt: new Date(),
            verifyNote: note ?? null,
          },
        }),
        this.prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: { status: 'PAID', paidAt: new Date() },
        }),
      ]);
      await this.onSettled(payment);
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          verifiedBy: staffId,
          verifiedAt: new Date(),
          verifyNote: note ?? 'Bukti pembayaran ditolak',
        },
      });
      const awaiting = AWAITING_STATUS[payment.invoice.kind];
      if (awaiting) {
        await this.prisma.registration.updateMany({
          where: { id: payment.invoice.registrationId },
          data: { status: awaiting },
        });
      }
      await this.notifications.notify(payment.invoice.registration.parentId, {
        title: 'Pembayaran ditolak',
        body: `Pembayaran ${payment.invoice.number} ditolak: ${note ?? 'bukti tidak valid'}. Silakan unggah ulang bukti yang benar.`,
        data: { invoiceId: payment.invoiceId },
      });
    }
    await this.audit.log({
      actorId: staffId,
      action: `payment.${action === 'confirm' ? 'confirmed' : 'rejected'}`,
      entity: 'payment',
      entityId: payment.id,
      metadata: note ? { note } : undefined,
    });
    return this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { receipts: true },
    });
  }

  /**
   * Setelah pembayaran lunas: kwitansi ke HP ortu + notifikasi +
   * status pendaftaran maju otomatis (formulir / psikotes).
   */
  private async onSettled(payment: Payment & { invoice: Invoice }) {
    const reg = await this.prisma.registration.findUniqueOrThrow({
      where: { id: payment.invoice.registrationId },
      include: { candidate: true, parent: true },
    });
    await this.receipts.issue({
      payment,
      invoiceNumber: payment.invoice.number,
      invoiceTitle: payment.invoice.title,
      registrationNumber: reg.number,
      candidateName: reg.candidate.name,
      parentId: reg.parentId,
      parentPhone: reg.parent.phone,
    });
    await this.notifications.notify(reg.parentId, {
      title: 'Pembayaran diterima',
      body: `Pembayaran ${payment.invoice.number} telah dikonfirmasi.`,
      data: { invoiceId: payment.invoiceId },
    });
    const next = PAID_STATUS[payment.invoice.kind];
    if (next) {
      await this.prisma.registration.updateMany({
        where: { id: reg.id },
        data: { status: next },
      });
      if (next === 'FORM_FILLING') {
        await this.notifications.notify(reg.parentId, {
          title: 'Silakan lengkapi formulir',
          body: 'Pembayaran pendaftaran diterima. Silakan isi formulir dan unggah dokumen.',
          data: { registrationId: reg.id },
        });
      }
    }
    // Catat pemasukan ke modul keuangan — kegagalan tidak boleh
    // menggagalkan pembayaran yang sudah lunas.
    try {
      await this.finance.recordSpmbPayment(payment.id);
    } catch (err) {
      this.logger.error(
        `Gagal mencatat keuangan untuk payment ${payment.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Start payment via provider — creates PENDING payment + provider ref. */
  async checkout(invoiceId: string, parentId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { registration: { select: { parentId: true } } },
    });
    if (!invoice || invoice.registration.parentId !== parentId) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.status !== 'OPEN') {
      throw new ConflictException('Invoice is not payable');
    }
    const existing = await this.prisma.payment.findFirst({
      where: { invoiceId, status: 'PENDING' },
    });
    if (existing) return { invoice, payment: existing }; // idempotent
    const ref = await this.provider.createInvoice({
      invoiceId: invoice.id,
      number: invoice.number,
      title: invoice.title,
      amount: invoice.amount,
    });
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId,
        provider: this.provider.key,
        providerRef: ref.providerRef,
        method: ref.method ?? null,
        amount: invoice.amount,
        ...(ref.raw !== undefined
          ? { rawPayload: ref.raw as object }
          : {}),
      },
    });
    return { invoice, payment };
  }

  /** Provider webhook — signature-verified, idempotent via providerRef. */
  async handleWebhook(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ) {
    const { providerRef, status } = this.provider.verifyWebhook({
      headers,
      rawBody,
    });
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef },
      include: { invoice: { include: { registration: true } } },
    });
    if (!payment) {
      this.logger.warn(`Webhook for unknown providerRef ${providerRef}`);
      return { handled: false }; // still 200 — safe retry semantics
    }
    if (FINAL_PAYMENT.includes(payment.status)) {
      return { handled: true, idempotent: true }; // already final — no-op
    }
    const settled = status === 'SETTLED';
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          paidAt: settled ? new Date() : null,
          ...(rawBody
            ? { rawPayload: JSON.parse(rawBody) as object }
            : {}),
        },
      }),
      this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: settled ? 'PAID' : payment.invoice.status,
          paidAt: settled ? new Date() : payment.invoice.paidAt,
        },
      }),
    ]);
    await this.audit.log({
      action: `payment.${status.toLowerCase()}`,
      entity: 'payment',
      entityId: payment.id,
      metadata: { providerRef },
    });
    if (settled) {
      await this.onSettled(payment);
    }
    return { handled: true };
  }
}
