import { Controller, Delete, Get, Headers, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../common/decorators'
import { verifyAccess } from '../common/jwt'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { EventsService } from './events.service'

function optionalUserId(header: string | undefined): string | undefined {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return undefined
  try {
    return verifyAccess(token).sub
  } catch {
    return undefined
  }
}

@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Headers('authorization') authorization?: string) {
    return this.events.listPublished(optionalUserId(authorization))
  }

  @Post(':id/registration')
  @UseGuards(JwtAuthGuard)
  register(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.events.register(userId, id)
  }

  @Delete(':id/registration')
  @UseGuards(JwtAuthGuard)
  unregister(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.events.unregister(userId, id)
  }
}

@Controller('api/v1/me/registrations')
@UseGuards(JwtAuthGuard)
export class MyRegistrationsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.events.myRegistrations(userId)
  }
}
