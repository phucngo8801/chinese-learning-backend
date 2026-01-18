import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BadgeService } from './badge.service';
import { BadgeController } from './badge.controller';

@Module({
  imports: [PrismaModule],
  providers: [BadgeService],
  controllers: [BadgeController],
  exports: [BadgeService], // ⭐ BẮT BUỘC
})
export class BadgeModule {}
