import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import {
  orders,
  outboxEvents,
  payments,
  providerWebhookEvents,
  type Order,
  type Payment,
} from '../../database/schema/index.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ArcPayClient } from './arc-pay.client.js';
import type { AppEnv } from '../../config/env.js';

export type CheckoutResponse = Readonly<{ checkoutUrl: string }>;
type PayableOrder = Order & Readonly<{ priceMinor: number; currency: string }>;

const arcWebhookEventSchema = z
  .object({
    event_type: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .passthrough();

@Injectable()
export class PaymentsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly arcPay: ArcPayClient,
    private readonly config: ConfigService<AppEnv, true>,
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
      description: '-',
      externalId: order.id,
      idempotencyKey: payment.idempotencyKey,
      metadata: { order_id: order.id, payment_id: payment.id },
      ...this.checkoutReturnUrls(order.id),
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

  private checkoutReturnUrls(orderId: string): Readonly<{
    successUrl: string;
    failUrl: string;
    cancelUrl: string;
  }> {
    const webAppOrigin = this.config.get('WEB_APP_ORIGIN', { infer: true });

    if (!webAppOrigin || new URL(webAppOrigin).protocol !== 'https:') {
      throw new ServiceUnavailableException(
        'Payments are temporarily unavailable.',
      );
    }

    const buildUrl = (result: 'success' | 'failed' | 'cancelled') => {
      const url = new URL('/checkout/return', webAppOrigin);
      url.searchParams.set('order', orderId);
      url.searchParams.set('result', result);
      return url.toString();
    };

    return {
      successUrl: buildUrl('success'),
      failUrl: buildUrl('failed'),
      cancelUrl: buildUrl('cancelled'),
    };
  }

  async applyArcWebhook(input: {
    rawBody: Buffer;
    webhookId: string;
  }): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid webhook payload.');
    }

    const parsed = arcWebhookEventSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException('Invalid webhook payload.');
    }

    await this.database.db.transaction(async (transaction) => {
      const accepted = await transaction
        .insert(providerWebhookEvents)
        .values({ id: input.webhookId, eventType: parsed.data.event_type })
        .onConflictDoNothing()
        .returning({ id: providerWebhookEvents.id });

      if (accepted.length === 0) {
        return;
      }

      const paymentId =
        readUuid(parsed.data.data, ['metadata', 'payment_id']) ??
        readUuid(parsed.data.data, ['payment', 'metadata', 'payment_id']);
      const providerPaymentId =
        readUuid(parsed.data.data, ['id']) ??
        readUuid(parsed.data.data, ['payment', 'id']);
      const providerCheckoutId =
        readUuid(parsed.data.data, ['checkout_session_id']) ??
        readUuid(parsed.data.data, ['checkout_session', 'id']);
      const paymentRecords = paymentId
        ? await transaction
            .select()
            .from(payments)
            .where(eq(payments.id, paymentId))
            .limit(1)
        : providerPaymentId
          ? await transaction
              .select()
              .from(payments)
              .where(eq(payments.providerPaymentId, providerPaymentId))
              .limit(1)
          : providerCheckoutId
            ? await transaction
                .select()
                .from(payments)
                .where(eq(payments.providerCheckoutId, providerCheckoutId))
                .limit(1)
            : [];
      const payment = paymentRecords[0];

      if (!payment) {
        return;
      }

      if (parsed.data.event_type === 'payment.captured') {
        const updated = await transaction
          .update(payments)
          .set({
            providerPaymentId: providerPaymentId ?? payment.providerPaymentId,
            state: 'succeeded',
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id))
          .returning();
        const persisted = updated[0];

        if (!persisted) {
          throw new Error('Payment update failed.');
        }

        await transaction
          .insert(outboxEvents)
          .values({
            type: 'order.accepted',
            aggregateId: persisted.orderId,
            idempotencyKey: `order.accepted:${persisted.orderId}`,
            payload: { orderId: persisted.orderId },
          })
          .onConflictDoNothing();
      }

      if (
        (parsed.data.event_type === 'payment.declined' ||
          parsed.data.event_type === 'payment.failed') &&
        payment.state === 'pending'
      ) {
        await transaction
          .update(payments)
          .set({ state: 'failed', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
      }
    });
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

function readUuid(
  value: Record<string, unknown>,
  path: string[],
): string | undefined {
  const candidate = readString(value, path);
  const parsed = z.uuid().safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function readString(
  value: Record<string, unknown>,
  path: string[],
): string | undefined {
  let current: unknown = value;

  for (const part of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[part];
  }

  return typeof current === 'string' ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
