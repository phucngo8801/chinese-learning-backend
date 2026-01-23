import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatConversationType, ChatMemberRole, Prisma } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';

type SendPayload = {
  text?: string;
  type?: 'TEXT' | 'IMAGE' | 'FILE';
  attachments?: any[];
  /**
   * FE-generated UUID used as ChatMessage.id for idempotent send.
   * If the client retries the same message, backend will return the existing record.
   */
  clientMessageId?: string;
};

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async removeChatAttachmentFiles(attachments: any) {
    const items = Array.isArray(attachments)
      ? attachments
      : attachments
        ? [attachments]
        : [];

    await Promise.allSettled(
      items.map(async (a: any) => {
        const url = a?.url;
        if (!url || typeof url !== 'string') return;
        const m = url.match(/\/uploads\/chat\/([^?#]+)/);
        if (!m) return;
        const filename = m[1];
        const fullPath = path.join(process.cwd(), 'uploads', 'chat', filename);
        try {
          await fs.unlink(fullPath);
        } catch {
          // ignore missing files
        }
      }),
    );
  }

  /**
   * Fast helper for gateway emits.
   */
  async getConversationMemberIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.chatConversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  // ===== small helpers =====
  private normText(t?: string) {
    return (t ?? '').toString().trim();
  }

  private isUniqueViolation(e: any): boolean {
    return !!e && typeof e === 'object' && (e as any).code === 'P2002';
  }

  private async getExistingMessageById(id: string) {
    return this.prisma.chatMessage.findUnique({
      where: { id },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        reactions: true,
      },
    });
  }

  private previewText(m: { text: string; type: any; deletedAt: any }) {
    if (m?.deletedAt) return 'Tin nhắn đã được thu hồi';
    const txt = (m?.text ?? '').toString();
    if (txt) return txt;
    if (m?.type === 'IMAGE') return '[Hình ảnh]';
    if (m?.type === 'FILE') return '[Tệp đính kèm]';
    return '';
  }

  private async attachSenderDisplayName(conversationId: string, messages: any[]) {
    if (!messages?.length) return messages;

    const members = await this.prisma.chatConversationMember.findMany({
      where: { conversationId },
      select: {
        userId: true,
        nickname: true,
        user: { select: { name: true } },
      },
    });

    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.userId, m.nickname || m.user?.name || 'User');
    }

    return messages.map((msg) => ({
      ...msg,
      senderDisplayName: map.get(msg.senderId) || msg.sender?.name || 'User',
    }));
  }

  // ===== permission =====
  async ensureConversationMember(userId: string, conversationId: string) {
    const mem = await this.prisma.chatConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: {
        conversation: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!mem) throw new ForbiddenException('Bạn không thuộc cuộc trò chuyện này');
    return mem;
  }

  private async ensureOwnerOrAdmin(userId: string, conversationId: string) {
    const mem = await this.prisma.chatConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true, conversation: { select: { type: true } } },
    });
    if (!mem) throw new ForbiddenException('Bạn không thuộc cuộc trò chuyện này');

    if (mem.conversation.type !== ChatConversationType.GROUP) {
      throw new BadRequestException('Chỉ áp dụng cho nhóm');
    }

    const allowed = ([ChatMemberRole.OWNER, ChatMemberRole.ADMIN] as ChatMemberRole[]).includes(mem.role);
    if (!allowed) throw new ForbiddenException('Bạn không có quyền');
    return mem;
  }

  // ===== list conversations =====
  async listConversations(userId: string) {
    const mems = await this.prisma.chatConversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { text: true, type: true, deletedAt: true, createdAt: true, senderId: true },
            },
          },
        },
      },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });

    const out: any[] = [];
    for (const mem of mems) {
      const c = mem.conversation;
      const last = c.messages?.[0] ?? null;
      const lastPreview = last ? this.previewText(last) : null;

      if (c.type === ChatConversationType.DM) {
        const other = c.members.find((m) => m.userId !== userId);
        if (!other?.user) continue;

        const unread = await this.prisma.chatMessage.count({
          where: {
            conversationId: c.id,
            receiverId: userId,
            OR: [{ readAt: null }, { isRead: false }],
          },
        });

        out.push({
          id: c.id,
          type: c.type,
          otherUser: other.user,
          title: null,
          membersCount: 2,
          lastMessage: last
            ? { content: lastPreview, text: lastPreview, createdAt: last.createdAt, senderId: last.senderId }
            : null,
          unread,
        });
        continue;
      }

      // GROUP
      const since = mem.lastReadAt || mem.joinedAt;
      const unread = await this.prisma.chatMessage.count({
        where: {
          conversationId: c.id,
          receiverId: null,
          createdAt: { gt: since },
          senderId: { not: userId },
          deletedAt: null,
        },
      });

      out.push({
        id: c.id,
        type: c.type,
        title: c.title,
        membersCount: c.members.length,
        lastMessage: last
          ? { content: lastPreview, text: lastPreview, createdAt: last.createdAt, senderId: last.senderId }
          : null,
        unread,
      });
    }

    out.sort((a, b) => {
      const ta = a?.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b?.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });

    return out;
  }

  async getConversationMembers(conversationId: string) {
    return this.prisma.chatConversationMember.findMany({
      where: { conversationId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // ✅ FIX: controller đang gọi hàm này
  async getConversationSummaryForUser(userId: string, conversationId: string) {
    const mem = await this.ensureConversationMember(userId, conversationId);

    const c = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: {
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { text: true, type: true, deletedAt: true, createdAt: true, senderId: true },
        },
      },
    });
    if (!c) throw new NotFoundException('Conversation không tồn tại');

    const last = c.messages?.[0] ?? null;
    const preview = last ? this.previewText(last) : null;

    if (c.type === ChatConversationType.DM) {
      const other = c.members.find((m) => m.userId !== userId);
      const otherUser = other?.user;
      if (!otherUser) throw new NotFoundException('Không tìm thấy user');

      const unread = await this.prisma.chatMessage.count({
        where: {
          conversationId,
          receiverId: userId,
          OR: [{ readAt: null }, { isRead: false }],
        },
      });

      return {
        id: c.id,
        type: c.type,
        otherUser,
        title: null,
        membersCount: 2,
        lastMessage: last
          ? { content: preview, text: preview, createdAt: last.createdAt, senderId: last.senderId }
          : null,
        unread,
      };
    }

    const since = mem.lastReadAt || mem.joinedAt;
    const unread = await this.prisma.chatMessage.count({
      where: {
        conversationId,
        receiverId: null,
        createdAt: { gt: since },
        senderId: { not: userId },
        deletedAt: null,
      },
    });

    return {
      id: c.id,
      type: c.type,
      title: c.title,
      membersCount: c.members.length,
      lastMessage: last
        ? { content: preview, text: preview, createdAt: last.createdAt, senderId: last.senderId }
        : null,
      unread,
    };
  }

  // ===== DM create/get =====
  async findOrCreateDM(meId: string, otherUserId: string) {
    if (!otherUserId || otherUserId === meId) throw new BadRequestException('Invalid user');

    // Ensure stable ordering for @@unique([userAId, userBId])
    const [userAId, userBId] = meId < otherUserId ? [meId, otherUserId] : [otherUserId, meId];

    const other = await this.prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true },
    });
    if (!other) throw new NotFoundException('User không tồn tại');

    // Fast path: DM already keyed by (userAId, userBId)
    const keyed = await this.prisma.chatConversation.findFirst({
      where: { type: ChatConversationType.DM, userAId, userBId },
      include: { members: true },
    });
    if (keyed) return keyed;

    // Legacy path: DM created before userAId/userBId were used
    const legacy = await this.prisma.chatConversation.findFirst({
      where: {
        type: ChatConversationType.DM,
        AND: [
          { members: { some: { userId: meId } } },
          { members: { some: { userId: otherUserId } } },
        ],
      },
      include: { members: true },
    });

    if (legacy && legacy.members.length === 2) {
      // Backfill unique key if missing to prevent duplicates going forward
      if (!legacy.userAId || !legacy.userBId) {
        try {
          return await this.prisma.chatConversation.update({
            where: { id: legacy.id },
            data: { userAId, userBId },
            include: { members: true },
          });
        } catch (e: any) {
          // Another request may have created/updated concurrently
          if (e?.code === 'P2002') {
            const existing2 = await this.prisma.chatConversation.findFirst({
              where: { type: ChatConversationType.DM, userAId, userBId },
              include: { members: true },
            });
            if (existing2) return existing2;
          }
          throw e;
        }
      }
      return legacy;
    }

    // Create new keyed DM; handle race via unique constraint
    try {
      return await this.prisma.chatConversation.create({
        data: {
          type: ChatConversationType.DM,
          userAId,
          userBId,
          createdById: meId,
          members: {
            createMany: {
              data: [
                { userId: meId, role: ChatMemberRole.MEMBER },
                { userId: otherUserId, role: ChatMemberRole.MEMBER },
              ],
            },
          },
        },
        include: { members: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing2 = await this.prisma.chatConversation.findFirst({
          where: { type: ChatConversationType.DM, userAId, userBId },
          include: { members: true },
        });
        if (existing2) return existing2;
      }
      throw e;
    }
  }

  // endpoint /chat/with/:otherUserId (FE tạo chat)
  async createOrGetConversationItem(meId: string, otherUserId: string) {
    const conv = await this.findOrCreateDM(meId, otherUserId);
    return this.getConversationSummaryForUser(meId, conv.id);
  }

  // ===== GROUP create =====
  async createGroup(meId: string, title: string, memberIds: string[]) {
    const t = this.normText(title);
    if (!t) throw new BadRequestException('Tên nhóm không được để trống');

    const uniq = Array.from(new Set([meId, ...(memberIds || [])])).filter(Boolean);

    // ✅ nhóm: ít nhất 3 người (me + 2)
    if (uniq.length < 3) throw new BadRequestException('Nhóm phải có ít nhất 3 người');

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true },
    });
    if (users.length !== uniq.length) throw new BadRequestException('Có userId không tồn tại');

    return this.prisma.chatConversation.create({
      data: {
        type: ChatConversationType.GROUP,
        title: t,
        createdById: meId,
        members: {
          createMany: {
            data: uniq.map((id) => ({
              userId: id,
              role: id === meId ? ChatMemberRole.OWNER : ChatMemberRole.MEMBER,
            })),
          },
        },
      },
    });
  }

  // ===== Messages load =====
  async getMessages(
    userId: string,
    conversationId: string,
    opts: { limit: number; before?: string },
  ) {
    await this.ensureConversationMember(userId, conversationId);

    const hiddenIds = await this.prisma.chatMessageHidden.findMany({
      where: { userId, message: { conversationId } },
      select: { messageId: true },
    });
    const hiddenSet = new Set(hiddenIds.map((x) => x.messageId));

    const newestFirst = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        id: { notIn: Array.from(hiddenSet) },
        ...(opts.before ? { createdAt: { lt: new Date(opts.before) } } : {}),
      },
      take: opts.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        reactions: true,
      },
    });

    const list = newestFirst.reverse();
    return this.attachSenderDisplayName(conversationId, list);
  }

  // ===== Send message (DM via otherUserId) =====
  async sendMessage(senderId: string, otherUserId: string, payload: SendPayload) {
    const conv = await this.findOrCreateDM(senderId, otherUserId);

    const receiverId = otherUserId;

    const text = this.normText(payload?.text);
    const hasAttachments = Array.isArray(payload?.attachments) && payload.attachments.length > 0;
    if (!text && !hasAttachments) throw new BadRequestException('Tin nhắn rỗng');

    const clientMessageId = payload?.clientMessageId?.toString().trim();
    let msgRaw: any;

    try {
      msgRaw = await this.prisma.chatMessage.create({
        data: {
          id: clientMessageId || undefined,
          conversationId: conv.id,
          senderId,
          receiverId,
          text,
          type: (payload?.type || 'TEXT') as any,
          attachments: payload?.attachments ?? undefined,
        },
        include: {
          sender: { select: { id: true, name: true, email: true } },
          reactions: true,
        },
      });
    } catch (e: any) {
      if (clientMessageId && this.isUniqueViolation(e)) {
        const existing = await this.getExistingMessageById(clientMessageId);
        if (!existing) throw e;
        if (existing.senderId !== senderId) throw new ForbiddenException('Không hợp lệ');
        msgRaw = existing;
      } else {
        throw e;
      }
    }


    const [msg] = await this.attachSenderDisplayName(conv.id, [msgRaw]);

    await this.prisma.chatConversation.update({
      where: { id: conv.id },
      data: { lastMessageAt: msgRaw.createdAt },
    });

    return { conversation: conv, receiverIds: [receiverId], message: msg };
  }

  // ===== Send message to conversation (GROUP or DM by conversationId) =====
  async sendMessageToConversation(senderId: string, conversationId: string, payload: SendPayload) {
    const mem = await this.ensureConversationMember(senderId, conversationId);
    const conv = mem.conversation;

    const text = this.normText(payload?.text);
    const hasAttachments = Array.isArray(payload?.attachments) && payload.attachments.length > 0;
    if (!text && !hasAttachments) throw new BadRequestException('Tin nhắn rỗng');

    let receiverId: string | null = null;
    let receiverIds: string[] = [];

    if (conv.type === ChatConversationType.DM) {
      const members = await this.prisma.chatConversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      const other = members.find((x) => x.userId !== senderId);
      if (!other) throw new BadRequestException('DM không hợp lệ');

      receiverId = other.userId;
      receiverIds = [receiverId];
    } else {
      const members = await this.prisma.chatConversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      receiverIds = members.map((m) => m.userId).filter((id) => id !== senderId);
      receiverId = null;
    }

    const clientMessageId = payload?.clientMessageId?.toString().trim();
    let msgRaw: any;

    try {
      msgRaw = await this.prisma.chatMessage.create({
        data: {
          id: clientMessageId || undefined,
          conversationId,
          senderId,
          receiverId: receiverId ?? undefined,
          text,
          type: (payload?.type || 'TEXT') as any,
          attachments: payload?.attachments ?? undefined,
        },
        include: {
          sender: { select: { id: true, name: true, email: true } },
          reactions: true,
        },
      });
    } catch (e: any) {
      if (clientMessageId && this.isUniqueViolation(e)) {
        const existing = await this.getExistingMessageById(clientMessageId);
        if (!existing) throw e;
        if (existing.senderId !== senderId) throw new ForbiddenException('Không hợp lệ');
        msgRaw = existing;
      } else {
        throw e;
      }
    }


    const [msg] = await this.attachSenderDisplayName(conversationId, [msgRaw]);

    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: msgRaw.createdAt },
    });

    return { conversation: conv, receiverIds, message: msg };
  }

  // ===== Mark read =====
  async markRead(userId: string, conversationId: string) {
    const mem = await this.ensureConversationMember(userId, conversationId);
    const conv = mem.conversation;

    const now = new Date();

    if (conv.type === ChatConversationType.DM) {
      await this.prisma.chatMessage.updateMany({
        where: {
          conversationId,
          receiverId: userId,
          OR: [{ readAt: null }, { isRead: false }],
        },
        data: { isRead: true, readAt: now },
      });

      return { ok: true, updated: 1, readAt: now.toISOString(), otherUserId: null, type: conv.type };
    }

    await this.prisma.chatConversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now },
    });

    return { ok: true, updated: 1, readAt: now.toISOString(), otherUserId: null, type: conv.type };
  }

  // ===== Update conversation (rename group) =====
  async updateConversation(userId: string, conversationId: string, body: { title?: string }) {
    await this.ensureOwnerOrAdmin(userId, conversationId);

    const title = this.normText(body?.title);
    if (!title) throw new BadRequestException('Tên nhóm không được để trống');

    return this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { title },
      select: { id: true, type: true, title: true },
    });
  }

  // ===== Set nickname (current user) =====
  async setNickname(userId: string, conversationId: string, nickname: string | null) {
    await this.ensureConversationMember(userId, conversationId);

    const nn = nickname === null ? null : this.normText(nickname) || null;

    await this.prisma.chatConversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { nickname: nn },
    });

    return { ok: true, nickname: nn };
  }

  // ===== Set nickname for a target member (Messenger-like) =====
  // Any conversation member can set nickname for any member inside the same conversation.
  async setNicknameForMember(
    actorId: string,
    conversationId: string,
    targetUserId: string,
    nickname: string | null,
  ) {
    await this.ensureConversationMember(actorId, conversationId);
    await this.ensureConversationMember(targetUserId, conversationId);

    const nn = nickname === null ? null : this.normText(nickname) || null;

    await this.prisma.chatConversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
      data: { nickname: nn },
    });

    return { ok: true, userId: targetUserId, nickname: nn };
  }

  // ===== Add members to group =====
  async addMembers(meId: string, conversationId: string, userIds: string[]) {
    await this.ensureOwnerOrAdmin(meId, conversationId);

    const uniq = Array.from(new Set((userIds || []).filter(Boolean)));
    if (!uniq.length) throw new BadRequestException('Không có userIds');

    const existing = await this.prisma.chatConversationMember.findMany({
      where: { conversationId, userId: { in: uniq } },
      select: { userId: true },
    });
    const existSet = new Set(existing.map((x) => x.userId));
    const toAdd = uniq.filter((id) => !existSet.has(id));

    if (!toAdd.length) {
      return { conversationId, addedUserIds: [], addedUsers: [], membersCount: existing.length };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: toAdd } },
      select: { id: true, email: true, name: true },
    });

    await this.prisma.chatConversationMember.createMany({
      data: toAdd.map((id) => ({
        conversationId,
        userId: id,
        role: ChatMemberRole.MEMBER,
      })),
      skipDuplicates: true,
    });

    return {
      conversationId,
      addedUserIds: toAdd,
      addedUsers: users,
      membersCount: existing.length + toAdd.length,
    };
  }

  // ===== Leave group / conversation =====
  async leaveConversation(userId: string, conversationId: string) {
    const mem = await this.ensureConversationMember(userId, conversationId);
    const conv = mem.conversation;

    if (conv.type === ChatConversationType.DM) {
      await this.prisma.chatConversationMember.delete({
        where: { conversationId_userId: { conversationId, userId } },
      });

      const remaining = await this.prisma.chatConversationMember.count({ where: { conversationId } });
      if (remaining === 0) {
        await this.prisma.chatConversation.delete({ where: { id: conversationId } });
      }
      return { ok: true, remaining };
    }

    if (mem.role === ChatMemberRole.OWNER) {
      const count = await this.prisma.chatConversationMember.count({ where: { conversationId } });
      if (count > 1) {
        throw new ForbiddenException('Chủ nhóm không thể rời khi còn thành viên. Hãy chuyển quyền trước.');
      }
      await this.prisma.chatConversation.delete({ where: { id: conversationId } });
      return { ok: true, remaining: 0 };
    }

    await this.prisma.chatConversationMember.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });

    const remaining = await this.prisma.chatConversationMember.count({ where: { conversationId } });
    if (remaining === 0) {
      await this.prisma.chatConversation.delete({ where: { id: conversationId } });
    }

    return { ok: true, remaining };
  }

  async leaveGroup(meId: string, conversationId: string) {
    const res = await this.leaveConversation(meId, conversationId);
    return { ...res, deleted: res.remaining === 0 };
  }

  // ===== Edit message =====
  async editMessage(userId: string, messageId: string, text: string) {
    const t = this.normText(text);
    if (!t) throw new BadRequestException('Nội dung rỗng');

    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, deletedAt: true },
    });
    if (!msg) throw new NotFoundException('Tin nhắn không tồn tại');
    if (msg.deletedAt) throw new BadRequestException('Tin nhắn đã bị thu hồi');
    if (msg.senderId !== userId) throw new ForbiddenException('Không có quyền sửa');

    const updatedRaw = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { text: t, editedAt: new Date() },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        reactions: true,
      },
    });

    const [updated] = await this.attachSenderDisplayName(msg.conversationId, [updatedRaw]);

    return { conversationId: msg.conversationId, message: updated };
  }

  // ===== Revoke message (delete for everyone) =====
  async revokeMessage(userId: string, messageId: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, attachments: true },
    });
    if (!msg) throw new NotFoundException('Tin nhắn không tồn tại');
    if (msg.senderId !== userId) throw new ForbiddenException('Không có quyền thu hồi');

    // Free disk space early for revoked messages that contain attachments
    await this.removeChatAttachmentFiles((msg as any).attachments);

    const updatedRaw = await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { text: '', deletedAt: new Date(), attachments: Prisma.DbNull },
      include: {
        sender: { select: { id: true, name: true, email: true } },
        reactions: true,
      },
    });

    const [updated] = await this.attachSenderDisplayName(msg.conversationId, [updatedRaw]);

    return { conversationId: msg.conversationId, message: updated };
  }

  // ===== Hide message (delete for me) =====
  async hideMessage(userId: string, messageId: string) {
    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
    if (!msg) throw new NotFoundException('Tin nhắn không tồn tại');

    await this.ensureConversationMember(userId, msg.conversationId);

    await this.prisma.chatMessageHidden.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, messageId },
      update: {},
    });

    return { messageId, conversationId: msg.conversationId };
  }

  // ===== Reaction toggle =====
  async toggleReaction(userId: string, messageId: string, emoji: string) {
    const e = this.normText(emoji);
    if (!e) throw new BadRequestException('Emoji không hợp lệ');

    const msg = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
    if (!msg) throw new NotFoundException('Tin nhắn không tồn tại');

    await this.ensureConversationMember(userId, msg.conversationId);

    const existing = await this.prisma.chatMessageReaction.findFirst({
      where: { messageId, userId, emoji: e },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.chatMessageReaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.chatMessageReaction.create({
        data: { messageId, userId, emoji: e },
      });
    }

    const reactions = await this.prisma.chatMessageReaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });

    return { conversationId: msg.conversationId, reactions };
  }
}
