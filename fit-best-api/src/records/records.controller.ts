import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentUser } from '../common/decorators'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { ZodPipe } from '../common/zod.pipe'
import { RecordsService } from './records.service'

const createSchema = z.object({
  clientId: z.string().max(80).optional(),
  app: z.enum(['hyrox', 'btwe']),
  planId: z.string().max(80).optional(),
  completed: z.boolean().default(false),
  totalTimeSec: z.number().int().min(0).max(86400),
  distanceM: z.number().int().min(0).max(200000).default(0),
  moduleTimes: z.array(z.number().min(0).max(86400)).max(64).optional(),
  runSplits: z.array(z.number().min(0).max(86400)).max(64).optional(),
  avgHr: z.number().int().min(30).max(250).optional(),
  maxHr: z.number().int().min(30).max(250).optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  weakestStation: z.string().max(80).optional(),
  startedAt: z.string().max(40).optional(),
})

@Controller('api/v1/me/training-records')
@UseGuards(JwtAuthGuard)
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Post()
  create(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(createSchema)) body: z.infer<typeof createSchema>,
  ) {
    return this.records.create(userId, body)
  }

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query('app') app?: string,
    @Query('limit') limit?: string,
  ) {
    return this.records.list(userId, app, Number(limit) || 50)
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.records.remove(userId, id)
  }
}
