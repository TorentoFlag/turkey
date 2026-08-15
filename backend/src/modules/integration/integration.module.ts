import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MediaModule } from '../media/media.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CatalogProtocolController } from './catalog-protocol.controller.js';
import { CatalogProtocolService } from './catalog-protocol.service.js';
import { IntegrationManifestController } from './integration-manifest.controller.js';
import { ProtocolAuthGuard } from './protocol-auth.guard.js';
import { ProtocolOperationsService } from './protocol-operations.service.js';
import { StoreOrdersProtocolController } from './store-orders-protocol.controller.js';
import { StoreOrdersProtocolService } from './store-orders-protocol.service.js';
import { ScenarioAuthGuard } from './scenario-auth.guard.js';
import { TurkiyeSyntheticScenarioController } from './turkiye-synthetic-scenario.controller.js';
import { TurkiyeSyntheticScenarioService } from './turkiye-synthetic-scenario.service.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    CatalogModule,
    MediaModule,
    OrdersModule,
    PaymentsModule,
  ],
  controllers: [
    CatalogProtocolController,
    IntegrationManifestController,
    StoreOrdersProtocolController,
    TurkiyeSyntheticScenarioController,
  ],
  providers: [
    CatalogProtocolService,
    ProtocolAuthGuard,
    ProtocolOperationsService,
    ScenarioAuthGuard,
    StoreOrdersProtocolService,
    TurkiyeSyntheticScenarioService,
  ],
  exports: [
    CatalogProtocolService,
    ProtocolAuthGuard,
    ProtocolOperationsService,
    StoreOrdersProtocolService,
  ],
})
export class IntegrationModule {}
