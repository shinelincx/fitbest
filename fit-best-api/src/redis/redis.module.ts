import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import { config } from '../config'

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis

  constructor() {
    this.client = new Redis(config.redisUrl, { maxRetriesPerRequest: null })
    this.client.on('error', (error: Error) => {
      if (config.env !== 'production') console.warn('[redis]', error.message)
    })
  }

  async onModuleDestroy() {
    await this.client.quit()
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
