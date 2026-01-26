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

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function dateKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(max, Math.max(min, Math.round(x)));
}

@Injectable()
export class StudyService {
  constructor(private prisma: PrismaService) {}

  private getGoalMinutes() {
    const raw = process.env.STUDY_GOAL_MINUTES;
    const n = raw ? Number(raw) : 15;
    if (!Number.isFinite(n) || n <= 0) return 15;
    return Math.min(Math.max(Math.round(n), 5), 240);
  }

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

  /**
   * Personal summary for today.
   * FE uses this for daily goal progress & "Ôn tập hôm nay" counters.
   */
  async summaryToday(userId: string) {
    const now = new Date();
    const today = startOfLocalDay(now);
    const tomorrow = addDays(today, 1);

    const [events, dueVocabCount] = await Promise.all([
      this.prisma.studyEvent.findMany({
        where: { userId, createdAt: { gte: today, lt: tomorrow } },
        select: { type: true, correct: true, durationSec: true },
      }),
      this.prisma.userVocabProgress.count({
        where: { userId, nextReview: { lte: now } },
      }),
    ]);

    let durationSec = 0;
    let vocabCorrect = 0;
    let vocabWrong = 0;
    let sentenceCorrect = 0;
    let sentenceWrong = 0;
    let sentenceTotal = 0;

    for (const e of events) {
      durationSec += e.durationSec ?? 0;
      if (e.type === 'VOCAB') {
        if (e.correct) vocabCorrect++;
        else vocabWrong++;
      } else if (e.type === 'SENTENCE') {
        sentenceTotal++;
        if (e.correct) sentenceCorrect++;
        else sentenceWrong++;
      }
    }

    const minutesToday = durationSec > 0 ? Math.max(1, Math.ceil(durationSec / 60)) : 0;
    const goalMinutes = this.getGoalMinutes();
    const progressPct = Math.min(100, Math.round((minutesToday / goalMinutes) * 100));

    return {
      ok: true,
      dateKey: dateKeyLocal(today),
      goalMinutes,
      minutesToday,
      progressPct,
      dueVocabCount,
      vocabCorrect,
      vocabWrong,
      sentenceTotal,
      sentenceCorrect,
      sentenceWrong,
    };
  }

  /**
   * Last N days summary (default: 7) for dashboard mini chart.
   */
  async summaryWeek(userId: string, days = 7) {
    const now = new Date();
    const today = startOfLocalDay(now);
    const n = Math.min(Math.max(Math.round(days), 3), 31);

    const start = addDays(today, -(n - 1));
    const end = addDays(today, 1);

    const events = await this.prisma.studyEvent.findMany({
      where: { userId, createdAt: { gte: start, lt: end } },
      select: { type: true, correct: true, durationSec: true, createdAt: true },
    });

    const buckets = new Map<
      string,
      {
        durationSec: number;
        vocabCorrect: number;
        vocabWrong: number;
        sentenceCorrect: number;
        sentenceWrong: number;
        sentenceTotal: number;
      }
    >();

    for (let i = 0; i < n; i++) {
      const d = addDays(start, i);
      buckets.set(dateKeyLocal(d), {
        durationSec: 0,
        vocabCorrect: 0,
        vocabWrong: 0,
        sentenceCorrect: 0,
        sentenceWrong: 0,
        sentenceTotal: 0,
      });
    }

    for (const e of events) {
      const k = dateKeyLocal(new Date(e.createdAt));
      const b = buckets.get(k);
      if (!b) continue;

      b.durationSec += e.durationSec ?? 0;

      if (e.type === 'VOCAB') {
        if (e.correct) b.vocabCorrect++;
        else b.vocabWrong++;
      } else if (e.type === 'SENTENCE') {
        b.sentenceTotal++;
        if (e.correct) b.sentenceCorrect++;
        else b.sentenceWrong++;
      }
    }

    const series = Array.from(buckets.entries()).map(([dateKey, b]) => ({
      dateKey,
      minutes: b.durationSec > 0 ? Math.max(1, Math.ceil(b.durationSec / 60)) : 0,
      vocabCorrect: b.vocabCorrect,
      vocabWrong: b.vocabWrong,
      sentenceTotal: b.sentenceTotal,
      sentenceCorrect: b.sentenceCorrect,
      sentenceWrong: b.sentenceWrong,
    }));

    return { ok: true, days: n, series };
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

  /* ---------------- DAILY GATE ---------------- */

  private getDailyGateThreshold() {
    // Default: 80% (khá dễ mà vẫn có ý nghĩa)
    return clampInt(process.env.DAILY_GATE_THRESHOLD, 50, 95, 80);
  }

  private getDailyGateRerollLimit() {
    return clampInt(process.env.DAILY_GATE_REROLL_LIMIT, 0, 20, 5);
  }

  private async pickDailyGatePhrase(userId: string): Promise<{
    vocabId?: number;
    zh: string;
    pinyin: string;
    vi: string;
    level?: number;
    source: 'DUE' | 'MY_LIST' | 'RANDOM';
  }> {
    const now = new Date();

    // 1) Ưu tiên từ đến hạn ôn (SRS)
    const due = await this.prisma.userVocabProgress.findFirst({
      where: { userId, nextReview: { lte: now } },
      orderBy: [{ box: 'asc' }, { nextReview: 'asc' }],
      select: {
        vocabId: true,
        vocab: { select: { id: true, zh: true, pinyin: true, vi: true, level: true } },
      },
    });

    if (due?.vocab) {
      return {
        vocabId: due.vocab.id,
        zh: due.vocab.zh,
        pinyin: due.vocab.pinyin,
        vi: due.vocab.vi,
        level: due.vocab.level,
        source: 'DUE',
      };
    }

    // 2) Nếu không có từ đến hạn: lấy từ trong My List (UserVocab)
    const myCount = await this.prisma.userVocab.count({ where: { userId } });
    if (myCount > 0) {
      const skip = Math.floor(Math.random() * myCount);
      const row = await this.prisma.userVocab.findFirst({
        where: { userId },
        skip,
        select: {
          vocabId: true,
          vocab: { select: { id: true, zh: true, pinyin: true, vi: true, level: true } },
        },
      });

      if (row?.vocab) {
        return {
          vocabId: row.vocab.id,
          zh: row.vocab.zh,
          pinyin: row.vocab.pinyin,
          vi: row.vocab.vi,
          level: row.vocab.level,
          source: 'MY_LIST',
        };
      }
    }

    // 3) Fallback: random vocab toàn hệ thống
    const total = await this.prisma.vocab.count();
    if (total <= 0) {
      // Should not happen in real data, but keep the endpoint safe
      return { zh: '你好', pinyin: 'ni hao', vi: 'xin chào', source: 'RANDOM' };
    }
    const skip = Math.floor(Math.random() * total);
    const v = await this.prisma.vocab.findFirst({
      skip,
      select: { id: true, zh: true, pinyin: true, vi: true, level: true },
    });

    if (!v) return { zh: '你好', pinyin: 'ni hao', vi: 'xin chào', source: 'RANDOM' };
    return {
      vocabId: v.id,
      zh: v.zh,
      pinyin: v.pinyin,
      vi: v.vi,
      level: v.level,
      source: 'RANDOM',
    };
  }

  /**
   * Get today's gate state and the phrase users must pass.
   * Gate is keyed by local dateKey (server local time). For most dev setups,
   * set server TZ=Asia/Bangkok to match FE.
   */
  async getDailyGate(userId: string) {
    const now = new Date();
    const today = startOfLocalDay(now);
    const dateKey = dateKeyLocal(today);
    const threshold = this.getDailyGateThreshold();

    const existing = await this.prisma.dailyGate.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    });

    if (existing) {
      return {
        ok: true,
        dateKey,
        threshold: existing.threshold ?? threshold,
        passed: !!existing.passedAt,
        passedAt: existing.passedAt,
        bestScore: existing.bestScore ?? 0,
        rerollCount: (existing as any).rerollCount ?? 0,
        rerollLimit: this.getDailyGateRerollLimit(),
        phrase: {
          vocabId: existing.vocabId ?? null,
          zh: existing.phraseZh,
          pinyin: existing.phrasePinyin,
          vi: existing.phraseVi,
        },
      };
    }

    const phrase = await this.pickDailyGatePhrase(userId);

    const created = await this.prisma.dailyGate.create({
      data: {
        userId,
        dateKey,
        vocabId: phrase.vocabId ?? null,
        phraseZh: phrase.zh,
        phrasePinyin: phrase.pinyin,
        phraseVi: phrase.vi,
        threshold,
        bestScore: 0,
      },
    });

    return {
      ok: true,
      dateKey,
      threshold: created.threshold,
      passed: false,
      passedAt: null,
      bestScore: 0,
      rerollCount: (created as any).rerollCount ?? 0,
      rerollLimit: this.getDailyGateRerollLimit(),
      phrase: {
        vocabId: created.vocabId,
        zh: created.phraseZh,
        pinyin: created.phrasePinyin,
        vi: created.phraseVi,
      },
    };
  }


  /**
   * Đổi sang câu/ từ khác nếu câu hiện tại quá khó.
   * Có giới hạn số lần đổi mỗi ngày để tránh spam.
   */
  async rerollDailyGate(userId: string) {
    const now = new Date();
    const today = startOfLocalDay(now);
    const dateKey = dateKeyLocal(today);
    const threshold = this.getDailyGateThreshold();
    const limit = this.getDailyGateRerollLimit();

    const existing = await this.prisma.dailyGate.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    });

    // If no gate yet, create one first then reroll once (counts as 1)
    if (!existing) {
      await this.getDailyGate(userId);
      return this.rerollDailyGate(userId);
    }

    // If already passed, do not allow reroll (keep consistency)
    if (existing.passedAt) {
      return {
        ok: true,
        dateKey,
        threshold: existing.threshold ?? threshold,
        passed: true,
        passedAt: existing.passedAt,
        bestScore: existing.bestScore ?? 0,
        rerollCount: (existing as any).rerollCount ?? 0,
        rerollLimit: limit,
        phrase: {
          vocabId: existing.vocabId ?? null,
          zh: existing.phraseZh,
          pinyin: existing.phrasePinyin,
          vi: existing.phraseVi,
        },
      };
    }

    const rerollCount = (existing as any).rerollCount ?? 0;
    if (limit > 0 && rerollCount >= limit) {
      throw new BadRequestException('Hết lượt đổi câu hôm nay.');
    }

    // Pick an easier random vocab (default: level <= 2)
    const maxLevel = clampInt(process.env.DAILY_GATE_MAX_LEVEL, 1, 10, 2);
    const excludeIds = existing.vocabId ? [existing.vocabId] : [];

    const whereBase: any = {
      ...(maxLevel ? { level: { lte: maxLevel } } : {}),
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    };

    let total = await this.prisma.vocab.count({ where: whereBase });
    let v = null as any;

    if (total > 0) {
      const skip = Math.floor(Math.random() * total);
      v = await this.prisma.vocab.findFirst({
        where: whereBase,
        skip,
        select: { id: true, zh: true, pinyin: true, vi: true, level: true },
      });
    }

    // Fallback: no filtered vocab found
    if (!v) {
      total = await this.prisma.vocab.count({
        where: excludeIds.length ? { id: { notIn: excludeIds } } : undefined,
      });
      if (total <= 0) {
        v = { id: null, zh: '你好', pinyin: 'ni hao', vi: 'xin chào' };
      } else {
        const skip = Math.floor(Math.random() * total);
        v = await this.prisma.vocab.findFirst({
          where: excludeIds.length ? { id: { notIn: excludeIds } } : undefined,
          skip,
          select: { id: true, zh: true, pinyin: true, vi: true, level: true },
        });
      }
    }

    const updated = await this.prisma.dailyGate.update({
      where: { id: existing.id },
      data: {
        vocabId: v?.id ?? null,
        phraseZh: v?.zh || existing.phraseZh,
        phrasePinyin: v?.pinyin || existing.phrasePinyin,
        phraseVi: v?.vi || existing.phraseVi,
        bestScore: 0,
        lastTranscript: null,
        passedAt: null,
        rerollCount: rerollCount + 1,
        threshold: existing.threshold ?? threshold,
      } as any,
    });

    return {
      ok: true,
      dateKey,
      threshold: updated.threshold ?? threshold,
      passed: false,
      passedAt: null,
      bestScore: 0,
      rerollCount: (updated as any).rerollCount ?? (rerollCount + 1),
      rerollLimit: limit,
      phrase: {
        vocabId: updated.vocabId ?? null,
        zh: updated.phraseZh,
        pinyin: updated.phrasePinyin,
        vi: updated.phraseVi,
      },
    };
  }

  /**
   * Client-side chấm điểm (SpeechRecognition) rồi submit score lên server để
   * đồng bộ multi-device.
   */
  async submitDailyGate(
    userId: string,
    body: {
      score: number;
      transcript?: string;
      dateKey?: string;
      vocabId?: number;
      zh?: string;
      pinyin?: string;
      vi?: string;
    },
  ) {
    const now = new Date();
    const today = startOfLocalDay(now);
    const dateKey = (body?.dateKey || '').trim() || dateKeyLocal(today);
    const threshold = this.getDailyGateThreshold();

    const score = clampInt(body?.score, 0, 100, 0);
    const transcript = (body?.transcript || '').toString().slice(0, 500);

    const existing = await this.prisma.dailyGate.findUnique({
      where: { userId_dateKey: { userId, dateKey } },
    });

    const shouldPass = score >= (existing?.threshold ?? threshold);
    const nextBest = Math.max(existing?.bestScore ?? 0, score);

    // If missing, create from provided fields (or fetch by vocabId)
    let phraseZh = existing?.phraseZh;
    let phrasePinyin = existing?.phrasePinyin;
    let phraseVi = existing?.phraseVi;
    let vocabId: number | null | undefined = existing?.vocabId ?? null;

    if (!existing) {
      if (typeof body?.vocabId === 'number' && Number.isFinite(body.vocabId)) {
        const v = await this.prisma.vocab.findUnique({
          where: { id: Math.round(body.vocabId) },
          select: { id: true, zh: true, pinyin: true, vi: true },
        });
        if (v) {
          vocabId = v.id;
          phraseZh = v.zh;
          phrasePinyin = v.pinyin;
          phraseVi = v.vi;
        }
      }

      // If still missing, use direct payload
      phraseZh = phraseZh || (body?.zh || '').toString() || '你好';
      phrasePinyin = phrasePinyin || (body?.pinyin || '').toString() || 'ni hao';
      phraseVi = phraseVi || (body?.vi || '').toString() || 'xin chào';

      const created = await this.prisma.dailyGate.create({
        data: {
          userId,
          dateKey,
          vocabId: vocabId ?? null,
          phraseZh,
          phrasePinyin,
          phraseVi,
          threshold,
          bestScore: nextBest,
          lastTranscript: transcript || null,
          passedAt: shouldPass ? now : null,
        },
      });

      return {
        ok: true,
        dateKey: created.dateKey,
        threshold: created.threshold,
        passed: !!created.passedAt,
        bestScore: created.bestScore,
        passedAt: created.passedAt,
      };
    }

    const updated = await this.prisma.dailyGate.update({
      where: { id: existing.id },
      data: {
        bestScore: nextBest,
        lastTranscript: transcript || existing.lastTranscript,
        passedAt: existing.passedAt ? existing.passedAt : shouldPass ? now : null,
      },
    });

    return {
      ok: true,
      dateKey: updated.dateKey,
      threshold: updated.threshold,
      passed: !!updated.passedAt,
      bestScore: updated.bestScore,
      passedAt: updated.passedAt,
    };
  }
}
