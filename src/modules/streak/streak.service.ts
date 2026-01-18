import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDaysLocal(a: Date, b: Date) {
  const aa = startOfLocalDay(a).getTime();
  const bb = startOfLocalDay(b).getTime();
  return Math.floor((aa - bb) / (24 * 60 * 60 * 1000));
}

@Injectable()
export class StreakService {
  constructor(private prisma: PrismaService) {}

  // MAIN STUDY FUNCTION
  async study(userId: string, minutes: number) {
    if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes < 0) {
      throw new BadRequestException('Invalid minutes');
    }
    minutes = Math.floor(minutes); // Prisma minutes là Int

    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    let streak = await this.prisma.streak.findUnique({ where: { userId } });

    // user chưa có streak -> tạo mới
    if (!streak) {
      streak = await this.prisma.streak.create({
        data: {
          userId,
          currentStreak: 1,
          minutes,
          lastStudyDate: now,
          recoveryUsed: 0,
          recoveryMonth: currentMonth,
        },
      });

      await this.createActivity(userId, minutes, streak.currentStreak);
      return streak;
    }

    // reset quota recovery nếu sang tháng mới
    const monthChanged = streak.recoveryMonth !== currentMonth;
    let recoveryUsed = monthChanged ? 0 : streak.recoveryUsed;

    const daysDiff = diffDaysLocal(now, streak.lastStudyDate);

    let nextStreak = streak.currentStreak;

    if (daysDiff === 0) {
      // cùng ngày: không tăng streak
    } else if (daysDiff === 1) {
      // hôm qua -> hôm nay: +1
      nextStreak += 1;
    } else if (daysDiff === 2 && recoveryUsed < 1) {
      // đứt 1 ngày: dùng recovery (1 lần/tháng)
      recoveryUsed += 1;
      nextStreak += 1;
    } else {
      // đứt dài: reset
      nextStreak = 1;
    }

    streak = await this.prisma.streak.update({
      where: { userId },
      data: {
        currentStreak: nextStreak,
        minutes: streak.minutes + minutes,
        lastStudyDate: now,
        recoveryUsed,
        recoveryMonth: currentMonth,
      },
    });

    await this.createActivity(userId, minutes, streak.currentStreak);
    return streak;
  }

  // Save activity
  private createActivity(userId: string, minutes: number, streak: number) {
    return this.prisma.activity.create({
      data: {
        userId,
        minutes: minutes > 0 ? minutes : null, // < 1 phút vẫn log streak/activity, nhưng minutes null
        streak,
      },
    });
  }

  async getMyStreak(userId: string) {
    return this.prisma.streak.findUnique({ where: { userId } });
  }

  async getRecoveryStatus(userId: string) {
    const streak = await this.prisma.streak.findUnique({ where: { userId } });
    if (!streak) return { recoveryUsed: 0, remaining: 1 };

    const month = new Date().getMonth() + 1;
    const used = streak.recoveryMonth === month ? streak.recoveryUsed : 0;

    return { recoveryUsed: used, remaining: 1 - used };
  }

  async compareWithFriends(userId: string) {
    const friends = await this.prisma.friend.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });

    const friendIds = friends.map((f) =>
      f.senderId === userId ? f.receiverId : f.senderId,
    );

    const ids = [userId, ...friendIds];

    return this.prisma.streak.findMany({
      where: { userId: { in: ids } },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: [{ currentStreak: 'desc' }, { minutes: 'desc' }],
    });
  }
}
