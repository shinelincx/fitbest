import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AdminRequest } from './admin.guard'
import type { AuthedRequest } from './jwt-auth.guard'

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().userId
})

export const CurrentAdmin = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AdminRequest>().admin
})
