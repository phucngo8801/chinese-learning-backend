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
}
