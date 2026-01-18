import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { cache } from '../../common/inMemoryCache';

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

function localDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async buildLeaderboard(start: Date, end: Date, meId?: string, limit = 20) {
    // groupBy: minutes có thể null => sum ra null
    const rows = await this.prisma.activity.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: start, lt: end }, // lt end để tránh dính “ngày mai” khi end = start ngày mới
      },
      _sum: { minutes: true },
      _max: { streak: true },
    });

    if (!rows.length) return [];

    const userIds = rows.map((r) => r.userId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: SAFE_USER_SELECT,
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    // build list
    const list = rows
      .map((r) => {
        const u = userMap.get(r.userId);
        return {
          userId: r.userId,
          name: u?.name ?? 'Unknown',
          email: u?.email ?? '',
          totalMinutes: Number(r._sum.minutes ?? 0),
          maxStreak: Number(r._max.streak ?? 0),
        };
      })
      .sort((a, b) => {
        // sort ổn định: minutes desc -> streak desc -> name asc
        if (b.totalMinutes !== a.totalMinutes) return b.totalMinutes - a.totalMinutes;
        if (b.maxStreak !== a.maxStreak) return b.maxStreak - a.maxStreak;
        return (a.name || '').localeCompare(b.name || '');
      })
      .map((r, i) => ({
        ...r,
        rank: i + 1,
        isMe: meId ? r.userId === meId : false,
      }));

    // cắt limit
    return list.slice(0, Math.max(1, Math.min(limit, 200)));
  }

  // ✅ 7 ngày gần nhất (tính theo ngày local): từ 00:00 của (hôm nay - 6) -> hiện tại
  async week(meId?: string, limit = 20) {
    const now = new Date();
    const start = startOfLocalDay(addDays(now, -6));
    const end = now;
    // Public endpoint is hit frequently; cache briefly to avoid repeated groupBy.
    if (!meId) {
      const key = `leaderboard:week:${localDayKey(now)}:${limit}`;
      return cache.getOrSet(key, 30_000, async () => {
        return this.buildLeaderboard(start, end, undefined, limit);
      });
    }
    return this.buildLeaderboard(start, end, meId, limit);
  }

  // ✅ tháng hiện tại: từ ngày 1 00:00 -> hiện tại
  async month(meId?: string, limit = 20) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;
    if (!meId) {
      const key = `leaderboard:month:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}:${limit}`;
      return cache.getOrSet(key, 30_000, async () => {
        return this.buildLeaderboard(start, end, undefined, limit);
      });
    }
    return this.buildLeaderboard(start, end, meId, limit);
  }
}
