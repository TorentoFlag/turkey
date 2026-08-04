import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const providerWebhookEvents = pgTable('provider_webhook_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  createdAt: timestamp('created_at', {
    mode: 'date',
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export type ProviderWebhookEvent = typeof providerWebhookEvents.$inferSelect;
