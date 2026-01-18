import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';

type AuthedSocket = Socket & { userId?: string };

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  path: '/socket.io',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  // online presence
  private onlineUserIds = new Set<string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  // =========================
  // Auth helpers (DEV SAFE)
  // =========================
  private extractToken(client: Socket): string | null {
    const tokenFromAuth =
      (client.handshake as any)?.auth?.token ||
      (client.handshake as any)?.auth?.accessToken;

    const header = client.handshake.headers?.authorization || '';
    const tokenFromHeader =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice(7)
        : null;

    return tokenFromAuth || tokenFromHeader || null;
  }

  private getJwtSecret(): string | null {
    // tuỳ project bạn đặt biến env gì thì add thêm ở đây
    return (
      process.env.JWT_SECRET ||
      process.env.ACCESS_TOKEN_SECRET ||
      process.env.SECRET ||
      null
    );
  }

  private async decodeUserIdFromToken(token: string): Promise<string | null> {
    // Nếu có secret -> verify chuẩn
    const secret = this.getJwtSecret();
    if (secret) {
      try {
        const payload = await this.jwtService.verifyAsync<any>(token, { secret });
        return payload?.sub || payload?.id || null;
      } catch (e: any) {
        this.logger.warn(`WS verify failed: ${e?.message || e}`);
        return null;
      }
    }

    // Nếu KHÔNG có secret (dev) -> decode để khỏi chết WS
    try {
      const payload = this.jwtService.decode(token) as any;
      return payload?.sub || payload?.id || null;
    } catch {
      return null;
    }
  }

  // =========================
  // Socket lifecycle
  // =========================
  async handleConnection(client: AuthedSocket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`WS reject socket=${client.id}: missing token`);
      client.disconnect(true);
      return;
    }

    const userId = await this.decodeUserIdFromToken(token);
    if (!userId) {
      this.logger.warn(`WS reject socket=${client.id}: invalid token`);
      client.disconnect(true);
      return;
    }

    client.userId = userId;

    // mark online
    this.onlineUserIds.add(userId);

    // join personal room
    client.join(`user:${userId}`);

    // broadcast presence update + send snapshot to this client
    this.server.emit('presence:update', { userId, online: true });
    client.emit('presence:snapshot', { userIds: Array.from(this.onlineUserIds) });

    this.logger.log(`WS connected socket=${client.id} user=${userId}`);
  }

  async handleDisconnect(client: AuthedSocket) {
    const userId = client.userId;
    if (!userId) return;

    // NOTE: nếu bạn muốn chính xác multi-tab: cần đếm socket per user
    // Ở đây đơn giản: disconnect là offline (dev ok)
    this.onlineUserIds.delete(userId);
    this.server.emit('presence:update', { userId, online: false });

    this.logger.log(`WS disconnected socket=${client.id} user=${userId}`);
  }

  // =========================
  // Presence
  // =========================
  @SubscribeMessage('presence:sync')
  handlePresenceSync(@ConnectedSocket() client: AuthedSocket) {
    client.emit('presence:snapshot', { userIds: Array.from(this.onlineUserIds) });
    return { ok: true };
  }

  // =========================
  // Chat rooms
  // =========================
  @SubscribeMessage('chat:join')
  async handleJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.userId!;
    const conversationId = body?.conversationId;
    if (!conversationId) return;

    await this.chatService.ensureConversationMember(userId, conversationId);
    client.join(`chat:${conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('chat:leave')
  async handleLeave(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const conversationId = body?.conversationId;
    if (!conversationId) return;
    client.leave(`chat:${conversationId}`);
    return { ok: true };
  }

  // =========================
  // Typing
  // =========================
  @SubscribeMessage('chat:typing')
  async handleTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string; isTyping: boolean },
  ) {
    const userId = client.userId!;
    const conversationId = body?.conversationId;
    if (!conversationId) return;

    // broadcast to room
    this.server.to(`chat:${conversationId}`).emit('chat:typing', {
      conversationId,
      userId,
      isTyping: !!body?.isTyping,
    });

    return { ok: true };
  }

  // =========================
  // Read
  // =========================
  @SubscribeMessage('chat:read')
  async handleRead(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.userId!;
    const conversationId = body?.conversationId;
    if (!conversationId) return;

    const res = await this.chatService.markRead(userId, conversationId);

    // notify room (only DM meaningfully uses ticks, FE already checks type)
    this.server.to(`chat:${conversationId}`).emit('chat:read', {
      conversationId,
      userId,
      readAt: res.readAt,
      conversationType: res.type,
    });

    return { ok: true };
  }

  // =========================
  // Send message (DM or by conversationId)
  // FE có thể gửi:
  //  - { otherUserId, text, ... }  => DM find/create
  //  - { conversationId, text, ... } => group/dm room send
  // =========================
  @SubscribeMessage('chat:send')
  async handleSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: {
      conversationId?: string;
      otherUserId?: string;
      text?: string;
      type?: 'TEXT' | 'IMAGE' | 'FILE';
      attachments?: any[];
    },
  ) {
    const userId = client.userId!;
    const conversationId = body?.conversationId;
    const otherUserId = body?.otherUserId;

    let result:
      | { conversationId: string; receiverIds: string[]; message: any }
      | null = null;

    if (conversationId) {
      const r = await this.chatService.sendMessageToConversation(userId, conversationId, {
        text: body?.text,
        type: body?.type,
        attachments: body?.attachments,
      });
      result = { conversationId: r.conversation.id, receiverIds: r.receiverIds, message: r.message };
    } else if (otherUserId) {
      const r = await this.chatService.sendMessage(userId, otherUserId, {
        text: body?.text,
        type: body?.type,
        attachments: body?.attachments,
      });
      result = { conversationId: r.conversation.id, receiverIds: r.receiverIds, message: r.message };
    } else {
      return;
    }

    const payload = {
      conversationId: result.conversationId,
      message: result.message,
    };

    // broadcast to chat room
    this.server.to(`chat:${result.conversationId}`).emit('chat:new', payload);

    // also push to personal rooms (for users not currently joined)
    for (const rid of result.receiverIds || []) {
      this.server.to(`user:${rid}`).emit('chat:new', payload);
    }

    return { ok: true };
  }

  // =========================
  // Server emits for controller/service
  // =========================
  public emitChatMessageUpdate(conversationId: string, payload: any) {
    this.server.to(`chat:${conversationId}`).emit('chat:update', payload);
    this.server.to(`chat:${conversationId}`).emit('chat:new', payload); // optional fallback
  }

  public emitMessageHidden(userId: string, payload: any) {
    this.server.to(`user:${userId}`).emit('chat:update', { type: 'HIDDEN', ...payload });
  }

  public emitConversationRemovedForUser(userId: string, conversationId: string) {
    this.server.to(`user:${userId}`).emit('chat:update', {
      type: 'CONVERSATION_REMOVED',
      conversationId,
    });

    // FE-friendly event (no need to parse chat:update)
    this.server.to(`user:${userId}`).emit('chat:conversation_removed', {
      conversationId,
    });
  }

  public emitConversationDeleted(conversationId: string) {
    this.server.to(`chat:${conversationId}`).emit('chat:update', {
      type: 'CONVERSATION_DELETED',
      conversationId,
    });

    this.server.to(`chat:${conversationId}`).emit('chat:conversation_deleted', {
      conversationId,
    });
  }

  // ===== Members / Conversation realtime sync =====
  // Emit to room + to each member's personal room so that users who are not in the room still update sidebar.
  public async emitMembersUpdated(conversationId: string, payload: any = {}) {
    const base = { conversationId, ...payload };
    this.server.to(`chat:${conversationId}`).emit('chat:members_updated', base);

    try {
      const memberIds = await this.chatService.getConversationMemberIds(conversationId);
      for (const uid of memberIds) {
        this.server.to(`user:${uid}`).emit('chat:members_updated', base);
      }
    } catch (e: any) {
      this.logger.warn(`emitMembersUpdated failed: ${e?.message || e}`);
    }
  }

  public async emitConversationUpdatedForConversation(conversationId: string) {
    try {
      const memberIds = await this.chatService.getConversationMemberIds(conversationId);

      // Each member has per-user fields (unread), so compute per user.
      for (const uid of memberIds) {
        try {
          const item = await this.chatService.getConversationSummaryForUser(uid, conversationId);
          this.server.to(`user:${uid}`).emit('chat:conversation_updated', { item });
        } catch {}
      }

      // Also notify the room (selected chat view)
      this.server.to(`chat:${conversationId}`).emit('chat:conversation_updated', {
        item: { id: conversationId },
      });
    } catch (e: any) {
      this.logger.warn(`emitConversationUpdatedForConversation failed: ${e?.message || e}`);
    }
  }

  // FIX: để controller khỏi lỗi
  public emitConversationAdded(userId: string, item: any) {
    this.server.to(`user:${userId}`).emit('chat:conversation_added', { item });
  }

  // FIX: controller gọi emitConversationAddedForUsers
  public emitConversationAddedForUsers(userIds: string[], item: any) {
    for (const uid of userIds || []) this.emitConversationAdded(uid, item);
  }

  public emitConversationUpdated(userId: string, item: any) {
    this.server.to(`user:${userId}`).emit('chat:conversation_updated', { item });
  }

  public emitConversationUpdatedForUsers(userIds: string[], item: any) {
    for (const uid of userIds || []) this.emitConversationUpdated(uid, item);
  }
}
