import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BadgeService } from './badge.service';

@Controller('badge')
export class BadgeController {
  constructor(private readonly badgeService: BadgeService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myBadges(@Req() req: any) {
    return this.badgeService.getMyBadges(req.user.sub);
  }
}
