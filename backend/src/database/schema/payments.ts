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
import { orders } from './orders.js';

export const paymentState = pgEnum('payment_state', [
  'pending',
  'succeeded',
  'failed',
]);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id)
      .notNull()
      .unique(),
    providerCheckoutId: uuid('provider_checkout_id').unique(),
    providerPaymentId: uuid('provider_payment_id').unique(),
    checkoutUrl: text('checkout_url'),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    amountMinor: integer('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    state: paymentState('state').default('pending').notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payments_state_created_idx').on(table.state, table.createdAt),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
