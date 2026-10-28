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
    this.registrations.assertEditable(reg.status);

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
    return updated;
  }

  /** Stream a document — only its owner (parent) or staff may download. */
  async open(userId: string, id: string, isStaff: boolean) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (!isStaff && doc.ownerId !== userId) {
      throw new ForbiddenException('Not your document');
    }
    const stream = await this.storage.getObjectStream(doc.storageKey);
    return { doc, stream };
  }
}
