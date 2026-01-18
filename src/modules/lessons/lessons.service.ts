// src/modules/lessons/lessons.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { cache } from '../../common/inMemoryCache';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    // Hot endpoint on the learning homepage.
    // Cache for 60s to reduce DB load + latency on free tiers.
    return cache.getOrSet('lessons:all', 60_000, async () => {
      return this.prisma.lesson.findMany({
        orderBy: { hskLevel: 'asc' },
      });
    });
  }

  create(data: {
    hskLevel: number;
    vi: string;
    zh: string;
    pinyin: string;
  }) {
    // Invalidate cache immediately after write.
    cache.del('lessons:all');
    return this.prisma.lesson.create({ data });
  }
}
