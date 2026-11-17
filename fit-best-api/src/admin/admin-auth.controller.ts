import { Body, Controller, Get, Ip, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AdminGuard } from '../common/admin.guard'
import { CurrentAdmin } from '../common/decorators'
import type { AdminPayload } from '../common/jwt'
import { ZodPipe } from '../common/zod.pipe'
import { AdminAuthService } from './admin-auth.service'

const loginSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  password: z.string().min(6, '密码至少 6 位').max(32),
})

@Controller('api/v1/admin')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('auth/login')
  login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Ip() _ip: string) {
    return this.auth.login(body.phone, body.password)
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: AdminPayload) {
    return this.auth.me(admin)
  }
}
