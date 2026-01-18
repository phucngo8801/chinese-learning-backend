import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Badge, BadgeCode } from '@prisma/client';

@Injectable()
export class BadgeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 🎖️ Check điều kiện & cấp badge mới
   * Trả về danh sách badge vừa nhận (FE dùng popup)
   */
  async checkAndGrantBadges(userId: string): Promise<Badge[]> {
    const granted: Badge[] = [];

    const streak = await this.prisma.streak.findUnique({
      where: { userId },
    });

    if (!streak) return granted;

    // ===== STREAK BADGES =====
    if (streak.currentStreak >= 3) {
      const b = await this.grantBadge(userId, 'STREAK_3', 'Streak 3 ngày');
      if (b) granted.push(b);
    }

    if (streak.currentStreak >= 7) {
      const b = await this.grantBadge(userId, 'STREAK_7', 'Streak 7 ngày');
      if (b) granted.push(b);
    }

    if (streak.currentStreak >= 30) {
      const b = await this.grantBadge(userId, 'STREAK_30', 'Streak 30 ngày');
      if (b) granted.push(b);
    }

    // ===== MINUTES BADGE =====
    if (streak.minutes >= 60) {
      const b = await this.grantBadge(userId, 'MINUTES_60', 'Học 60 phút');
      if (b) granted.push(b);
    }

    return granted;
  }

  /**
   * 🎁 Cấp badge nếu user chưa có
   */
  private async grantBadge(
    userId: string,
    code: BadgeCode,
    name: string,
  ): Promise<Badge | null> {
    const exists = await this.prisma.badge.findUnique({
      where: {
        code_userId: { code, userId },
      },
    });

    if (exists) return null;

    return this.prisma.badge.create({
      data: {
        userId,
        code,
        name,
      },
    });
  }

  /**
   * 📦 Lấy toàn bộ badge của user
   */
  async getMyBadges(userId: string): Promise<Badge[]> {
    return this.prisma.badge.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
