import { Controller, Get, Param, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAll() {
    return this.usersService.getAll();
  }

  // ✅ FE đang gọi /users/all
  @Get('all')
  getAllUsers() {
    return this.usersService.getAllUsers();
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
