import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { verifyAdmin, type AdminPayload } from './jwt'

export interface AdminRequest extends Request {
  admin: AdminPayload
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
    if (!token) throw new UnauthorizedException('请先登录管理后台')
    try {
      req.admin = verifyAdmin(token)
      return true
    } catch {
      throw new UnauthorizedException('后台登录已过期')
    }
  }
}
