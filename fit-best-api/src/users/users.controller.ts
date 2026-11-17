import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { CurrentUser } from '../common/decorators'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { ZodPipe } from '../common/zod.pipe'
import { UsersService } from './users.service'

const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
const emailSchema = z.string().email('邮箱格式不正确')
const codeSchema = z.string().regex(/^\d{6}$/, '验证码应为 6 位数字')

const updateMeSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(20).optional(),
  avatar: z.string().max(500).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).nullable().optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable().optional(),
  heightCm: z.number().min(50).max(250).nullable().optional(),
  weightKg: z.number().min(20).max(300).nullable().optional(),
})

const goalsSchema = z.object({
  weeklySessions: z.number().int().min(0).max(100),
  weeklyMinutes: z.number().int().min(0).max(10000),
})

const bindPhoneSchema = z.object({ phone: phoneSchema, code: codeSchema })
const bindEmailSchema = z.object({ email: emailSchema, code: codeSchema })
const bindWechatSchema = z.object({ code: z.string().min(1), client: z.enum(['app', 'web']).default('app') })
const passwordSchema = z.object({
  password: z.string().min(6, '密码至少 6 位').max(32),
  oldPassword: z.string().min(6).max(32).optional(),
})
const deleteSchema = z.object({ password: z.string().min(6).max(32).optional() }).default({})

@Controller('api/v1/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  getMe(@CurrentUser() userId: string) {
    return this.users.getMe(userId)
  }

  @Patch()
  updateMe(@CurrentUser() userId: string, @Body(new ZodPipe(updateMeSchema)) body: z.infer<typeof updateMeSchema>) {
    return this.users.updateMe(userId, body)
  }

  @Patch('goals')
  updateGoals(@CurrentUser() userId: string, @Body(new ZodPipe(goalsSchema)) body: z.infer<typeof goalsSchema>) {
    return this.users.updateGoals(userId, body)
  }

  @Get('identities')
  listIdentities(@CurrentUser() userId: string) {
    return this.users.listIdentities(userId)
  }

  @Post('identities/phone')
  bindPhone(@CurrentUser() userId: string, @Body(new ZodPipe(bindPhoneSchema)) body: z.infer<typeof bindPhoneSchema>) {
    return this.users.bindPhone(userId, body.phone, body.code)
  }

  @Post('identities/email')
  bindEmail(@CurrentUser() userId: string, @Body(new ZodPipe(bindEmailSchema)) body: z.infer<typeof bindEmailSchema>) {
    return this.users.bindEmail(userId, body.email, body.code)
  }

  @Post('identities/wechat')
  bindWechat(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(bindWechatSchema)) body: z.infer<typeof bindWechatSchema>,
  ) {
    return this.users.bindWechat(userId, body.code, body.client)
  }

  @Delete('identities/:type')
  unbind(@CurrentUser() userId: string, @Param('type') type: string) {
    if (type !== 'email' && type !== 'wechat') {
      throw new BadRequestException('仅支持解绑邮箱或微信')
    }
    return this.users.unbind(userId, type)
  }

  @Put('password')
  setPassword(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(passwordSchema)) body: z.infer<typeof passwordSchema>,
  ) {
    return this.users.setPassword(userId, body.password, body.oldPassword)
  }

  @Delete()
  deleteAccount(@CurrentUser() userId: string, @Body(new ZodPipe(deleteSchema)) body: z.infer<typeof deleteSchema>) {
    return this.users.deleteAccount(userId, body.password)
  }
}
