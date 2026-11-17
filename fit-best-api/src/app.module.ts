import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { IntegrationsModule } from './integrations/integrations.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { MachinesModule } from './machines/machines.module'
import { SessionsModule } from './sessions/sessions.module'
import { ShareModule } from './share/share.module'
import { EventsModule } from './events/events.module'
import { NotificationsModule } from './notifications/notifications.module'
import { AdminModule } from './admin/admin.module'
import { CoachModule } from './coach/coach.module'
import { RecordsModule } from './records/records.module'
import { DevicesModule } from './devices/devices.module'

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    IntegrationsModule,
    AuthModule,
    UsersModule,
    MachinesModule,
    SessionsModule,
    ShareModule,
    EventsModule,
    NotificationsModule,
    AdminModule,
    CoachModule,
    RecordsModule,
    DevicesModule,
  ],
})
export class AppModule {}
