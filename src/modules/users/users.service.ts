import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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
    return this.prisma.user.findMany();
  }

  // ✅ search user để chat (gõ tên/email ra)
  async searchUsers(meId: string, q: string) {
    const query = (q ?? '').trim();
    if (!query) return [];

    return this.prisma.user.findMany({
      where: {
        id: { not: meId },
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: 'desc' },
    });
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
