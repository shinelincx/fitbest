import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentUser } from '../common/decorators'
import { verifyAccess } from '../common/jwt'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { ZodPipe } from '../common/zod.pipe'
import { CoachService } from './coach.service'

function optionalUserId(header: string | undefined): string | undefined {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return undefined
  try {
    return verifyAccess(token).sub
  } catch {
    return undefined
  }
}

const chatSchema = z.object({
  app: z.enum(['hyrox', 'btwe']).default('hyrox'),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'coach']),
        content: z.string().trim().min(1).max(500),
      }),
    )
    .min(1, '消息不能为空')
    .max(20, '单次最多 20 条消息'),
  // 游客可用本地摘要补充上下文；登录用户以服务端数据为准
  context: z.string().trim().max(600).optional(),
})

const digestSchema = z.object({
  recentCount: z.number().int().min(0).optional(),
  avgTotalSec: z.number().int().min(0).optional(),
  avgRunSplitSec: z.number().int().min(0).optional(),
  weakestStations: z.array(z.string().max(60)).max(8).optional(),
  lastRpe: z.number().int().min(1).max(10).optional(),
  avgTreadmillPaceSec: z.number().int().min(0).optional(),
  treadmillConsistencyPct: z.number().int().min(0).max(100).optional(),
  treadmillSessions: z.number().int().min(0).optional(),
})

const planSchema = z.object({
  app: z.enum(['hyrox', 'btwe']).default('hyrox'),
  goal: z.enum(['finish', 'pb']).default('finish'),
  experience: z.enum(['none', 'once', 'multi']).default('none'),
  daysPerWeek: z.number().int().min(2).max(5),
  sessionMinutes: z.number().int().min(20).max(180),
  equipment: z.array(z.string().max(30)).max(10).default([]),
  weak: z.string().max(80).default('没有短板'),
  raceDate: z.string().datetime().optional(),
  digest: digestSchema.optional(),
})

@Controller('api/v1/coach')
export class CoachController {
  constructor(private readonly coach: CoachService) {}

  @Post('chat')
  async chat(
    @Body(new ZodPipe(chatSchema)) body: z.infer<typeof chatSchema>,
    @Headers('authorization') authorization?: string,
  ) {
    const userId = optionalUserId(authorization)
    let contextText = body.context
    if (userId) {
      const serverContext = await this.coach.context(userId, body.app)
      if (serverContext.digest.recentCount) contextText = serverContext.text
    }
    return this.coach.chat(body.app, body.messages, contextText)
  }

  @Post('plan/generate')
  generatePlan(
    @Body(new ZodPipe(planSchema)) body: z.infer<typeof planSchema>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.coach.generatePlan(optionalUserId(authorization), body)
  }

  @Get('context')
  @UseGuards(JwtAuthGuard)
  getContext(@CurrentUser() userId: string, @Query('app') app?: string) {
    return this.coach.context(userId, app === 'btwe' ? 'btwe' : 'hyrox')
  }
}
