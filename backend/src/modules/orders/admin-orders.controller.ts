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
import { OrdersService } from './orders.service.js';
import { RefundsService } from '../payments/refunds.service.js';

@Controller('v1/admin/orders')
@UseGuards(AdminApiKeyGuard)
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly refunds: RefundsService,
  ) {}

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

  @Post(':id/refund')
  requestRefund(
    @Param('id') id: string,
    @AdminActor() actor: AuthenticatedAdmin,
  ) {
    return this.refunds.requestFullRefund(id, actor);
  }
}
