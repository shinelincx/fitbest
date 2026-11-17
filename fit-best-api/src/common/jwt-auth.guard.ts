import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { verifyAccess } from './jwt'

export interface AuthedRequest extends Request {
  userId: string
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('请先登录')
    try {
      req.userId = verifyAccess(token).sub
      return true
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录')
    }
  }
}
