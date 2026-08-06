import { Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthService, readSessionCookie } from '../auth/auth.service.js';
import {
  SessionCsrfGuard,
  TrustedBrowserOriginGuard,
} from '../auth/browser-security.guard.js';
import { PaymentsService } from './payments.service.js';

@Controller('v1/orders')
@UseGuards(TrustedBrowserOriginGuard, SessionCsrfGuard)
export class CheckoutController {
  constructor(
    private readonly auth: AuthService,
    private readonly payments: PaymentsService,
  ) {}

  @Post(':id/checkout')
  async createCheckout(
    @Param('id') orderId: string,
    @Headers('cookie') cookie: string | undefined,
  ) {
    const user = await this.auth.getCurrentUser(readSessionCookie(cookie));
    return this.payments.createCheckout(user, orderId);
  }
}
