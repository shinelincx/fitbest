import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../common/decorators'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { NotificationsService } from './notifications.service'

@Controller('api/v1/me/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query('limit') limit?: string) {
    return this.notifications.list(userId, Number(limit) || 20)
  }

  @Post(':id/read')
  markRead(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id)
  }
}
