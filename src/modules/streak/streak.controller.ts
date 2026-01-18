import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { StreakService } from './streak.service';

@Controller('streak')
export class StreakController {
  constructor(private streakService: StreakService) {}

  @UseGuards(JwtAuthGuard)
  @Post('study')
  study(@Req() req, @Body('minutes') minutes: number) {
    return this.streakService.study(req.user.id, minutes);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyStreak(@Req() req) {
    return this.streakService.getMyStreak(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('recovery')
  getRecovery(@Req() req) {
    return this.streakService.getRecoveryStatus(req.user.id);
  }
  @UseGuards(JwtAuthGuard)
@Get('friends')
compareWithFriends(@Req() req) {
  return this.streakService.compareWithFriends(req.user.id);
}
}
