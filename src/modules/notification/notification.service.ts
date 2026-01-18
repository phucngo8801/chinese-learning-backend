import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type Filter = 'all' | 'unread' | 'read';

@Injectable()
export class NotificationService {
  constructor(private prisma: PrismaService) {}

  // Dùng cho module khác gọi tạo thông báo
  async create(userId: string, payload: {
    type?: string;
    title?: string;
    message: string;
    link?: string;
    data?: any;
  }) {
    const message = (payload.message ?? '').trim();
    if (!message) throw new BadRequestException('Message empty');

    return this.prisma.notification.create({
      data: {
        userId,
        type: (payload.type ?? 'GENERAL') as any,
        title: payload.title ?? null,
        message,
        link: payload.link ?? null,
        data: payload.data ?? undefined,
      } as any,
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unreadCount: count };
  }

  async list(userId: string, params: { filter: Filter; page: number; limit: number }) {
    const { filter, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (filter === 'unread') where.readAt = null;
    if (filter === 'read') where.readAt = { not: null };

    const [total, unreadCount, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { page, limit, total, unreadCount, items };
  }

  async markRead(userId: string, id: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: updated.count };
  }

  async markAllRead(userId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: updated.count };
  }

  async remove(userId: string, id: string) {
    const deleted = await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    return { ok: true, deleted: deleted.count };
  }

  async clear(userId: string, mode: 'read' | 'all') {
    const where: any = { userId };
    if (mode === 'read') where.readAt = { not: null };

    const deleted = await this.prisma.notification.deleteMany({ where });
    return { ok: true, deleted: deleted.count };
  }
}
