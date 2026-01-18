import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  // Public feed
  @Get('feed')
  async feed(@Query('limit') limit?: string) {
    return this.activityService.getGlobalFeed(limit ? Number(limit) : 20);
  }

  // My feed
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myFeed(@Req() req: any, @Query('limit') limit?: string) {
    return this.activityService.getMyFeed(req.user.id, limit ? Number(limit) : 20);
  }

  // ✅ Friends: studied today
  @Get('friends/today')
  @UseGuards(JwtAuthGuard)
  async friendsToday(@Req() req: any) {
    return this.activityService.getFriendsToday(req.user.id);
  }

  // ✅ Friends: missed today
  @Get('friends/missed')
  @UseGuards(JwtAuthGuard)
  async friendsMissed(@Req() req: any) {
    return this.activityService.getFriendsMissed(req.user.id);
  }
}
