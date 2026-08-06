import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { AuthService, readSessionCookie } from '../auth/auth.service.js';
import { OrdersService } from './orders.service.js';

@Controller('v1')
export class OrdersController {
  constructor(
    private readonly auth: AuthService,
    private readonly orders: OrdersService,
  ) {}

  @Post('orders')
  async create(
    @Headers('cookie') cookie: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const user = await this.auth.getCurrentUser(readSessionCookie(cookie));
    return this.orders.create(user, body, idempotencyKey);
  }

  @Get('me/orders')
  async listForCurrentUser(@Headers('cookie') cookie: string | undefined) {
    const user = await this.auth.getCurrentUser(readSessionCookie(cookie));
    return this.orders.listForUser(user);
  }

  @Get('me/orders/:id')
  async getForCurrentUser(
    @Param('id') id: string,
    @Headers('cookie') cookie: string | undefined,
  ) {
    const user = await this.auth.getCurrentUser(readSessionCookie(cookie));
    return this.orders.getForUser(user, id);
  }
}
