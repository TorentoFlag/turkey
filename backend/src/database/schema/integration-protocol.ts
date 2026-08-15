import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const catalogProtocolOperationState = pgEnum(
  'catalog_protocol_operation_state',
  ['in_progress', 'completed', 'failed'],
);

export const catalogProtocolOperations = pgTable(
  'catalog_protocol_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteKey: varchar('site_key', { length: 128 }).notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestFingerprint: varchar('request_fingerprint', {
      length: 64,
    }).notNull(),
    actorId: varchar('actor_id', { length: 128 }).notNull(),
    requestId: uuid('request_id').notNull(),
    method: varchar('method', { length: 10 }).notNull(),
    path: text('path').notNull(),
    state: catalogProtocolOperationState('state').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex('catalog_protocol_operations_site_idempotency_idx').on(
      table.siteKey,
      table.idempotencyKey,
    ),
    uniqueIndex('catalog_protocol_operations_site_request_idx').on(
      table.siteKey,
      table.requestId,
    ),
    index('catalog_protocol_operations_site_operation_idx').on(
      table.siteKey,
      table.id,
    ),
  ],
);

export const catalogProtocolUploads = pgTable(
  'catalog_protocol_uploads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteKey: varchar('site_key', { length: 128 }).notNull(),
    actorId: varchar('actor_id', { length: 128 }).notNull(),
    objectKey: text('object_key').notNull(),
    mimeType: varchar('mime_type', { length: 255 }).notNull(),
    byteCount: integer('byte_count').notNull(),
    expiresAt: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    consumedAt: timestamp('consumed_at', {
      mode: 'date',
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('catalog_protocol_uploads_site_expiry_idx').on(
      table.siteKey,
      table.expiresAt,
    ),
  ],
);

export type CatalogProtocolOperation =
  typeof catalogProtocolOperations.$inferSelect;
export type NewCatalogProtocolOperation =
  typeof catalogProtocolOperations.$inferInsert;
export type CatalogProtocolUpload = typeof catalogProtocolUploads.$inferSelect;
export type NewCatalogProtocolUpload =
  typeof catalogProtocolUploads.$inferInsert;
