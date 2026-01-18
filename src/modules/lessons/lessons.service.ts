// src/modules/lessons/lessons.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.lesson.findMany({
      orderBy: { hskLevel: 'asc' },
    });
  }

  create(data: {
    hskLevel: number;
    vi: string;
    zh: string;
    pinyin: string;
  }) {
    return this.prisma.lesson.create({ data });
  }
}
