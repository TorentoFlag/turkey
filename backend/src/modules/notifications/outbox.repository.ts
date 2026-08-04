import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import {
  outboxEvents,
  type NewOutboxEvent,
  type OutboxEvent,
} from '../../database/schema/index.js';

export type OutboxEventInput = Readonly<
  Pick<NewOutboxEvent, 'type' | 'aggregateId' | 'idempotencyKey' | 'payload'>
>;

export type ClaimedOutboxEvent = Readonly<
  OutboxEvent & {
    claimToken: string;
    nextAttemptAt: Date;
  }
>;

const CLAIM_LEASE_SECONDS = 30;

@Injectable()
export class OutboxRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async enqueue(event: OutboxEventInput): Promise<void> {
    await this.database.db
      .insert(outboxEvents)
      .values(event)
      .onConflictDoNothing({ target: outboxEvents.idempotencyKey });
  }

  async claimPending(
    limit: number,
  ): Promise<ReadonlyArray<ClaimedOutboxEvent>> {
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
          claimToken: sql`gen_random_uuid()`,
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

      const ordered = claimed.sort(
        (left, right) => order.get(left.id)! - order.get(right.id)!,
      );

      return ordered.map((event) => {
        if (event.claimToken === null || event.nextAttemptAt === null) {
          throw new Error('Claimed outbox event has no active lease.');
        }

        return {
          ...event,
          claimToken: event.claimToken,
          nextAttemptAt: event.nextAttemptAt,
        };
      });
    });
  }

  async markDelivered(id: string, claimToken: string): Promise<boolean> {
    const delivered = await this.database.db
      .update(outboxEvents)
      .set({ claimToken: null, deliveredAt: new Date(), nextAttemptAt: null })
      .where(
        and(
          eq(outboxEvents.id, id),
          eq(outboxEvents.claimToken, claimToken),
          isNull(outboxEvents.deliveredAt),
          gt(outboxEvents.nextAttemptAt, sql`now()`),
        ),
      )
      .returning({ id: outboxEvents.id });

    return delivered.length === 1;
  }

  async scheduleRetry(
    id: string,
    claimToken: string,
    attempts: number,
  ): Promise<boolean> {
    const delaySeconds = Math.min(60 * 60, 2 ** Math.min(attempts, 10));
    const retried = await this.database.db
      .update(outboxEvents)
      .set({
        claimToken: null,
        nextAttemptAt: new Date(Date.now() + delaySeconds * 1_000),
      })
      .where(
        and(
          eq(outboxEvents.id, id),
          eq(outboxEvents.claimToken, claimToken),
          isNull(outboxEvents.deliveredAt),
        ),
      )
      .returning({ id: outboxEvents.id });

    return retried.length === 1;
  }
}
