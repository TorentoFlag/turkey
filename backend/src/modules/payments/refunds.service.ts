import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import {
  auditLog,
  payments,
  refunds,
  type Refund,
} from '../../database/schema/index.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import { ArcPayClient } from './arc-pay.client.js';

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
    const refund = await this.database.db.transaction(async (transaction) => {
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
      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'refund.requested',
        entityType: 'refund',
        entityId: created.id,
        payload: { orderId, paymentId: payment.id },
      });
      return { created, providerPaymentId: payment.providerPaymentId };
    });

    try {
      const result = await this.arcPay.createFullRefund({
        providerPaymentId: refund.providerPaymentId,
        amountMinor: refund.created.amountMinor,
        idempotencyKey: refund.created.idempotencyKey,
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
            eq(refunds.id, refund.created.id),
            eq(refunds.state, 'processing'),
          ),
        )
        .returning();
      return updated[0] ?? refund.created;
    } catch {
      const updated = await this.database.db
        .update(refunds)
        .set({
          state: 'failed',
          errorMessage: 'Arc refund request failed.',
          confirmedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, refund.created.id))
        .returning();
      return updated[0] ?? refund.created;
    }
  }
}
