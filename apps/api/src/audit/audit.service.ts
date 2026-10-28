import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | undefined;
  action: string;
  entity: string;
  entityId?: string | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes an audit entry. Audit failures are logged but never block the
   * request — auditing must not break business operations.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata ?? Prisma.JsonNull,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (e) {
      this.logger.error(
        `Audit write failed for ${entry.action}: ${(e as Error).message}`,
      );
    }
  }

  list(options: {
    entity?: string | undefined;
    take?: number | undefined;
    skip?: number | undefined;
  }) {
    const where: Prisma.AuditLogWhereInput = options.entity
      ? { entity: options.entity }
      : {};
    return this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(options.take ?? 50, 200),
      skip: options.skip ?? 0,
      include: {
        actor: { select: { id: true, email: true, name: true } },
      },
    });
  }
}
