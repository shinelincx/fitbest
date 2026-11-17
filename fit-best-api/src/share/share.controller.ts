import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { CurrentUser } from '../common/decorators'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { ZodPipe } from '../common/zod.pipe'
import { ShareService } from './share.service'

const shareSchema = z
  .object({
    sessionId: z.string().uuid('训练记录 ID 格式不正确').optional(),
    weeklyPayload: z.record(z.any()).optional(),
  })
  .refine((data) => Boolean(data.sessionId) || Boolean(data.weeklyPayload), {
    message: '请提供训练记录或周报数据',
  })

@Controller('api/v1/share')
@UseGuards(JwtAuthGuard)
export class ShareController {
  constructor(private readonly share: ShareService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body(new ZodPipe(shareSchema)) body: z.infer<typeof shareSchema>) {
    return this.share.create(userId, body)
  }
}

@Controller('s')
export class PublicShareController {
  constructor(private readonly share: ShareService) {}

  @Get(':code')
  async view(@Param('code') code: string, @Res() res: Response) {
    const html = await this.share.view(code)
    if (!html) {
      res.status(404).type('html').send('<h1>分享已失效</h1>')
      return
    }
    res.type('html').send(html)
  }
}
