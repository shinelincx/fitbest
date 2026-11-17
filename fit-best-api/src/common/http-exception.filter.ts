import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import type { Response } from 'express'

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = '服务器开小差了，请稍后重试'
    if (exception instanceof HttpException) {
      const payload = exception.getResponse()
      message = typeof payload === 'string' ? payload : ((payload as { message?: unknown }).message as string)
      if (Array.isArray(message)) message = message[0]
    }

    if (status >= 500) console.error(exception)

    res.status(status).json({ code: status, message })
  }
}
