import { Module } from '@nestjs/common'
import { AdminAuthController } from './admin-auth.controller'
import { AdminAuthService } from './admin-auth.service'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { AuditInterceptor } from './audit.interceptor'

@Module({
  controllers: [AdminAuthController, AdminController],
  providers: [AdminAuthService, AdminService, AuditInterceptor],
})
export class AdminModule {}
