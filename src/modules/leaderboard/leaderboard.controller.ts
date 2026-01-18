import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  // 🌍 Public
  @Get('week')
  async week(@Query('limit') limit?: string) {
    return this.leaderboardService.week(undefined, Number(limit) || 20);
  }

  @Get('month')
  async month(@Query('limit') limit?: string) {
    return this.leaderboardService.month(undefined, Number(limit) || 20);
  }

  // 👤 Có isMe
  @Get('week/me')
  @UseGuards(JwtAuthGuard)
  async weekMe(@Req() req: any, @Query('limit') limit?: string) {
    return this.leaderboardService.week(req.user.id, Number(limit) || 20);
  }

  @Get('month/me')
  @UseGuards(JwtAuthGuard)
  async monthMe(@Req() req: any, @Query('limit') limit?: string) {
    return this.leaderboardService.month(req.user.id, Number(limit) || 20);
  }
}
