import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body()
    dto: {
      // FE mới dùng `username`; vẫn giữ `email` để tương thích client cũ
      username?: string;
      email?: string;
      password: string;
      name: string;
    },
  ) {
    const identifier = dto.username ?? dto.email;
    if (!identifier) throw new BadRequestException('Username is required');

    return this.authService.register(identifier, dto.password, dto.name);
  }

  @Post('login')
  login(
    @Body()
    dto: {
      // FE mới dùng `username`; vẫn giữ `email` để tương thích client cũ
      username?: string;
      email?: string;
      password: string;
    },
  ) {
    const identifier = dto.username ?? dto.email;
    if (!identifier) throw new BadRequestException('Username is required');

    return this.authService.login(identifier, dto.password);
  }
}
