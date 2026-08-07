import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ArcPayClient } from './arc-pay.client.js';
import { ArcWebhookVerifier } from './arc-webhook-verifier.js';
import { ArcWebhooksController } from './arc-webhooks.controller.js';
import { CheckoutController } from './checkout.controller.js';
import { PaymentsService } from './payments.service.js';
import { RefundsService } from './refunds.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ArcWebhooksController, CheckoutController],
  providers: [
    ArcPayClient,
    ArcWebhookVerifier,
    PaymentsService,
    RefundsService,
  ],
  exports: [RefundsService, PaymentsService],
})
export class PaymentsModule {}
