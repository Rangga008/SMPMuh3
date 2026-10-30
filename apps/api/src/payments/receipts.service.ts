import { Injectable, Logger } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../core/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Kwitansi pembayaran — dibuat saat pembayaran dikonfirmasi dan "dikirim"
 * ke nomor HP orang tua. Saat ini kanal WhatsApp masih stub (status SENT
 * setelah tercatat + notifikasi in-app); integrasi gateway WA/SMS tinggal
 * mengganti `deliver()` tanpa mengubah alur.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async issue(input: {
    payment: Payment;
    invoiceNumber: string;
    invoiceTitle: string;
    registrationNumber: string;
    candidateName: string;
    parentId: string;
    parentPhone?: string | null;
  }) {
    const { payment } = input;
    const existing = await this.prisma.receipt.findFirst({
      where: { paymentId: payment.id },
    });
    if (existing) return existing; // idempotent

    const number = await this.generateNumber();
    const body = [
      'KWITANSI PEMBAYARAN',
      `No: ${number}`,
      `Pendaftaran: ${input.registrationNumber} — ${input.candidateName}`,
      `Tagihan: ${input.invoiceTitle} (${input.invoiceNumber})`,
      `Jumlah: Rp ${payment.amount.toLocaleString('id-ID')}`,
      `Metode: ${payment.method ?? 'transfer'}`,
      'Status: LUNAS',
    ].join('\n');

    const receipt = await this.prisma.receipt.create({
      data: {
        number,
        paymentId: payment.id,
        channel: 'whatsapp',
        recipient: input.parentPhone ?? '-',
        body,
      },
    });

    await this.deliver(receipt.id, input.parentId, input.parentPhone ?? null);
    return this.prisma.receipt.findUnique({ where: { id: receipt.id } });
  }

  /** Stub pengiriman — ganti dengan gateway WhatsApp/SMS saat produksi. */
  private async deliver(
    receiptId: string,
    parentId: string,
    phone: string | null,
  ) {
    const receipt = await this.prisma.receipt.update({
      where: { id: receiptId },
      data: { status: phone ? 'SENT' : 'FAILED', sentAt: new Date() },
    });
    if (phone) {
      this.logger.log(`Receipt ${receipt.number} queued to ${phone} (stub)`);
    } else {
      this.logger.warn(
        `Receipt ${receipt.number} has no recipient phone — FAILED`,
      );
    }
    await this.notifications.notify(parentId, {
      title: `Kwitansi ${receipt.number}`,
      body: receipt.body,
      data: { receiptId: receipt.id, paymentId: receipt.paymentId },
    });
    return receipt;
  }

  private async generateNumber(): Promise<string> {
    const prefix = `KWT-${new Date().getFullYear()}-`;
    for (let i = 0; i < 10; i++) {
      const number = `${prefix}${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
      const clash = await this.prisma.receipt.findUnique({
        where: { number },
        select: { id: true },
      });
      if (!clash) return number;
    }
    throw new Error('Could not allocate receipt number');
  }
}
