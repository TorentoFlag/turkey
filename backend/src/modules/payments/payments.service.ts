import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  payments,
  type Order,
  type Payment,
} from '../../database/schema/index.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ArcPayClient } from './arc-pay.client.js';

export type CheckoutResponse = Readonly<{ checkoutUrl: string }>;
type PayableOrder = Order & Readonly<{ priceMinor: number; currency: string }>;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly arcPay: ArcPayClient,
  ) {}

  async createCheckout(
    user: AuthenticatedUser,
    orderId: string,
  ): Promise<CheckoutResponse> {
    const order = await this.findPayableOrder(user.id, orderId);
    const payment = await this.findOrCreatePayment(order);

    if (payment.checkoutUrl) {
      return { checkoutUrl: payment.checkoutUrl };
    }

    const checkout = await this.arcPay.createHostedCheckout({
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      customerEmail: order.email,
      description: order.productTitle.slice(0, 500),
      externalId: order.id,
      idempotencyKey: payment.idempotencyKey,
      metadata: { order_id: order.id, payment_id: payment.id },
    });
    const updated = await this.database.db
      .update(payments)
      .set({
        checkoutUrl: checkout.url,
        providerCheckoutId: checkout.id,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();
    const persisted = updated[0];

    if (!persisted?.checkoutUrl) {
      throw new Error('Checkout session persistence failed.');
    }

    return { checkoutUrl: persisted.checkoutUrl };
  }

  private async findPayableOrder(
    userId: string,
    orderId: string,
  ): Promise<PayableOrder> {
    const records = await this.database.db
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
      .limit(1);
    const order = records[0];

    if (!order) {
      throw new NotFoundException('Order was not found.');
    }

    const { currency, priceMinor } = order;

    if (
      order.productType === 'booking' ||
      priceMinor === null ||
      currency === null
    ) {
      throw new BadRequestException('This order does not require checkout.');
    }

    return { ...order, priceMinor, currency };
  }

  private async findOrCreatePayment(order: PayableOrder): Promise<Payment> {
    return this.database.db.transaction(async (transaction) => {
      const existingRecords = await transaction
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .limit(1);
      const existing = existingRecords[0];

      if (existing) {
        return existing;
      }

      const inserted = await transaction
        .insert(payments)
        .values({
          orderId: order.id,
          amountMinor: order.priceMinor,
          currency: order.currency,
          idempotencyKey: randomUUID(),
        })
        .onConflictDoNothing()
        .returning();
      const payment = inserted[0];

      if (payment) {
        return payment;
      }

      const racedRecords = await transaction
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .limit(1);
      const racedPayment = racedRecords[0];

      if (!racedPayment) {
        throw new Error('Payment initialization failed.');
      }

      return racedPayment;
    });
  }
}
