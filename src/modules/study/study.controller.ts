import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { StudyService } from './study.service';

@Controller('study')
@UseGuards(JwtAuthGuard)
export class StudyController {
  constructor(private readonly studyService: StudyService) {}

  @Post('event')
  async log(@Req() req: any, @Body() body: any) {
    return this.studyService.logEvent(req.user.id, body);
  }

  @Get('friends/today')
  async friendsToday(@Req() req: any) {
    return this.studyService.friendsToday(req.user.id);
  }

  @Get('summary/today')
  async summaryToday(@Req() req: any) {
    return this.studyService.summaryToday(req.user.id);
  }

  @Get('summary/week')
  async summaryWeek(@Req() req: any) {
    return this.studyService.summaryWeek(req.user.id, 7);
  }

  /**
   * Daily Gate: bắt buộc đọc đúng 1 cụm/từ mỗi ngày trước khi vào học.
   */
  @Get('daily-gate')
  async dailyGate(@Req() req: any) {
    return this.studyService.getDailyGate(req.user.id);
  }

  @Post('daily-gate/submit')
  async submitDailyGate(@Req() req: any, @Body() body: any) {
    return this.studyService.submitDailyGate(req.user.id, body);
  }
  @Post('daily-gate/reroll')
  async rerollDailyGate(@Req() req: any) {
    return this.studyService.rerollDailyGate(req.user.id);
  }

}
