import { Module } from '@nestjs/common';
import { HealthModule } from './common/health/health.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ProtocolAuthGuard } from './modules/integration/protocol-auth.guard.js';
import { ProtocolOperationsService } from './modules/integration/protocol-operations.service.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
    NotificationsModule,
    AuditModule,
  ],
  providers: [ProtocolAuthGuard, ProtocolOperationsService],
})
export class AppModule {}
