import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { payments } from './payments.js';

export const refundState = pgEnum('refund_state', [
  'processing',
  'succeeded',
  'failed',
]);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id')
      .references(() => payments.id)
      .notNull()
      .unique(),
    providerRefundId: uuid('provider_refund_id').unique(),
    amountMinor: integer('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    state: refundState('state').default('processing').notNull(),
    errorMessage: text('error_message'),
    requestedAt: timestamp('requested_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp('confirmed_at', {
      mode: 'date',
      withTimezone: true,
    }),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('refunds_state_requested_idx').on(table.state, table.requestedAt),
  ],
);

export type Refund = typeof refunds.$inferSelect;
