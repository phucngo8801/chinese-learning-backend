import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { FriendsService } from './friends.service';

@Controller('friends')
export class FriendsController {
  constructor(private friendsService: FriendsService) {}

  // 1) GỬI LỜI MỜI
  @UseGuards(JwtAuthGuard)
  @Post('request')
  sendRequest(@Req() req: any, @Body('receiverId') receiverId: string) {
    return this.friendsService.sendRequest(req.user.id, receiverId);
  }

  // 2) LỜI MỜI ĐẾN
  @UseGuards(JwtAuthGuard)
  @Get('requests/incoming')
  incoming(@Req() req: any) {
    return this.friendsService.getIncoming(req.user.id);
  }

  // 3) LỜI MỜI ĐÃ GỬI
  @UseGuards(JwtAuthGuard)
  @Get('requests/sent')
  sent(@Req() req: any) {
    return this.friendsService.getSent(req.user.id);
  }

  // 4) ACCEPT
  @UseGuards(JwtAuthGuard)
  @Post('accept')
  accept(@Req() req: any, @Body('senderId') senderId: string) {
    return this.friendsService.acceptRequest(senderId, req.user.id);
  }

  // 5) REJECT
  @UseGuards(JwtAuthGuard)
  @Post('reject')
  reject(@Req() req: any, @Body('senderId') senderId: string) {
    return this.friendsService.rejectRequest(senderId, req.user.id);
  }

  // 6) FRIEND LIST (SAFE)
  @UseGuards(JwtAuthGuard)
  @Get('list')
  getFriends(@Req() req: any) {
    return this.friendsService.getFriends(req.user.id);
  }

  /**
   * 7) FRIEND STATUS (MVP)
   * GET /friends/status
   * Trả về: user + minutesToday + đúng/sai vocab/câu + isStudyingNow(10 phút)
   */
  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Req() req: any) {
    return this.friendsService.getFriendsStatus(req.user.id);
  }
}
