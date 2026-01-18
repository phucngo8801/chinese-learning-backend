import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';

@Module({
  imports: [PrismaModule],
  controllers: [FriendsController],
  providers: [FriendsService],
  exports: [FriendsService], // ✅ rất quan trọng
})
export class FriendsModule {} // ✅ PHẢI export
