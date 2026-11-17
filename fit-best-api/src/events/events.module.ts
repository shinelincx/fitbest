import { Module } from '@nestjs/common'
import { EventsController, MyRegistrationsController } from './events.controller'
import { EventsService } from './events.service'

@Module({
  controllers: [EventsController, MyRegistrationsController],
  providers: [EventsService],
})
export class EventsModule {}
