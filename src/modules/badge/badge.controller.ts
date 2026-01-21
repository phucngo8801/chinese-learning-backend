import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { BadgeService } from './badge.service';

@Controller('badge')
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myBadges(@Req() req: any) {
    // JwtStrategy chuẩn hoá: req.user.id
    return this.badgeService.getMyBadges(req.user.id);
  }
}
