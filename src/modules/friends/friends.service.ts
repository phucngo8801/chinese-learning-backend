import { Injectable, BadRequestException } from '@nestjs/common';
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
export class FriendsService {
  constructor(private prisma: PrismaService) {}

  // 1) SEND REQUEST
  async sendRequest(senderId: string, receiverId: string) {
    if (!senderId) throw new BadRequestException('SenderId missing');
    if (!receiverId) throw new BadRequestException('ReceiverId missing');
    if (senderId === receiverId) throw new BadRequestException('Cannot add yourself');

    const receiver = await this.prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });
    if (!receiver) throw new BadRequestException('Receiver not found');

    const existed = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existed) throw new BadRequestException('Friend request already exists');

    return this.prisma.friend.create({
      data: { senderId, receiverId, status: 'PENDING' },
    });
  }

  // 2) INCOMING REQUESTS
  async getIncoming(userId: string) {
    return this.prisma.friend.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: { sender: { select: SAFE_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 3) SENT REQUESTS
  async getSent(userId: string) {
    return this.prisma.friend.findMany({
      where: { senderId: userId, status: 'PENDING' },
      include: { receiver: { select: SAFE_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // 4) ACCEPT
  async acceptRequest(senderId: string, receiverId: string) {
    return this.prisma.friend.updateMany({
      where: { senderId, receiverId, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
  }

  // 5) REJECT
  async rejectRequest(senderId: string, receiverId: string) {
    return this.prisma.friend.deleteMany({
      where: { senderId, receiverId, status: 'PENDING' },
    });
  }

  // 6) FRIEND LIST (SAFE)
  async getFriends(userId: string) {
    const rows = await this.prisma.friend.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: SAFE_USER_SELECT },
        receiver: { select: SAFE_USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((f) => (f.senderId === userId ? f.receiver : f.sender));
  }

  private async getFriendIds(userId: string) {
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
   * 7) FRIEND STATUS (MVP - KHÔNG CẦN userPresence/studySession)
   * - minutesToday: ceil(sum(durationSec)/60), có học thì tối thiểu 1 phút
   * - isStudyingNow: có event trong 10 phút gần nhất
   * - lastSeenAt: event gần nhất trong hôm nay (nếu không có thì null)
   * - vocabCorrect/vocabWrong
   * - sentenceCorrect/sentenceWrong/sentenceTotal
   */
  async getFriendsStatus(userId: string) {
    const friendIds = await this.getFriendIds(userId);
    if (friendIds.length === 0) return [];

    const now = new Date();
    const today = startOfLocalDay(now);
    const tomorrow = addDays(today, 1);
    const TEN_MIN = 10 * 60 * 1000;

    const [friends, eventsToday] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: friendIds } },
        select: SAFE_USER_SELECT,
      }),
      this.prisma.studyEvent.findMany({
        where: {
          userId: { in: friendIds },
          createdAt: { gte: today, lt: tomorrow },
        },
        select: { userId: true, type: true, correct: true, durationSec: true, createdAt: true },
      }),
    ]);

    const agg = new Map<
      string,
      {
        durationSec: number;
        vocabCorrect: number;
        vocabWrong: number;
        sentenceTotal: number;
        sentenceCorrect: number;
        sentenceWrong: number;
        lastEventAt: Date | null;
      }
    >();

    for (const fid of friendIds) {
      agg.set(fid, {
        durationSec: 0,
        vocabCorrect: 0,
        vocabWrong: 0,
        sentenceTotal: 0,
        sentenceCorrect: 0,
        sentenceWrong: 0,
        lastEventAt: null,
      });
    }

    for (const e of eventsToday) {
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

    return friends
      .map((u) => {
        const a = agg.get(u.id)!;

        const minutesToday =
          a.durationSec > 0 ? Math.max(1, Math.ceil(a.durationSec / 60)) : 0;

        const isStudyingNow =
          !!a.lastEventAt && now.getTime() - a.lastEventAt.getTime() <= TEN_MIN;

        // MVP: coi như "online-ish" nếu vừa học trong 10 phút
        const online = isStudyingNow;

        return {
          user: u,
          online,
          lastSeenAt: a.lastEventAt,
          isStudyingNow,

          minutesToday,

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
        const ta = a.lastSeenAt ? a.lastSeenAt.getTime() : 0;
        const tb = b.lastSeenAt ? b.lastSeenAt.getTime() : 0;
        return tb - ta;
      });
  }
}
