import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';
import { PaymentsService } from '../payments/payments.service';
import { RegistrationsService } from './registrations.service';
import type { RegistrationDocType } from './dto/spmb.dto';

const ALLOWED_MIME = new Map([
  ['image/jpeg', ['.jpg', '.jpeg']],
  ['image/png', ['.png']],
  ['application/pdf', ['.pdf']],
]);
const MAX_BYTES = 5 * 1024 * 1024;

const selectDoc = {
  id: true,
  type: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly registrations: RegistrationsService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    userId: string,
    registrationId: string,
    type: RegistrationDocType,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    const reg = await this.registrations.ownedOrStaff(
      registrationId,
      userId,
      false,
    );
    // Bukti bayar boleh diunggah saat menunggu/mengecek pembayaran;
    // dokumen lain hanya saat status masih dapat diedit.
    if (type === 'bukti_bayar') {
      const allowed: string[] = [
        'AWAITING_PAYMENT',
        'PAYMENT_REVIEW',
        'AWAITING_FINAL_PAYMENT',
        'FINAL_PAYMENT_REVIEW',
        'DRAFT',
        'FORM_FILLING',
        'NEEDS_REVISION',
      ];
      if (!allowed.includes(reg.status)) {
        throw new BadRequestException(
          `Tidak dapat mengunggah bukti pada status ${reg.status}`,
        );
      }
    } else {
      this.registrations.assertEditable(reg.status);
    }

    const allowed = ALLOWED_MIME.get(file.mimetype);
    if (!allowed) {
      throw new BadRequestException('Only JPG, PNG or PDF files are allowed');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }
    const ext = extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      throw new BadRequestException('File extension does not match its type');
    }

    const docId = randomUUID();
    const safeName = file.originalname
      .replace(/[^\w.\- ]/g, '_')
      .slice(-80);
    const storageKey = `registrations/${reg.id}/${docId}-${safeName}`;

    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    const doc = await this.prisma.document.create({
      data: {
        id: docId,
        ownerId: userId,
        uploadedBy: userId,
        registrationId: reg.id,
        type,
        storageKey,
        fileName: safeName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: selectDoc,
    });
    await this.audit.log({
      actorId: userId,
      action: 'document.upload',
      entity: 'document',
      entityId: doc.id,
      metadata: { registrationId: reg.id, type },
    });
    return doc;
  }

  async listForRegistration(userId: string, registrationId: string) {
    await this.registrations.ownedOrStaff(registrationId, userId, false);
    return this.prisma.document.findMany({
      where: { registrationId },
      select: selectDoc,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Staff: mark a document verified or rejected. */
  async verify(id: string, action: 'verified' | 'rejected', note: string | undefined, staffId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        verifiedBy: action === 'verified' ? staffId : null,
        verifiedAt: action === 'verified' ? new Date() : null,
        verificationNote: note ?? (action === 'rejected' ? 'rejected' : null),
      },
      select: selectDoc,
    });
    await this.audit.log({
      actorId: staffId,
      action: `document.${action}`,
      entity: 'document',
      entityId: id,
      metadata: note ? { note } : undefined,
    });
    // Bukti bayar: satu klik verifikasi sekaligus memproses pembayaran
    // yang tertaut — konfirmasi melunasi tagihan & memajukan status,
    // penolakan mengembalikan pendaftaran ke status menunggu bayar.
    if (doc.type === 'bukti_bayar') {
      const pending = await this.prisma.payment.findFirst({
        where: { proofDocumentId: doc.id, status: 'PENDING' },
      });
      if (pending) {
        await this.payments.verifyPayment(
          pending.id,
          action === 'verified' ? 'confirm' : 'reject',
          note,
          staffId,
        );
      }
    }
    return updated;
  }

  /** Staff: upload/replace the shared "surat pernyataan" template. */
  async uploadTemplate(
    userId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    const allowed = ALLOWED_MIME.get(file.mimetype);
    if (!allowed) {
      throw new BadRequestException('Only JPG, PNG or PDF files are allowed');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('File exceeds the 5 MB limit');
    }
    const docId = randomUUID();
    const safeName = file.originalname.replace(/[^\w.\- ]/g, '_').slice(-80);
    const storageKey = `templates/surat-pernyataan/${docId}-${safeName}`;
    await this.storage.putObject(storageKey, file.buffer, file.mimetype);
    // Hanya satu template aktif — ganti yang lama.
    const old = await this.prisma.document.findMany({
      where: { type: 'surat_pernyataan_template' },
      select: { id: true, storageKey: true },
    });
    const doc = await this.prisma.document.create({
      data: {
        id: docId,
        ownerId: userId,
        uploadedBy: userId,
        type: 'surat_pernyataan_template',
        storageKey,
        fileName: safeName,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: selectDoc,
    });
    for (const o of old) {
      await this.prisma.document.delete({ where: { id: o.id } }).catch(() => undefined);
      await this.storage.deleteObject(o.storageKey).catch(() => undefined);
    }
    await this.audit.log({
      actorId: userId,
      action: 'spmb.template.upload',
      entity: 'document',
      entityId: doc.id,
    });
    return doc;
  }

  /** Public: stream the shared surat pernyataan template (404 jika belum ada). */
  async openTemplate() {
    const doc = await this.prisma.document.findFirst({
      where: { type: 'surat_pernyataan_template' },
      orderBy: { createdAt: 'desc' },
    });
    if (!doc) throw new NotFoundException('Template belum tersedia');
    const buffer = await this.storage.getObjectBuffer(doc.storageKey);
    return { doc, buffer };
  }

  /** Read a document — only its owner (parent) or staff may download. */
  async open(userId: string, id: string, isStaff: boolean) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!isStaff && doc.ownerId !== userId) {
      throw new ForbiddenException('Not your document');
    }
    const buffer = await this.storage.getObjectBuffer(doc.storageKey);
    return { doc, buffer };
  }
}
