import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable, tap } from 'rxjs'
import type { AdminRequest } from '../common/admin.guard'
import { PrismaService } from '../prisma/prisma.module'

const SENSITIVE_KEYS = new Set(['password', 'oldPassword', 'code', 'refreshToken'])
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(key) ? '[redacted]' : sanitize(item),
      ]),
    )
  }
  return value
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AdminRequest & { route?: { path?: string } }>()
    if (!WRITE_METHODS.has(req.method) || !req.admin) return next.handle()

    return next.handle().pipe(
      tap(() => {
        this.prisma.auditLog
          .create({
            data: {
              adminId: req.admin.aid,
              orgId: req.admin.orgId,
              gymId: req.admin.gymId,
              action: `${req.method} ${req.route?.path ?? req.url}`,
              payload: (sanitize(req.body) ?? {}) as object,
              ip: req.ip,
            },
          })
          .catch(() => undefined)
      }),
    )
  }
}
