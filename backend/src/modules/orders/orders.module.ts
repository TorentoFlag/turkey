import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AdminApiModule } from '../admin-api/admin-api.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { OrdersController } from './orders.controller.js';
import { ScenarioOrdersController } from './scenario-orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    DatabaseModule,
    AdminApiModule,
    AuthModule,
    CatalogModule,
    PaymentsModule,
  ],
  controllers: [
    AdminOrdersController,
    OrdersController,
    ScenarioOrdersController,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
