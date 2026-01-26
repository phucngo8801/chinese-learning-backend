import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_BOX = 6;

const BOX_INTERVAL_DAYS: Record<number, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 14,
  6: 30,
};

// For "Hard" grading: schedule an earlier re-check without dropping the box.
// Minutes (not days) so users can re-see hard items within the same day.
const HARD_INTERVAL_MINUTES: Record<number, number> = {
  1: 10, // if user is still at box 1, check again soon
  2: 60,
  3: 180,
  4: 360,
  5: 720,
  6: 1440,
};

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function clampHsk(n: unknown) {
  const nn = Math.floor(Number(n));
  if (!Number.isFinite(nn) || nn < 1) return 1;
  if (nn > 6) return 6;
  return nn;
}


type CatalogFilter =
  | 'all'
  | 'new'
  | 'learning'
  | 'due'
  | 'weak'
  | 'mastered'
  | 'selected';

@Injectable()
export class VocabService {
  constructor(private prisma: PrismaService) {}

  // ========== (A) RANDOM SRS ==========
  async getRandomForUser(userId: string) {
    const now = new Date();

    // ưu tiên due
    const due = await this.prisma.userVocabProgress.findMany({
      where: { userId, nextReview: { lte: now } },
      orderBy: [{ box: 'asc' }, { wrong: 'desc' }, { nextReview: 'asc' }],
      take: 20,
      select: { vocabId: true },
    });

    if (due.length > 0) {
      const pick = due[Math.floor(Math.random() * due.length)];
      return this.prisma.vocab.findUnique({ where: { id: pick.vocabId } });
    }

    // random unseen
    const progressed = await this.prisma.userVocabProgress.findMany({
      where: { userId },
      select: { vocabId: true },
    });
    const progressedIds = progressed.map((x) => x.vocabId);

    const unseenCount = await this.prisma.vocab.count({
      where: progressedIds.length ? { id: { notIn: progressedIds } } : {},
    });

    if (unseenCount > 0) {
      const skip = Math.floor(Math.random() * unseenCount);
      return this.prisma.vocab.findFirst({
        where: progressedIds.length ? { id: { notIn: progressedIds } } : {},
        orderBy: { id: 'asc' },
        skip,
      });
    }

    // fallback: cái nextReview gần nhất
    const next = await this.prisma.userVocabProgress.findFirst({
      where: { userId },
      orderBy: { nextReview: 'asc' },
      select: { vocabId: true },
    });

    if (!next) return null;
    return this.prisma.vocab.findUnique({ where: { id: next.vocabId } });
  }

  /**
   * Record SRS result.
   * Backward-compatible:
   * - Old clients send {correct: boolean} => mapped to grade 2 (good) or 0 (again).
   * - New clients can send grade:
   *   0=again, 1=hard, 2=good, 3=easy.
   */
  async recordResult(
    userId: string,
    vocabId: number,
    input: { correct: boolean; grade?: number },
  ) {
    const now = new Date();

    const existing = await this.prisma.userVocabProgress.findUnique({
      where: { userId_vocabId: { userId, vocabId } },
      select: { box: true },
    });

    const prevBox = existing?.box ?? 1;

    // grade: 0=again, 1=hard, 2=good, 3=easy
    const rawGrade =
      typeof input.grade === 'number' && Number.isFinite(input.grade)
        ? Math.round(input.grade)
        : input.correct
        ? 2
        : 0;
    const grade = Math.min(Math.max(rawGrade, 0), 3);

    let newBox = prevBox;
    let nextReview: Date;

    if (grade === 0) {
      // Again
      newBox = 1;
      nextReview = addSeconds(now, 30);
    } else if (grade === 1) {
      // Hard: keep the box, but review sooner
      newBox = Math.min(Math.max(prevBox, 1), MAX_BOX);
      nextReview = addMinutes(now, HARD_INTERVAL_MINUTES[newBox] ?? 60);
    } else if (grade === 2) {
      // Good
      newBox = Math.min(prevBox + 1, MAX_BOX);
      nextReview = addDays(now, BOX_INTERVAL_DAYS[newBox] ?? 30);
    } else {
      // Easy
      newBox = Math.min(prevBox + 2, MAX_BOX);
      nextReview = addDays(now, BOX_INTERVAL_DAYS[newBox] ?? 30);
    }

    const isCorrect = grade > 0;

    return this.prisma.userVocabProgress.upsert({
      where: { userId_vocabId: { userId, vocabId } },
      update: {
        correct: isCorrect ? { increment: 1 } : undefined,
        wrong: !isCorrect ? { increment: 1 } : undefined,
        lastSeen: now,
        box: newBox,
        nextReview,
      },
      create: {
        userId,
        vocabId,
        correct: isCorrect ? 1 : 0,
        wrong: isCorrect ? 0 : 1,
        lastSeen: now,
        box: newBox,
        nextReview,
      },
    });
  }

  /**
   * Due-only review queue for SRS.
   * Used by FE "Ôn tập hôm nay".
   */
  async getReviewQueueForUser(userId: string, limit = 20) {
    const now = new Date();

    const dueCount = await this.prisma.userVocabProgress.count({
      where: { userId, nextReview: { lte: now } },
    });

    const progresses = await this.prisma.userVocabProgress.findMany({
      where: { userId, nextReview: { lte: now } },
      include: { vocab: true },
      orderBy: [{ box: 'asc' }, { wrong: 'desc' }, { nextReview: 'asc' }],
      take: limit,
    });

    const nextUp =
      dueCount === 0
        ? await this.prisma.userVocabProgress.findFirst({
            where: { userId },
            orderBy: { nextReview: 'asc' },
            select: { nextReview: true },
          })
        : null;

    const items = progresses.map((p) => ({
      ...p.vocab,
      progress: {
        box: p.box,
        nextReview: p.nextReview,
        correct: p.correct,
        wrong: p.wrong,
        lastSeen: p.lastSeen,
      },
      status: this.computeStatus(p, now),
    }));

    return {
      ok: true,
      dueCount,
      nextUpAt: nextUp?.nextReview ?? null,
      items,
    };
  }

  // ========== (B) GET 1 VOCAB ==========
  async getVocabById(id: number) {
    return this.prisma.vocab.findUnique({ where: { id } });
  }

  // ========== (C) MY LIST TOGGLE ==========
  async toggleMyList(userId: string, vocabId: number) {
    const exists = await this.prisma.userVocab.findUnique({
      where: { userId_vocabId: { userId, vocabId } },
      select: { id: true },
    });

    if (exists) {
      await this.prisma.userVocab.delete({
        where: { userId_vocabId: { userId, vocabId } },
      });
      return { selected: false };
    }

    await this.prisma.userVocab.create({ data: { userId, vocabId } });
    return { selected: true };
  }

  // ✅ CREATE + AUTO ADD MY LIST
  async createVocabForUser(
    userId: string,
    body: {
      zh: string;
      pinyin: string;
      vi: string;
      level?: number;
      addToMyList?: boolean;
    },
  ) {
    const zh = (body.zh ?? '').trim();
    const pinyin = (body.pinyin ?? '').trim();
    const vi = (body.vi ?? '').trim();
    const level = clampHsk(body.level ?? 1);
    const addToMyList = body.addToMyList !== false;

    if (!zh || !vi) return { ok: false, message: 'Thiếu zh hoặc vi' };

    const existing = await this.prisma.vocab.findFirst({
      where: { zh, ...(pinyin ? { pinyin } : {}) },
    });

    if (existing) {
      let selected = false;
      if (addToMyList) {
        await this.prisma.userVocab.upsert({
          where: { userId_vocabId: { userId, vocabId: existing.id } },
          update: {},
          create: { userId, vocabId: existing.id },
        });
        selected = true;
      }
      return { ok: true, created: false, selected, item: existing };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vocab.create({
        data: { zh, pinyin, vi, level },
      });

      let selected = false;
      if (addToMyList) {
        await tx.userVocab.create({ data: { userId, vocabId: created.id } });
        selected = true;
      }

      return { created, selected };
    });

    return {
      ok: true,
      created: true,
      selected: result.selected,
      item: result.created,
    };
  }

  // ✅ BULK CREATE
  async bulkCreateVocabForUser(
    userId: string,
    body: {
      text: string;
      delimiter?: string;
      addToMyList?: boolean;
      defaultLevel?: number;
    },
  ) {
    const text = (body.text ?? '').trim();
    const delimiter = (body.delimiter ?? '|').trim() || '|';
    const addToMyList = body.addToMyList !== false;
    const defaultLevel = clampHsk(body.defaultLevel ?? 1);

    if (!text) return { ok: false, message: 'text rỗng' };

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: {
      zh: string;
      pinyin: string;
      vi: string;
      level: number;
      raw: string;
    }[] = [];
    const errors: { line: number; raw: string; reason: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];

      // hỗ trợ: delimiter hoặc tab (copy từ Excel)
      const parts = raw
        .split(new RegExp(`\\s*\\${delimiter}\\s*|\\t+`))
        .map((x) => x.trim())
        .filter((x) => x.length > 0);

      if (parts.length < 2) {
        errors.push({
          line: i + 1,
          raw,
          reason: 'Thiếu cột. Format: zh | pinyin | vi | level?',
        });
        continue;
      }

      let zh = '';
      let pinyin = '';
      let vi = '';
      let level = defaultLevel;

      if (parts.length === 2) {
        // zh | vi
        zh = parts[0];
        vi = parts[1];
      } else {
        // zh | pinyin | vi | level?
        zh = parts[0];
        pinyin = parts[1] ?? '';
        vi = parts[2] ?? '';
        if (parts[3]) {
          const lv = Number(parts[3]);
          if (Number.isFinite(lv) && lv > 0) level = lv;
        }
      }

      if (!zh || !vi) {
        errors.push({ line: i + 1, raw, reason: 'Thiếu zh hoặc vi' });
        continue;
      }

      parsed.push({ zh, pinyin, vi, level, raw });
    }

    if (parsed.length === 0)
      return { ok: false, message: 'Không có dòng hợp lệ', errors };

    // Speed-up: avoid N * (findFirst + create + upsert) round-trips.
    // Strategy:
    // 1) prefetch all vocabs by zh
    // 2) createMany missing (dedup)
    // 3) refetch to get ids
    // 4) createMany userVocab (skipDuplicates)
    // Normalize level (HSK) to 1..6 to avoid garbage values.
    for (const r of parsed) r.level = clampHsk(r.level);

    const uniqueZh = Array.from(new Set(parsed.map((r) => r.zh)));
    const chunk = <T,>(arr: T[], size: number) => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    const fetchExistingByZh = async () => {
      const out: any[] = [];
      for (const part of chunk(uniqueZh, 500)) {
        const rows = await this.prisma.vocab.findMany({
          where: { zh: { in: part } },
          select: { id: true, zh: true, pinyin: true },
        });
        out.push(...rows);
      }
      return out;
    };

    const existing = await fetchExistingByZh();
    const preIds = new Set(existing.map((v) => v.id));
    const existingByZh = new Map<string, { id: number; pinyin: string }[]>();
    for (const v of existing) {
      const list = existingByZh.get(v.zh) ?? [];
      list.push(v);
      existingByZh.set(v.zh, list);
    }

    // Determine missing vocab entries (dedup).
    const toCreate = new Map<
      string,
      { zh: string; pinyin: string; vi: string; level: number }
    >();

    for (const row of parsed) {
      const list = existingByZh.get(row.zh) ?? [];
      const hasMatch = row.pinyin
        ? list.some((v) => v.pinyin === row.pinyin)
        : list.length > 0; // when pinyin is empty, treat any zh match as existing (same as previous logic)

      if (hasMatch) continue;

      // Key: if pinyin empty => key is zh only (create at most 1 vocab for that zh)
      const key = row.pinyin ? `${row.zh}\u0000${row.pinyin}` : `${row.zh}\u0000`;
      if (!toCreate.has(key)) {
        toCreate.set(key, {
          zh: row.zh,
          pinyin: row.pinyin ?? '',
          vi: row.vi,
          level: row.level,
        });
      }
    }

    // Create missing in bulk (single round-trip).
    const createData = Array.from(toCreate.values());
    if (createData.length > 0) {
      await this.prisma.vocab.createMany({ data: createData });
    }

    // Refetch to resolve ids (createMany doesn't return ids).
    const after = await fetchExistingByZh();
    const afterByZh = new Map<string, { id: number; pinyin: string }[]>();
    for (const v of after) {
      const list = afterByZh.get(v.zh) ?? [];
      list.push(v);
      afterByZh.set(v.zh, list);
    }

    const createdIds = new Set<number>();
    for (const v of after) {
      if (!preIds.has(v.id)) createdIds.add(v.id);
    }

    const pickMatch = (row: { zh: string; pinyin: string }) => {
      const list = afterByZh.get(row.zh) ?? [];
      if (row.pinyin) return list.find((v) => v.pinyin === row.pinyin) ?? null;
      return list[0] ?? null;
    };

    let createdCount = 0;
    let existedCount = 0;
    const countedCreated = new Set<number>();
    const selectedVocabIds = new Set<number>();

    for (const row of parsed) {
      const match = pickMatch(row);
      if (!match) continue;

      if (addToMyList) selectedVocabIds.add(match.id);

      if (createdIds.has(match.id) && !countedCreated.has(match.id)) {
        createdCount++;
        countedCreated.add(match.id);
      } else {
        existedCount++;
      }
    }

    if (addToMyList && selectedVocabIds.size > 0) {
      await this.prisma.userVocab.createMany({
        data: Array.from(selectedVocabIds).map((vocabId) => ({ userId, vocabId })),
        skipDuplicates: true,
      });
    }

    return {
      ok: true,
      totalLines: lines.length,
      validLines: parsed.length,
      createdCount,
      existedCount,
      selectedCount: addToMyList ? selectedVocabIds.size : 0,
      errors,
    };
  }



  // ✅ One-time normalize existing vocab.level into HSK range (1-6).
  // Any invalid values (<1, >6) will be set to 1.
  async normalizeHskValues() {
    const res = await this.prisma.vocab.updateMany({
      where: { OR: [{ level: { lt: 1 } }, { level: { gt: 6 } }] },
      data: { level: 1 },
    });

    return { ok: true, updatedCount: res.count };
  }

  // ========== (D) CATALOG ==========
  private buildQWhere(q: string) {
    const qq = (q ?? '').trim();
    if (!qq) return {};
    return {
      OR: [
        { zh: { contains: qq } },
        { pinyin: { contains: qq, mode: 'insensitive' as any } },
        { vi: { contains: qq, mode: 'insensitive' as any } },
      ],
    };
  }

  private computeStatus(progress: any, now: Date) {
    if (!progress) return 'new';
    const wrong = progress.wrong ?? 0;
    const correct = progress.correct ?? 0;
    if (wrong >= 3 || wrong > correct) return 'weak';
    if (progress.nextReview && new Date(progress.nextReview) <= now) return 'due';
    if ((progress.box ?? 1) >= 4) return 'mastered';
    return 'learning';
  }

  async getCatalogForUser(
    userId: string,
    params: { q: string; filter: CatalogFilter; page: number; limit: number; hsk?: number },
  ) {
    const now = new Date();
    const { q, filter, page, limit, hsk } = params;

    const skip = (page - 1) * limit;
    const qWhere: any = this.buildQWhere(q);

    const vocabWhere: any = typeof hsk === 'number' ? { AND: [qWhere, { level: hsk }] } : qWhere;

    if (filter === 'selected') {
      const total = await this.prisma.userVocab.count({
        where: { userId, vocab: vocabWhere },
      });

      const rows = await this.prisma.userVocab.findMany({
        where: { userId, vocab: vocabWhere },
        include: { vocab: true },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      });

      const vocabIds = rows.map((r) => r.vocabId);

      const progresses = await this.prisma.userVocabProgress.findMany({
        where: { userId, vocabId: { in: vocabIds } },
      });

      const progMap = new Map(progresses.map((p) => [p.vocabId, p]));

      const items = rows.map((r) => {
        const p = progMap.get(r.vocabId) ?? null;
        return {
          ...r.vocab,
          progress: p
            ? {
                box: p.box,
                nextReview: p.nextReview,
                correct: p.correct,
                wrong: p.wrong,
                lastSeen: p.lastSeen,
              }
            : null,
          selected: true,
          status: this.computeStatus(p, now),
        };
      });

      return { page, limit, total, items };
    }

    // all/new/learning/due/weak/mastered
    if (
      filter === 'due' ||
      filter === 'learning' ||
      filter === 'mastered' ||
      filter === 'weak'
    ) {
      const progressWhere: any = { userId, vocab: vocabWhere };
      if (filter === 'due') progressWhere.nextReview = { lte: now };
      if (filter === 'learning') progressWhere.box = { in: [1, 2, 3] };
      if (filter === 'mastered') progressWhere.box = { gte: 4 };
      if (filter === 'weak') progressWhere.wrong = { gte: 3 };

      const total = await this.prisma.userVocabProgress.count({
        where: progressWhere,
      });

      const progresses = await this.prisma.userVocabProgress.findMany({
        where: progressWhere,
        include: { vocab: true },
        orderBy:
          filter === 'due'
            ? [{ nextReview: 'asc' }]
            : filter === 'weak'
            ? [{ wrong: 'desc' }, { box: 'asc' }]
            : [{ box: 'desc' }, { nextReview: 'asc' }],
        skip,
        take: limit,
      });

      const vocabIds = progresses.map((p) => p.vocabId);

      const selectedRows = await this.prisma.userVocab.findMany({
        where: { userId, vocabId: { in: vocabIds } },
        select: { vocabId: true },
      });
      const selectedSet = new Set(selectedRows.map((s) => s.vocabId));

      const items = progresses.map((p) => ({
        ...p.vocab,
        progress: {
          box: p.box,
          nextReview: p.nextReview,
          correct: p.correct,
          wrong: p.wrong,
          lastSeen: p.lastSeen,
        },
        selected: selectedSet.has(p.vocabId),
        status: this.computeStatus(p, now),
      }));

      return { page, limit, total, items };
    }

    if (filter === 'new') {
      const progressedIds = (
        await this.prisma.userVocabProgress.findMany({
          where: { userId },
          select: { vocabId: true },
        })
      ).map((x) => x.vocabId);

      const where: any = typeof hsk === 'number' ? { AND: [qWhere, { level: hsk }] } : { ...qWhere };
      if (progressedIds.length > 0) where.id = { notIn: progressedIds };

      const total = await this.prisma.vocab.count({ where });

      const vocabs = await this.prisma.vocab.findMany({
        where,
        orderBy: [{ level: 'asc' }, { id: 'asc' }],
        skip,
        take: limit,
      });

      const vocabIds = vocabs.map((v) => v.id);

      const selectedRows = await this.prisma.userVocab.findMany({
        where: { userId, vocabId: { in: vocabIds } },
        select: { vocabId: true },
      });
      const selectedSet = new Set(selectedRows.map((s) => s.vocabId));

      const items = vocabs.map((v) => ({
        ...v,
        progress: null,
        selected: selectedSet.has(v.id),
        status: 'new',
      }));

      return { page, limit, total, items };
    }

    // all
    const total = await this.prisma.vocab.count({ where: vocabWhere });

    const vocabs = await this.prisma.vocab.findMany({
      where: vocabWhere,
      orderBy: [{ level: 'asc' }, { id: 'asc' }],
      skip,
      take: limit,
    });

    const vocabIds = vocabs.map((v) => v.id);

    const progresses = await this.prisma.userVocabProgress.findMany({
      where: { userId, vocabId: { in: vocabIds } },
    });

    const selectedRows = await this.prisma.userVocab.findMany({
      where: { userId, vocabId: { in: vocabIds } },
      select: { vocabId: true },
    });

    const progMap = new Map(progresses.map((p) => [p.vocabId, p]));
    const selectedSet = new Set(selectedRows.map((s) => s.vocabId));

    const items = vocabs.map((v) => {
      const p = progMap.get(v.id) ?? null;
      return {
        ...v,
        progress: p
          ? {
              box: p.box,
              nextReview: p.nextReview,
              correct: p.correct,
              wrong: p.wrong,
              lastSeen: p.lastSeen,
            }
          : null,
        selected: selectedSet.has(v.id),
        status: this.computeStatus(p, now),
      };
    });

    return { page, limit, total, items };
  }

  // ========== (E) NEXT SELECTED (MY LIST) ==========
  async getNextSelectedForUser(userId: string, excludeIds: number[]) {
    const now = new Date();

    const rows = await this.prisma.userVocab.findMany({
      where: {
        userId,
        ...(excludeIds.length ? { vocabId: { notIn: excludeIds } } : {}),
      },
      include: { vocab: true },
      orderBy: { id: 'asc' },
      take: 500,
    });

    if (rows.length === 0) {
      return { ok: true, done: true, item: null };
    }

    const vocabIds = rows.map((r) => r.vocabId);

    const progresses = await this.prisma.userVocabProgress.findMany({
      where: { userId, vocabId: { in: vocabIds } },
    });
    const progMap = new Map(progresses.map((p) => [p.vocabId, p]));

    // ưu tiên: due -> weak -> learning -> new
    const scored = rows.map((r) => {
      const p = progMap.get(r.vocabId) ?? null;

      const isDue = p?.nextReview ? new Date(p.nextReview) <= now : false;
      const wrong = p?.wrong ?? 0;
      const correct = p?.correct ?? 0;
      const box = p?.box ?? 1;

      let score = 0;
      if (isDue) score += 1000;
      if (wrong > correct) score += 500;
      score += (MAX_BOX - box) * 10; // box thấp ưu tiên
      score += wrong; // sai nhiều ưu tiên

      return { vocab: r.vocab, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return { ok: true, done: false, item: scored[0].vocab };
  }
}
