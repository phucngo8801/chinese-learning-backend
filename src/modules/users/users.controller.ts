import { Controller, Get, Param, Patch, Body, Req, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // NOTE: Kept for backward-compatibility; must be authenticated.
  // IMPORTANT: Never return password or other sensitive fields.
  @UseGuards(JwtAuthGuard)
  @Get()
  getAll() {
    return this.usersService.getAll();
  }

  // ✅ FE đang gọi /users/all
  @UseGuards(JwtAuthGuard)
  @Get('all')
  getAllUsers() {
    return this.usersService.getAllUsers();
  }

  // ✅ Search + pagination (preferred over /users/all)
  // GET /users/search?q=&limit=&cursor=
  @UseGuards(JwtAuthGuard)
  @Get('search')
  search(
    @Req() req: any,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const take = Math.max(1, Math.min(50, Number(limit) || 20));
    return this.usersService.searchUsersPaginated({ meId: req.user.id, q: q ?? '', limit: take, cursor });
  }

  @Get(':id')
  getById(@Param('id') userId: string) {
    return this.usersService.getByIdSafe(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Req() req: any, @Body() body: { name?: string }) {
    return this.usersService.updateProfile(req.user.id, { name: body?.name });
  }
}
