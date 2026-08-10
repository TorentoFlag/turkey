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
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  AdminActor,
  AdminApiKeyGuard,
} from '../admin-api/admin-api-key.guard.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { CatalogService } from './catalog.service.js';
import { readDestinationMutationPayload } from './product-multipart.input.js';

@Controller('v1/admin/destinations')
@UseGuards(AdminApiKeyGuard)
export class AdminDestinationController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listDestinations() {
    return this.catalog.listDestinations();
  }

  @Post()
  async createDestination(
    @AdminActor() actor: AuthenticatedAdmin,
    @Req() request: FastifyRequest,
  ) {
    const payload = await readDestinationMutationPayload(request);
    return this.catalog.createDestination(actor, payload.input, payload.photo);
  }

  @Patch(':id')
  async updateDestination(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Req() request: FastifyRequest,
  ) {
    const payload = await readDestinationMutationPayload(request);
    return this.catalog.updateDestination(
      id,
      actor,
      payload.input,
      payload.photo,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDestination(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
  ) {
    await this.catalog.deleteDestination(id, actor);
  }

  @Put(':id/products/:productId')
  upsertProductDestination(
    @Param('id') destinationId: string,
    @Param('productId') productId: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.upsertProductDestination(
      destinationId,
      productId,
      actor,
      body,
    );
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteProductDestination(
    @Param('id') destinationId: string,
    @Param('productId') productId: string,
    @AdminActor() actor: AuthenticatedAdmin,
  ) {
    await this.catalog.deleteProductDestination(
      destinationId,
      productId,
      actor,
    );
  }
}
