import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common'
import { ZodType, ZodTypeDef } from 'zod'

@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      const issue = result.error.issues[0]
      const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
      throw new BadRequestException(`${path}${issue.message}`)
    }
    return result.data
  }
}
