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
  UseGuards,
} from '@nestjs/common';
import {
  AdminActor,
  AdminApiKeyGuard,
} from '../admin-api/admin-api-key.guard.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { CatalogService } from './catalog.service.js';

@Controller('v1/admin/destinations')
@UseGuards(AdminApiKeyGuard)
export class AdminDestinationController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listDestinations() {
    return this.catalog.listDestinations();
  }

  @Post()
  createDestination(
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.createDestination(actor, body);
  }

  @Patch(':id')
  updateDestination(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.catalog.updateDestination(id, actor, body);
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
