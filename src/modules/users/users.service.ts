import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CursorPayload = { createdAt: string; id: string };

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeCursor(cursor?: string): CursorPayload | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const data = JSON.parse(raw);
    if (!data?.createdAt || !data?.id) return null;
    return { createdAt: String(data.createdAt), id: String(data.id) };
  } catch {
    return null;
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ========================
  // FIND BY EMAIL
  // ========================
  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // ========================
  // CREATE USER (SAFE)
  // ========================
  create(data: { email: string; password: string; name: string }) {
    const { email, password, name } = data;

    if (!name || name.trim() === '') {
      throw new BadRequestException('Name is required');
    }

    return this.prisma.user.create({
      data: { email, password, name },
    });
  }

  // ========================
  // GET ALL (PUBLIC SAFE)
  // ========================
  getAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });
  }

  // ✅ dùng cho /users/all (debug/internal)
  getAllUsers() {
    // IMPORTANT: never return password or any sensitive fields
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ✅ search user để chat (gõ tên/email ra)
  async searchUsers(meId: string, q: string) {
    // backward-compatible helper (returns first page items)
    const res = await this.searchUsersPaginated({ meId, q, limit: 20 });
    return res.items;
  }

  /**
   * Paginated search for users (preferred API for "Find friends").
   * Keyset pagination using (createdAt desc, id desc).
   */
  async searchUsersPaginated(params: { meId: string; q?: string; limit?: number; cursor?: string }) {
    const meId = params.meId;
    const q = (params.q ?? '').trim();
    const limit = Math.max(1, Math.min(50, params.limit ?? 20));
    const decoded = decodeCursor(params.cursor);

    const and: any[] = [{ id: { not: meId } }];

    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (decoded) {
      const cursorCreatedAt = new Date(decoded.createdAt);
      and.push({
        OR: [
          { createdAt: { lt: cursorCreatedAt } },
          { AND: [{ createdAt: cursorCreatedAt }, { id: { lt: decoded.id } }] },
        ],
      });
    }

    const rows = await this.prisma.user.findMany({
      where: { AND: and },
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, name: true, email: true, createdAt: true },
    });

    const items = rows.slice(0, limit);
    const next = rows.length > limit ? rows[limit - 1] : null;

    return {
      items,
      nextCursor: next ? encodeCursor({ createdAt: next.createdAt.toISOString(), id: next.id }) : null,
    };
  }

  getByIdSafe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });
  }

  updateProfile(userId: string, data: { name?: string }) {
    const name = (data.name ?? '').trim();
    if (!name) throw new BadRequestException('Name is required');

    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, email: true, name: true },
    });
  }
}
