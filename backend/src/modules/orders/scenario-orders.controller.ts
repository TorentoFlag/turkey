import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminApiKeyGuard } from '../admin-api/admin-api-key.guard.js';
import { PaymentsService } from '../payments/payments.service.js';
import { OrdersService } from './orders.service.js';

@Controller('v1/admin/scenario-orders')
@UseGuards(AdminApiKeyGuard)
export class ScenarioOrdersController {
  constructor(private readonly orders: OrdersService, private readonly payments: PaymentsService) {}

  @Post()
  async create() {
    const scenario = await this.orders.createScenarioOrder();
    const checkout = await this.payments.createCheckout(scenario, scenario.orderId);
    return { scenarioOrderId: scenario.orderId, checkoutUrl: checkout.checkoutUrl };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    await this.orders.cleanupScenarioOrder(id);
    return { localCleanupStatus: 'cancelled' };
  }
}
