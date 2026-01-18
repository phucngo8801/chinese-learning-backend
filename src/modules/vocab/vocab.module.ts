import { Module } from '@nestjs/common';
import { VocabController } from './vocab.controller';
import { VocabService } from './vocab.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { StreakModule } from '../streak/streak.module';
import { StudyModule } from '../study/study.module';

@Module({
  imports: [PrismaModule, StreakModule, StudyModule],
  controllers: [VocabController],
  providers: [VocabService],
})
export class VocabModule {}
