import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { ZodPipe } from '../common/zod.pipe'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { CurrentUser } from '../common/decorators'
import { AuthService } from './auth.service'

const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确')
const emailSchema = z.string().email('邮箱格式不正确')
const codeSchema = z.string().regex(/^\d{6}$/, '验证码应为 6 位数字')
const sceneSchema = z.enum(['login', 'bind']).default('login')
const deviceSchema = z.string().max(120).optional()

const sendSmsSchema = z.object({ phone: phoneSchema, scene: sceneSchema })
const sendEmailSchema = z.object({ email: emailSchema, scene: sceneSchema })
const smsLoginSchema = z.object({ phone: phoneSchema, code: codeSchema, device: deviceSchema })
const emailLoginSchema = z.object({ email: emailSchema, code: codeSchema, device: deviceSchema })
const passwordLoginSchema = z.object({
  account: z.string().min(1, '请填写账号'),
  password: z.string().min(6, '密码至少 6 位').max(32),
  device: deviceSchema,
})
const registerSchema = z
  .object({
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    code: codeSchema,
    password: z.string().min(6, '密码至少 6 位').max(32),
    device: deviceSchema,
  })
  .refine((data) => Boolean(data.phone) !== Boolean(data.email), { message: '手机号与邮箱需且仅需填写一个' })
const wechatLoginSchema = z.object({
  code: z.string().min(1),
  client: z.enum(['app', 'web']).default('app'),
  device: deviceSchema,
})
const wechatPhoneSchema = z.object({
  bindTicket: z.string().min(1),
  phone: phoneSchema,
  code: codeSchema,
  device: deviceSchema,
})
const refreshSchema = z.object({ refreshToken: z.string().min(1) })
const logoutSchema = z.object({ refreshToken: z.string().min(1).optional() }).default({})

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sms/send')
  sendSms(@Body(new ZodPipe(sendSmsSchema)) body: z.infer<typeof sendSmsSchema>) {
    return this.auth.sendSms(body.phone, body.scene)
  }

  @Post('email/send')
  sendEmail(@Body(new ZodPipe(sendEmailSchema)) body: z.infer<typeof sendEmailSchema>) {
    return this.auth.sendEmail(body.email, body.scene)
  }

  @Post('sms/login')
  loginWithSms(
    @Body(new ZodPipe(smsLoginSchema)) body: z.infer<typeof smsLoginSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.loginWithSms(body.phone, body.code, body.device, ip)
  }

  @Post('email/login')
  loginWithEmail(
    @Body(new ZodPipe(emailLoginSchema)) body: z.infer<typeof emailLoginSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.loginWithEmail(body.email, body.code, body.device, ip)
  }

  @Post('password/login')
  loginWithPassword(
    @Body(new ZodPipe(passwordLoginSchema)) body: z.infer<typeof passwordLoginSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.loginWithPassword(body.account, body.password, body.device, ip)
  }

  @Post('password/register')
  register(@Body(new ZodPipe(registerSchema)) body: z.infer<typeof registerSchema>, @Ip() ip: string) {
    return this.auth.register({ ...body, ip })
  }

  @Post('wechat/login')
  loginWithWechat(
    @Body(new ZodPipe(wechatLoginSchema)) body: z.infer<typeof wechatLoginSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.loginWithWechat(body.code, body.client, body.device, ip)
  }

  @Post('wechat/phone')
  bindWechatPhone(
    @Body(new ZodPipe(wechatPhoneSchema)) body: z.infer<typeof wechatPhoneSchema>,
    @Ip() ip: string,
  ) {
    return this.auth.bindWechatPhone({ ...body, ip })
  }

  @Post('refresh')
  refresh(@Body(new ZodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>) {
    return this.auth.refresh(body.refreshToken)
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() userId: string,
    @Body(new ZodPipe(logoutSchema)) body: z.infer<typeof logoutSchema>,
  ) {
    await this.auth.logout(userId, body.refreshToken)
    return { ok: true }
  }
}
