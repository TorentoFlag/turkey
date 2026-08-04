import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import {
  outboxEvents,
  type NewOutboxEvent,
  type OutboxEvent,
} from '../../database/schema/index.js';

export type OutboxEventInput = Readonly<
  Pick<NewOutboxEvent, 'type' | 'aggregateId' | 'idempotencyKey' | 'payload'>
>;

const CLAIM_LEASE_SECONDS = 30;

@Injectable()
export class OutboxRepository {
  constructor(private readonly database: DatabaseService) {}

  async enqueue(event: OutboxEventInput): Promise<void> {
    await this.database.db
      .insert(outboxEvents)
      .values(event)
      .onConflictDoNothing({ target: outboxEvents.idempotencyKey });
  }

  async claimPending(limit: number): Promise<ReadonlyArray<OutboxEvent>> {
    if (!Number.isInteger(limit) || limit <= 0) {
      return [];
    }

    return this.database.db.transaction(async (transaction) => {
      const candidates = await transaction
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.deliveredAt),
            or(
              isNull(outboxEvents.nextAttemptAt),
              lte(outboxEvents.nextAttemptAt, sql`now()`),
            ),
          ),
        )
        .orderBy(outboxEvents.createdAt, outboxEvents.id)
        .limit(limit)
        .for('update', { skipLocked: true });

      if (candidates.length === 0) {
        return [];
      }

      const claimed = await transaction
        .update(outboxEvents)
        .set({
          attempts: sql`${outboxEvents.attempts} + 1`,
          nextAttemptAt: sql`now() + ${CLAIM_LEASE_SECONDS} * interval '1 second'`,
        })
        .where(
          inArray(
            outboxEvents.id,
            candidates.map(({ id }) => id),
          ),
        )
        .returning();
      const order = new Map(
        candidates.map(({ id }, index) => [id, index] as const),
      );

      return claimed.sort(
        (left, right) => order.get(left.id)! - order.get(right.id)!,
      );
    });
  }

  async markDelivered(id: string): Promise<void> {
    await this.database.db
      .update(outboxEvents)
      .set({ deliveredAt: new Date() })
      .where(and(eq(outboxEvents.id, id), isNull(outboxEvents.deliveredAt)));
  }
}
