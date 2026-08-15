import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MediaModule } from '../media/media.module.js';
import { CatalogProtocolController } from './catalog-protocol.controller.js';
import { CatalogProtocolService } from './catalog-protocol.service.js';
import { IntegrationManifestController } from './integration-manifest.controller.js';
import { ProtocolAuthGuard } from './protocol-auth.guard.js';
import { ProtocolOperationsService } from './protocol-operations.service.js';

@Module({
  imports: [AppConfigModule, DatabaseModule, CatalogModule, MediaModule],
  controllers: [CatalogProtocolController, IntegrationManifestController],
  providers: [
    CatalogProtocolService,
    ProtocolAuthGuard,
    ProtocolOperationsService,
  ],
  exports: [
    CatalogProtocolService,
    ProtocolAuthGuard,
    ProtocolOperationsService,
  ],
})
export class IntegrationModule {}
