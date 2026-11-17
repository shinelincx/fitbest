import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentUser } from '../common/decorators'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { ZodPipe } from '../common/zod.pipe'
import { DeviceSyncService } from './device-sync.service'

const metricsSchema = z.record(z.any())

const segmentSchema = z.object({
  seq: z.number().int().min(0).max(1000),
  type: z.enum(['start', 'finish', 'station', 'treadmill']),
  machineSerial: z.string().trim().max(80).optional(),
  machineType: z.string().trim().max(30).optional(),
  connectTick: z.number().int().min(0).max(864000).optional(),
  disconnectTick: z.number().int().min(0).max(864000).optional(),
  durationSec: z.number().int().min(0).max(86400).default(0),
  distanceM: z.number().int().min(0).max(200000).default(0),
  metrics: metricsSchema.optional(),
})

const syncSchema = z.object({
  clientSessionId: z.string().trim().min(1).max(80),
  device: z.object({
    serialNo: z.string().trim().min(1).max(80),
    kind: z.enum(['band', 'machine']).default('band'),
    label: z.string().trim().max(80).optional(),
  }),
  app: z.enum(['hyrox', 'btwe']).default('hyrox'),
  mode: z.enum(['training', 'race']).default('training'),
  startedAt: z.string().max(40),
  endedAt: z.string().max(40).optional(),
  durationSec: z.number().int().min(0).max(86400),
  distanceM: z.number().int().min(0).max(200000).default(0),
  avgHr: z.number().int().min(30).max(250).optional(),
  maxHr: z.number().int().min(30).max(250).optional(),
  metrics: metricsSchema.optional(),
  closeReason: z.string().trim().max(40).optional(),
  quality: z.enum(['ok', 'partial', 'invalid']).default('ok'),
  segments: z.array(segmentSchema).max(64).default([]),
})

@Controller('api/v1/me/device-sessions')
@UseGuards(JwtAuthGuard)
export class DeviceSyncController {
  constructor(private readonly deviceSync: DeviceSyncService) {}

  @Post()
  sync(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(syncSchema)) body: z.infer<typeof syncSchema>,
  ) {
    return this.deviceSync.sync(userId, body)
  }

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.deviceSync.list(userId, mode, Number(limit) || 20)
  }
}
