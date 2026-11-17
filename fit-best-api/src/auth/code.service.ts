import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash, randomInt } from 'node:crypto'
import { config } from '../config'
import { RedisService } from '../redis/redis.module'
import { shanghaiDateKey } from '../common/time'

export type CodeChannel = 'sms' | 'email'
export type CodeScene = 'login' | 'bind'

const MAX_ATTEMPTS = 5

@Injectable()
export class CodeService {
  constructor(private readonly redis: RedisService) {}

  private codeKey(channel: CodeChannel, scene: CodeScene, target: string): string {
    return `code:${channel}:${scene}:${target}`
  }

  private hash(channel: CodeChannel, scene: CodeScene, target: string, code: string): string {
    return createHash('sha256').update(`${channel}:${scene}:${target}:${code}:${config.qr.secret}`).digest('hex')
  }

  /** 生成并缓存 6 位验证码，包含冷却与每日次数限制 */
  async issue(channel: CodeChannel, scene: CodeScene, target: string): Promise<string> {
    const client = this.redis.client
    const cooldownKey = `cool:${channel}:${scene}:${target}`
    const acquired = await client.set(cooldownKey, '1', 'EX', config.auth.cooldown, 'NX')
    if (!acquired) throw new BadRequestException('验证码发送过于频繁，请稍后再试')

    const dailyKey = `daily:${channel}:${target}:${shanghaiDateKey(new Date())}`
    const used = await client.incr(dailyKey)
    if (used === 1) await client.expire(dailyKey, 86400)
    if (used > config.auth.dailyLimit) {
      await client.del(cooldownKey)
      throw new BadRequestException('今日验证码发送次数已达上限')
    }

    const code = String(randomInt(0, 1000000)).padStart(6, '0')
    await client.set(
      this.codeKey(channel, scene, target),
      JSON.stringify({ h: this.hash(channel, scene, target, code), a: 0 }),
      'EX',
      config.auth.codeTtl,
    )
    return code
  }

  /** 校验验证码，成功后立即失效 */
  async verify(channel: CodeChannel, scene: CodeScene, target: string, code: string): Promise<void> {
    const client = this.redis.client
    const key = this.codeKey(channel, scene, target)
    const raw = await client.get(key)
    if (!raw) throw new BadRequestException('验证码已失效，请重新获取')

    const data = JSON.parse(raw) as { h: string; a: number }
    if (data.a >= MAX_ATTEMPTS) {
      await client.del(key)
      throw new BadRequestException('验证码错误次数过多，请重新获取')
    }
    if (data.h !== this.hash(channel, scene, target, code)) {
      await client.set(key, JSON.stringify({ h: data.h, a: data.a + 1 }), 'KEEPTTL')
      throw new BadRequestException('验证码错误')
    }
    await client.del(key)
  }
}
