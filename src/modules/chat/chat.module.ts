import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@Module({
  imports: [
    // JwtService dùng trong Gateway để decode/verify token
    JwtModule.register({}),
  ],
  controllers: [ChatController],
  providers: [PrismaService, ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
