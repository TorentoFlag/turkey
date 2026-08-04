import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  AdminActor,
  AdminApiKeyGuard,
} from '../admin-api/admin-api-key.guard.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { CatalogService } from './catalog.service.js';

@Controller('v1/admin/categories')
@UseGuards(AdminApiKeyGuard)
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listCategories() {
    return this.catalog.listCategories();
  }

  @Post()
  createCategory(
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.createCategory(actor, body);
  }
}
