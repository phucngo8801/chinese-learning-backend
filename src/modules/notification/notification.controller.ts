import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/auth/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller('notification')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // GET /notification?filter=all|unread|read&page=1&limit=20
  @Get()
  async list(
    @Req() req: any,
    @Query('filter') filter?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.id as string;

    return this.notificationService.list(userId, {
      filter: (filter ?? 'all') as any,
      page: Math.max(parseInt(page ?? '1', 10) || 1, 1),
      limit: Math.min(Math.max(parseInt(limit ?? '20', 10) || 20, 10), 50),
    });
  }

  // GET /notification/unread-count
  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const userId = req.user.id as string;
    return this.notificationService.unreadCount(userId);
  }

  // POST /notification/:id/read
  @Post(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id as string;
    return this.notificationService.markRead(userId, id);
  }

  // POST /notification/read-all
  @Post('read-all')
  async readAll(@Req() req: any) {
    const userId = req.user.id as string;
    return this.notificationService.markAllRead(userId);
  }

  // DELETE /notification/:id
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id as string;
    return this.notificationService.remove(userId, id);
  }

  // DELETE /notification/clear?mode=read|all
  @Delete('clear')
  async clear(@Req() req: any, @Query('mode') mode?: string) {
    const userId = req.user.id as string;
    return this.notificationService.clear(userId, (mode ?? 'read') as any);
  }
}
