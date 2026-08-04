import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ArcPayClient } from './arc-pay.client.js';
import { CheckoutController } from './checkout.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CheckoutController],
  providers: [ArcPayClient, PaymentsService],
})
export class PaymentsModule {}
