import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  notify(
    userId: string,
    entry: { title: string; body: string; data?: Prisma.InputJsonValue },
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        title: entry.title,
        body: entry.body,
        data: entry.data ?? Prisma.JsonNull,
      },
    });
  }

  listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n) throw new NotFoundException('Notification not found');
    if (n.userId !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: n.readAt ?? new Date() },
    });
  }
}
