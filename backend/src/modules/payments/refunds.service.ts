import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import {
  auditLog,
  orders,
  payments,
  refunds,
  type Refund,
} from '../../database/schema/index.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { CatalogRevisionConflictError } from '../catalog/catalog.service.js';
import { ArcPayClient } from './arc-pay.client.js';

export type ProtocolRefundResult = Readonly<{
  orderRevision: number;
  refund: Refund;
}>;

@Injectable()
export class RefundsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly arcPay: ArcPayClient,
  ) {}

  async requestFullRefund(
    orderId: string,
    actor: AuthenticatedAdmin,
  ): Promise<Refund> {
    return (await this.requestFullRefundInternal(orderId, actor)).refund;
  }

  async requestFullRefundForProtocol(
    orderId: string,
    actor: AuthenticatedAdmin,
    expectedRevision: number,
  ): Promise<ProtocolRefundResult> {
    return this.requestFullRefundInternal(orderId, actor, expectedRevision);
  }

  private async requestFullRefundInternal(
    orderId: string,
    actor: AuthenticatedAdmin,
    expectedRevision?: number,
  ): Promise<ProtocolRefundResult> {
    const initialized = await this.database.db.transaction(
      async (transaction) => {
        const order = (
          await transaction
            .select({ revision: orders.revision })
            .from(orders)
            .where(eq(orders.id, orderId))
            .limit(1)
        )[0];
        if (!order) throw new NotFoundException('Order was not found.');
        if (
          expectedRevision !== undefined &&
          order.revision !== expectedRevision
        ) {
          throw new CatalogRevisionConflictError();
        }
        const paymentRecords = await transaction
          .select()
          .from(payments)
          .where(eq(payments.orderId, orderId))
          .limit(1);
        const payment = paymentRecords[0];

        if (!payment) throw new NotFoundException('Payment was not found.');
        if (payment.state !== 'succeeded' || !payment.providerPaymentId) {
          throw new ConflictException('Payment is not eligible for a refund.');
        }

        const existing = await transaction
          .select()
          .from(refunds)
          .where(eq(refunds.paymentId, payment.id))
          .limit(1);
        if (existing[0]) {
          throw new ConflictException(
            'A refund already exists for this payment.',
          );
        }

        const inserted = await transaction
          .insert(refunds)
          .values({
            paymentId: payment.id,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            idempotencyKey: randomUUID(),
          })
          .returning();
        const created = inserted[0];
        if (!created) throw new Error('Refund initialization failed.');
        const updatedOrders = await transaction
          .update(orders)
          .set({ revision: sql`${orders.revision} + 1` })
          .where(
            expectedRevision === undefined
              ? eq(orders.id, orderId)
              : and(
                  eq(orders.id, orderId),
                  eq(orders.revision, expectedRevision),
                ),
          )
          .returning({ revision: orders.revision });
        const updatedOrder = updatedOrders[0];
        if (!updatedOrder) throw new CatalogRevisionConflictError();
        await transaction.insert(auditLog).values({
          actorId: actor.actorId,
          action: 'refund.requested',
          entityType: 'refund',
          entityId: created.id,
          payload: { orderId, paymentId: payment.id },
        });
        return {
          created,
          orderRevision: updatedOrder.revision,
          providerPaymentId: payment.providerPaymentId,
        };
      },
    );

    try {
      const result = await this.arcPay.createFullRefund({
        providerPaymentId: initialized.providerPaymentId,
        amountMinor: initialized.created.amountMinor,
        idempotencyKey: initialized.created.idempotencyKey,
      });
      const state = result.status === 'pending' ? 'processing' : result.status;
      const updated = await this.database.db
        .update(refunds)
        .set({
          providerRefundId: result.id,
          state,
          confirmedAt: result.status === 'pending' ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(refunds.id, initialized.created.id),
            eq(refunds.state, 'processing'),
          ),
        )
        .returning();
      return {
        orderRevision: initialized.orderRevision,
        refund: updated[0] ?? initialized.created,
      };
    } catch {
      const updated = await this.database.db
        .update(refunds)
        .set({
          state: 'failed',
          errorMessage: 'Arc refund request failed.',
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, initialized.created.id))
        .returning();
      return {
        orderRevision: initialized.orderRevision,
        refund: updated[0] ?? initialized.created,
      };
    }
  }
}
