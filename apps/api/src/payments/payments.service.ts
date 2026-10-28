import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { PaymentStatus } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomInt } from 'node:crypto';

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

@Injectable()
export class PaymentsService {
  readonly provider: PaymentProvider = new MockPaymentProvider();
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Create an invoice for a registration (staff action). */
  async createInvoice(
    registrationId: string,
    title: string,
    amount: number,
    actorId: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const dup = await this.prisma.invoice.findFirst({
      where: { registrationId, status: { in: ['OPEN', 'PAID'] } },
    });
    if (dup) {
      throw new ConflictException('An open/paid invoice already exists');
    }
    const invoice = await this.prisma.invoice.create({
      data: {
        number: `INV-${new Date().getFullYear()}-${String(randomInt(0, 1_000_000)).padStart(6, '0')}`,
        registrationId,
        title,
        amount,
      },
    });
    await this.audit.log({
      actorId,
      action: 'invoice.create',
      entity: 'invoice',
      entityId: invoice.id,
      metadata: { number: invoice.number, amount },
    });
    return invoice;
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
      orderBy: { createdAt: 'desc' },
    });
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
      await this.notifications.notify(payment.invoice.registration.parentId, {
        title: 'Pembayaran diterima',
        body: `Pembayaran invoice ${payment.invoice.number} telah dikonfirmasi.`,
        data: { invoiceId: payment.invoiceId },
      });
    }
    return { handled: true };
  }
}
