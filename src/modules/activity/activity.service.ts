import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
};

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalFeed(limit = 20) {
    return this.prisma.activity.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async getMyFeed(userId: string, limit = 20) {
    return this.prisma.activity.findMany({
      where: { userId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  private async getFriendIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.friend.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });

    return rows
      .map((f) => (f.senderId === userId ? f.receiverId : f.senderId))
      .filter(Boolean);
  }

  /**
   * Friends studied today (based on streak.lastStudyDate >= today 00:00)
   * includes minutesToday (sum activity minutes today)
   */
  async getFriendsToday(userId: string) {
    const friendIds = await this.getFriendIds(userId);
    if (friendIds.length === 0) return [];

    const todayStart = startOfLocalDay(new Date());
    const tomorrowStart = addDays(todayStart, 1);

    // sum minutes today from activity (more accurate than total minutes)
    const sums = await this.prisma.activity.groupBy({
      by: ['userId'],
      where: {
        userId: { in: friendIds },
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
      _sum: { minutes: true },
    });

    const minutesTodayMap = new Map<string, number>();
    for (const s of sums) {
      minutesTodayMap.set(s.userId, s._sum.minutes ?? 0);
    }

    // streak rows (some friends may not have streak yet)
    const streakRows = await this.prisma.streak.findMany({
      where: { userId: { in: friendIds } },
      include: { user: { select: SAFE_USER_SELECT } },
    });

    const todayList = streakRows
      .filter((s) => s.lastStudyDate && s.lastStudyDate >= todayStart)
      .map((s) => ({
        user: s.user,
        minutesToday: minutesTodayMap.get(s.userId) ?? 0,
        currentStreak: s.currentStreak,
        lastStudyDate: s.lastStudyDate,
        totalMinutes: s.minutes,
      }))
      .sort((a, b) => {
        if (b.minutesToday !== a.minutesToday) return b.minutesToday - a.minutesToday;
        if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
        return (b.lastStudyDate?.getTime() ?? 0) - (a.lastStudyDate?.getTime() ?? 0);
      });

    return todayList;
  }

  /**
   * Friends missed today (no study today)
   * - includes friends with no streak row at all
   */
  async getFriendsMissed(userId: string) {
    const friendIds = await this.getFriendIds(userId);
    if (friendIds.length === 0) return [];

    const todayStart = startOfLocalDay(new Date());
    const tomorrowStart = addDays(todayStart, 1);

    const sums = await this.prisma.activity.groupBy({
      by: ['userId'],
      where: {
        userId: { in: friendIds },
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
      _sum: { minutes: true },
    });

    const minutesTodayMap = new Map<string, number>();
    for (const s of sums) {
      minutesTodayMap.set(s.userId, s._sum.minutes ?? 0);
    }

    const streakRows = await this.prisma.streak.findMany({
      where: { userId: { in: friendIds } },
      include: { user: { select: SAFE_USER_SELECT } },
    });

    const streakById = new Map<string, typeof streakRows[number]>();
    for (const s of streakRows) streakById.set(s.userId, s);

    const missedIds = friendIds.filter((id) => {
      const s = streakById.get(id);
      return !s?.lastStudyDate || s.lastStudyDate < todayStart;
    });

    if (missedIds.length === 0) return [];

    // users safe for those missing (some may not have streak row)
    const users = await this.prisma.user.findMany({
      where: { id: { in: missedIds } },
      select: SAFE_USER_SELECT,
    });

    const missedList = users
      .map((u) => {
        const s = streakById.get(u.id);
        return {
          user: u,
          minutesToday: minutesTodayMap.get(u.id) ?? 0, // usually 0
          currentStreak: s?.currentStreak ?? 0,
          lastStudyDate: s?.lastStudyDate ?? null,
          totalMinutes: s?.minutes ?? 0,
        };
      })
      .sort((a, b) => {
        // ai streak cao mà chưa học => lên đầu để “nhắc”
        if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
        // ai lâu không học => lên đầu
        return (a.lastStudyDate?.getTime() ?? 0) - (b.lastStudyDate?.getTime() ?? 0);
      });

    return missedList;
  }
}
