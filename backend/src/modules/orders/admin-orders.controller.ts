import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  AdminActor,
  AdminApiKeyGuard,
} from '../admin-api/admin-api-key.guard.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { OrdersService } from './orders.service.js';

@Controller('v1/admin/orders')
@UseGuards(AdminApiKeyGuard)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list() {
    return this.orders.listForAdmin();
  }

  @Patch(':id')
  updateProcessing(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
    @Body() body: unknown,
  ) {
    return this.orders.updateProcessing(id, actor, body);
  }
}
