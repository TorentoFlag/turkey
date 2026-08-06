import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthController } from './auth.controller.js';
import {
  SessionCsrfGuard,
  TrustedBrowserOriginGuard,
} from './browser-security.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, SessionCsrfGuard, TrustedBrowserOriginGuard],
  exports: [AuthService, SessionCsrfGuard, TrustedBrowserOriginGuard],
})
export class AuthModule {}
