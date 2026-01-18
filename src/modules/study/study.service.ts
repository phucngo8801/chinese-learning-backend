import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SAFE_USER_SELECT = { id: true, name: true, email: true };

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

@Injectable()
export class StudyService {
  constructor(private prisma: PrismaService) {}

  async logEvent(
    userId: string,
    body: {
      type: 'VOCAB' | 'SENTENCE';
      correct: boolean;
      durationSec?: number;
      itemId?: string;
    },
  ) {
    if (!userId) throw new BadRequestException('Missing userId');

    const durationSec = Math.max(0, Number(body.durationSec ?? 0));

    return this.prisma.studyEvent.create({
      data: {
        userId,
        type: body.type as any,
        correct: !!body.correct,
        durationSec,
        itemId: body.itemId ?? null,
      },
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

    return rows.map((f) => (f.senderId === userId ? f.receiverId : f.senderId));
  }

  /**
   * Summary friends today:
   * - minutesToday (ceil durationSec/60, có học dù 5s vẫn tính 1 phút)
   * - vocabCorrect/vocabWrong
   * - sentenceCorrect/sentenceWrong/sentenceTotal
   * - isStudyingNow: true nếu có event trong 10 phút gần nhất
   */
  async friendsToday(userId: string) {
    const friendIds = await this.getFriendIds(userId);
    if (friendIds.length === 0) return [];

    const now = new Date();
    const today = startOfLocalDay(now);
    const tomorrow = addDays(today, 1);

    const [friends, events] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: friendIds } },
        select: SAFE_USER_SELECT,
      }),
      this.prisma.studyEvent.findMany({
        where: {
          userId: { in: friendIds },
          createdAt: { gte: today, lt: tomorrow },
        },
        select: {
          userId: true,
          type: true,
          correct: true,
          durationSec: true,
          createdAt: true,
        },
      }),
    ]);

    const agg = new Map<
      string,
      {
        durationSec: number;
        vocabCorrect: number;
        vocabWrong: number;
        sentenceCorrect: number;
        sentenceWrong: number;
        sentenceTotal: number;
        lastEventAt: Date | null;
      }
    >();

    for (const fid of friendIds) {
      agg.set(fid, {
        durationSec: 0,
        vocabCorrect: 0,
        vocabWrong: 0,
        sentenceCorrect: 0,
        sentenceWrong: 0,
        sentenceTotal: 0,
        lastEventAt: null,
      });
    }

    for (const e of events) {
      const a = agg.get(e.userId);
      if (!a) continue;

      a.durationSec += e.durationSec ?? 0;

      const t = new Date(e.createdAt);
      if (!a.lastEventAt || t > a.lastEventAt) a.lastEventAt = t;

      if (e.type === 'VOCAB') {
        if (e.correct) a.vocabCorrect++;
        else a.vocabWrong++;
      } else if (e.type === 'SENTENCE') {
        a.sentenceTotal++;
        if (e.correct) a.sentenceCorrect++;
        else a.sentenceWrong++;
      }
    }

    const TEN_MIN = 10 * 60 * 1000;

    return friends
      .map((u) => {
        const a = agg.get(u.id)!;

        // ✅ FIX: có học (durationSec>0) => tối thiểu 1 phút
        const minutesToday =
          a.durationSec > 0 ? Math.max(1, Math.ceil(a.durationSec / 60)) : 0;

        const isStudyingNow =
          !!a.lastEventAt && now.getTime() - a.lastEventAt.getTime() <= TEN_MIN;

        return {
          user: u,
          minutesToday,
          isStudyingNow,
          lastEventAt: a.lastEventAt,

          vocabCorrect: a.vocabCorrect,
          vocabWrong: a.vocabWrong,

          sentenceTotal: a.sentenceTotal,
          sentenceCorrect: a.sentenceCorrect,
          sentenceWrong: a.sentenceWrong,
        };
      })
      .sort((a, b) => {
        if (a.isStudyingNow !== b.isStudyingNow) return a.isStudyingNow ? -1 : 1;
        if (b.minutesToday !== a.minutesToday) return b.minutesToday - a.minutesToday;
        const ta = a.lastEventAt ? a.lastEventAt.getTime() : 0;
        const tb = b.lastEventAt ? b.lastEventAt.getTime() : 0;
        return tb - ta;
      });
  }
}
