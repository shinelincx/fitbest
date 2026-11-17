import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { IntegrationsModule } from '../integrations/integrations.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  imports: [AuthModule, IntegrationsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
