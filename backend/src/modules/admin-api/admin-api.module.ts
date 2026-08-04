import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module.js';
import { AdminApiKeyGuard } from './admin-api-key.guard.js';

@Module({
  imports: [AppConfigModule],
  providers: [AdminApiKeyGuard],
  exports: [AdminApiKeyGuard],
})
export class AdminApiModule {}
