import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AdminApiModule } from '../admin-api/admin-api.module.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { AdminProductController } from './admin-product.controller.js';
import { CatalogService } from './catalog.service.js';
import { PublicCatalogController } from './public-catalog.controller.js';

@Module({
  imports: [DatabaseModule, AdminApiModule],
  controllers: [
    AdminCatalogController,
    AdminProductController,
    PublicCatalogController,
  ],
  providers: [CatalogService],
})
export class CatalogModule {}
