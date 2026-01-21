import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly gateway: ChatGateway,
  ) {}

  @Get('conversations')
  async listConversations(@Req() req: any) {
    return this.chatService.listConversations(req.user.id);
  }

  @Post('with/:otherUserId')
  async withUser(@Req() req: any, @Param('otherUserId') otherUserId: string) {
    const meId = req.user.id;
    const itemMe = await this.chatService.createOrGetConversationItem(meId, otherUserId);

    // push conversation item cho người kia (để họ thấy trong list như room)
    try {
      const itemOther = await this.chatService.getConversationSummaryForUser(otherUserId, itemMe.id);
      this.gateway.emitConversationAddedForUsers([otherUserId], itemOther);
    } catch {}

    // cũng emit cho chính mình để FE đồng bộ (optional)
    this.gateway.emitConversationAddedForUsers([meId], itemMe);

    return itemMe;
  }

  @Post('groups')
  async createGroup(
    @Req() req: any,
    @Body() body: { title: string; memberIds: string[] },
  ) {
    const conv = await this.chatService.createGroup(
      req.user.id,
      body?.title,
      body?.memberIds || [],
    );

    // emit conversation_added cho từng member
    const members = await this.chatService.getConversationMembers(conv.id);
    for (const m of members) {
      const item = await this.chatService.getConversationSummaryForUser(m.userId, conv.id);
      this.gateway.emitConversationAddedForUsers([m.userId], item);
    }

    return { conversationId: conv.id };
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    return this.chatService.getMessages(req.user.id, conversationId, {
      limit: Math.min(Number(limit || 40), 100),
      before: before || undefined,
    });
  }

  @Patch('conversations/:conversationId')
  async updateConversation(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() body: { title?: string },
  ) {
    const updated = await this.chatService.updateConversation(req.user.id, conversationId, body);

    // Realtime update for sidebar + header (no reload)
    await this.gateway.emitConversationUpdatedForConversation(conversationId);

    return updated;
  }

  @Patch('conversations/:conversationId/nickname')
  async setNickname(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() body: { nickname?: string },
  ) {
    const res = await this.chatService.setNickname(
      req.user.id,
      conversationId,
      body?.nickname ?? null,
    );

    // Notify all clients to refetch members so display names update immediately
    await this.gateway.emitMembersUpdated(conversationId, {
      reason: 'NICKNAME',
      actorId: req.user.id,
      userId: req.user.id,
    });

    return res;
  }

  // ===== Members =====
  @Get('conversations/:conversationId/members')
  async getMembers(@Req() req: any, @Param('conversationId') conversationId: string) {
    await this.chatService.ensureConversationMember(req.user.id, conversationId);
    return this.chatService.getConversationMembers(conversationId);
  }

  // Set nickname for a target member (Messenger-like)
  @Patch('conversations/:conversationId/nicknames/:targetUserId')
  async setNicknameForMember(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() body: { nickname?: string },
  ) {
    const res = await this.chatService.setNicknameForMember(
      req.user.id,
      conversationId,
      targetUserId,
      body?.nickname ?? null,
    );

    await this.gateway.emitMembersUpdated(conversationId, {
      reason: 'NICKNAME',
      actorId: req.user.id,
      userId: targetUserId,
    });

    return res;
  }

  @Post('conversations/:conversationId/members')
  async addMembers(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() body: { userIds: string[] },
  ) {
    const res = await this.chatService.addMembers(
      req.user.id,
      conversationId,
      body?.userIds || [],
    );

    // emit conversation_added cho user mới
    for (const uid of res.addedUserIds || []) {
      const item = await this.chatService.getConversationSummaryForUser(uid, conversationId);
      this.gateway.emitConversationAddedForUsers([uid], item);
    }

    // Notify existing members + new members to refresh UI without reload
    await this.gateway.emitMembersUpdated(conversationId, {
      reason: 'ADDED',
      actorId: req.user.id,
      addedUserIds: res.addedUserIds || [],
    });
    await this.gateway.emitConversationUpdatedForConversation(conversationId);

    return res;
  }

  @Post('conversations/:conversationId/leave')
  async leave(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    const res = await this.chatService.leaveGroup(req.user.id, conversationId);

    if (res.deleted) {
      this.gateway.emitConversationDeleted(conversationId);
      return { ok: true, deleted: true };
    }

    this.gateway.emitConversationRemovedForUser(req.user.id, conversationId);

    // Notify remaining members to refresh membersCount + member list
    await this.gateway.emitMembersUpdated(conversationId, {
      reason: 'LEFT',
      actorId: req.user.id,
      leftUserId: req.user.id,
    });
    await this.gateway.emitConversationUpdatedForConversation(conversationId);

    return { ok: true, deleted: false };
  }

  @Patch('messages/:messageId')
  async editMessage(
    @Req() req: any,
    @Param('messageId') messageId: string,
    @Body() body: { text: string },
  ) {
    const res = await this.chatService.editMessage(req.user.id, messageId, body?.text);
    this.gateway.emitChatMessageUpdate(res.conversationId, {
      type: 'EDIT',
      conversationId: res.conversationId,
      message: res.message,
    });
    return res.message;
  }

  @Delete('messages/:messageId')
  async revokeMessage(@Req() req: any, @Param('messageId') messageId: string) {
    const res = await this.chatService.revokeMessage(req.user.id, messageId);

    this.gateway.emitChatMessageUpdate(res.conversationId, {
      type: 'DELETE',
      conversationId: res.conversationId,
      message: res.message,
    });

    return { ok: true };
  }

  @Post('messages/:messageId/hide')
  async hideMessage(@Req() req: any, @Param('messageId') messageId: string) {
    const res = await this.chatService.hideMessage(req.user.id, messageId);
    this.gateway.emitMessageHidden(req.user.id, {
      conversationId: res.conversationId,
      messageId: res.messageId,
    });
    return { ok: true };
  }

  @Post('messages/:messageId/reactions')
  async react(
    @Req() req: any,
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
  ) {
    const res = await this.chatService.toggleReaction(req.user.id, messageId, body?.emoji);
    this.gateway.emitChatMessageUpdate(res.conversationId, {
      type: 'REACTIONS',
      conversationId: res.conversationId,
      messageId,
      reactions: res.reactions,
    });
    return { ok: true, reactions: res.reactions };
  }

  // ===== Uploads for chat =====
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/chat',
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = (file.originalname || '').split('.').pop() || 'bin';
          cb(null, `${unique}.${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file: any) {
    if (!file) return { attachment: null };

    const mime = file.mimetype;
    return {
      attachment: {
        url: `/uploads/chat/${file.filename}`,
        name: file.originalname,
        mime,
        size: file.size,
      },
    };
  }
}
