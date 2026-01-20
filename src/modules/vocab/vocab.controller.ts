import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { VocabService } from './vocab.service';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { StreakService } from '../streak/streak.service';
import { StudyService } from '../study/study.service';

@Controller('vocab')
@UseGuards(JwtAuthGuard)
export class VocabController {
  constructor(
    private readonly vocabService: VocabService,
    private readonly streakService: StreakService,
    private readonly studyService: StudyService,
  ) {}

  @Get('random')
  async random(@Req() req: any) {
    const userId: string = req.user.id;
    return this.vocabService.getRandomForUser(userId);
  }

  @Get('catalog')
  async catalog(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('filter') filter?: string,
    @Query('hsk') hsk?: string,
    @Query('level') level?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId: string = req.user.id;

    return this.vocabService.getCatalogForUser(userId, {
      q: q ?? '',
      filter: (filter ?? 'all') as any,
      page: Math.max(parseInt(page ?? '1', 10) || 1, 1),
      limit: Math.min(Math.max(parseInt(limit ?? '50', 10) || 50, 10), 100),
      hsk: (() => {
        const raw = (hsk ?? level ?? '').trim();
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 1) return undefined;
        return Math.min(Math.max(n, 1), 6);
      })(),
    });
  }

  @Post('my-list/toggle')
  async toggleMyList(@Req() req: any, @Body() body: { vocabId: number }) {
    const userId: string = req.user.id;
    return this.vocabService.toggleMyList(userId, body.vocabId);
  }

  @Post('result')
  async result(
    @Req() req: any,
    @Body() body: { vocabId: number; correct: boolean; durationSec?: number },
  ) {
    const userId: string = req.user.id;
    const durationSec = Math.max(0, Number(body.durationSec ?? 0));

    const progress = await this.vocabService.recordResult(
      userId,
      body.vocabId,
      !!body.correct,
    );

    // ✅ log studyEvent để friends/today tổng hợp đúng/sai + phút
    await this.studyService.logEvent(userId, {
      type: 'VOCAB',
      correct: !!body.correct,
      durationSec,
      itemId: String(body.vocabId),
    });

    // streak vẫn giữ theo logic bạn đang có
    const minutes = durationSec > 0 ? Math.max(1, Math.ceil(durationSec / 60)) : 0;
    const streak = await this.streakService.study(userId, minutes);

    return { ok: true, progress, streak };
  }

  @Post('create')
  async createVocab(
    @Req() req: any,
    @Body()
    body: {
      zh: string;
      pinyin: string;
      vi: string;
      level?: number;
      addToMyList?: boolean;
    },
  ) {
    const userId: string = req.user.id;
    return this.vocabService.createVocabForUser(userId, body);
  }

  @Post('bulk-create')
  async bulkCreate(
    @Req() req: any,
    @Body()
    body: {
      text: string;
      delimiter?: string;
      addToMyList?: boolean;
      defaultLevel?: number;
    },
  ) {
    const userId: string = req.user.id;
    return this.vocabService.bulkCreateVocabForUser(userId, body);
  }

  // ✅ One-time fix: dữ liệu cũ có thể bị "level" lớn (49/100...) => chuẩn hoá về HSK 1-6.
  // Mặc định: các giá trị invalid sẽ set về 1.
  @Post('normalize-hsk')
  async normalizeHsk() {
    return this.vocabService.normalizeHskValues();
  }

  @Get('selected/next')
  async nextSelected(@Req() req: any, @Query('exclude') exclude?: string) {
    const userId: string = req.user.id;

    const excludeIds =
      (exclude ?? '')
        .split(',')
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0) ?? [];

    return this.vocabService.getNextSelectedForUser(userId, excludeIds);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.vocabService.getVocabById(id);
  }
}
