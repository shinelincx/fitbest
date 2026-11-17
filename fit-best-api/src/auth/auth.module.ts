import { Module } from '@nestjs/common'
import { IntegrationsModule } from '../integrations/integrations.module'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { CodeService } from './code.service'
import { TokenService } from './token.service'

@Module({
  imports: [IntegrationsModule],
  controllers: [AuthController],
  providers: [AuthService, CodeService, TokenService],
  exports: [AuthService, CodeService, TokenService],
})
export class AuthModule {}
