import { Module } from '@nestjs/common'
import { SessionsController, StatsController } from './sessions.controller'
import { SessionsService } from './sessions.service'

@Module({
  controllers: [SessionsController, StatsController],
  providers: [SessionsService],
})
export class SessionsModule {}
