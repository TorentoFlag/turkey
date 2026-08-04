import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth.js';
import { productType, products } from './catalog.js';

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id)
      .notNull(),
    productId: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    productTitle: text('product_title').notNull(),
    productType: productType('product_type').notNull(),
    priceMinor: integer('price_minor'),
    currency: varchar('currency', { length: 3 }),
    email: varchar('email', { length: 320 }).notNull(),
    phone: varchar('phone', { length: 50 }).notNull(),
    deliveryAddress: text('delivery_address'),
    bookingStartDate: date('booking_start_date', { mode: 'string' }),
    bookingEndDate: date('booking_end_date', { mode: 'string' }),
    isProcessed: boolean('is_processed').default(false).notNull(),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('orders_user_created_idx').on(table.userId, table.createdAt),
    index('orders_product_created_idx').on(table.productId, table.createdAt),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
