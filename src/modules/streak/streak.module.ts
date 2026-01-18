import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StreakService } from './streak.service';
import { StreakController } from './streak.controller';
import { BadgeModule } from '../badge/badge.module';

@Module({
  imports: [PrismaModule, BadgeModule],
  providers: [StreakService],
  controllers: [StreakController],
  exports: [StreakService], // ✅ quan trọng để Vocab inject được
})
export class StreakModule {}
