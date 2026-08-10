import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  AdminActor,
  AdminApiKeyGuard,
} from '../admin-api/admin-api-key.guard.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { CatalogService } from './catalog.service.js';
import { readProductMutationPayload } from './product-multipart.input.js';

@Controller('v1/admin/products')
@UseGuards(AdminApiKeyGuard)
export class AdminProductController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listProducts() {
    return this.catalog.listProducts();
  }

  @Post()
  async createProduct(
    @AdminActor() actor: AuthenticatedAdmin,
    @Req() request: FastifyRequest,
  ) {
    const payload = await readProductMutationPayload(request);
    return this.catalog.createProduct(actor, payload.input, payload.photo);
  }

  @Patch(':id')
  async updateProduct(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Req() request: FastifyRequest,
  ) {
    const payload = await readProductMutationPayload(request);
    return this.catalog.updateProduct(id, actor, payload.input, payload.photo);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProduct(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
  ) {
    await this.catalog.deleteProduct(id, actor);
  }
}
