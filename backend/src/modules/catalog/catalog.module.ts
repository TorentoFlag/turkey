import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AdminApiModule } from '../admin-api/admin-api.module.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [DatabaseModule, AdminApiModule],
  controllers: [AdminCatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
