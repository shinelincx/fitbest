import { Body, Controller, Get, Post, Query } from '@nestjs/common'
import { z } from 'zod'
import { ZodPipe } from '../common/zod.pipe'
import { MachinesService } from './machines.service'

const resolveSchema = z.object({
  kind: z.enum(['qr', 'nfc']),
  value: z.string().trim().min(1, '请提供扫码内容').max(500),
})

@Controller('api/v1')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get('machines')
  list(@Query('gymId') gymId?: string) {
    return this.machines.list(gymId || undefined)
  }

  @Post('scan/resolve')
  resolve(@Body(new ZodPipe(resolveSchema)) body: z.infer<typeof resolveSchema>) {
    return this.machines.resolve(body.kind, body.value)
  }
}
