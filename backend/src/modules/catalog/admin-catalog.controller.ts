import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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

  @Patch(':id')
  updateCategory(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.updateCategory(id, actor, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCategory(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
  ) {
    await this.catalog.deleteCategory(id, actor);
  }
}
