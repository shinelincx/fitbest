import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Query,
  Post,
  UseGuards,
} from '@nestjs/common'
import { z } from 'zod'
import { CurrentUser } from '../common/decorators'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { ZodPipe } from '../common/zod.pipe'
import { SessionsService } from './sessions.service'

const machineTypeSchema = z.enum(['treadmill', 'rower', 'ski', 'bike', 'sled', 'rep'])

const createSchema = z.object({
  machineId: z.string().uuid('器械 ID 格式不正确').optional(),
  gymId: z.string().uuid('门店 ID 格式不正确').optional(),
  machineType: machineTypeSchema,
  machineModel: z.string().max(100).optional(),
  mode: z.string().max(30).optional(),
  durationSec: z.number().int().min(0).max(86400),
  distanceM: z.number().int().min(0).max(1000000),
  calories: z.number().int().min(0).max(10000),
  avgHr: z.number().int().min(30).max(250).optional(),
  avgSpeed: z.number().min(0).max(100).optional(),
  cadence: z.number().int().min(0).max(500).optional(),
  power: z.number().int().min(0).max(5000).optional(),
  source: z.enum(['ble', 'sim', 'manual']).default('ble'),
  startedAt: z.coerce.date().optional(),
  endedAt: z.coerce.date().optional(),
})

@Controller('api/v1/sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(
    @CurrentUser() userId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.sessions.create(userId, idempotencyKey || undefined, body)
  }

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query('range') range?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedRange = range ?? 'week'
    if (!['week', 'month', 'all'].includes(normalizedRange)) {
      throw new BadRequestException('range 仅支持 week / month / all')
    }
    const size = Math.min(Math.max(Number(limit) || 20, 1), 50)
    return this.sessions.list(userId, normalizedRange as 'week' | 'month' | 'all', cursor, size)
  }
}

@Controller('api/v1/stats')
@UseGuards(JwtAuthGuard)
export class StatsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get('weekly')
  weekly(@CurrentUser() userId: string) {
    return this.sessions.weeklyStats(userId)
  }
}
