import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AdminActor,
  AdminApiKeyGuard,
} from '../admin-api/admin-api-key.guard.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { CatalogService } from './catalog.service.js';

@Controller('v1/admin/products')
@UseGuards(AdminApiKeyGuard)
export class AdminProductController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listProducts() {
    return this.catalog.listProducts();
  }

  @Post()
  createProduct(
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.createProduct(actor, body);
  }

  @Patch(':id')
  updateProduct(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.updateProduct(id, actor, body);
  }
}
