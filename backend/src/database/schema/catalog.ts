import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgEnum,
  primaryKey,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const productType = pgEnum('product_type', [
  'auto_delivery',
  'physical',
  'booking',
]);

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    name: text('name').notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
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
    index('categories_parent_sort_idx').on(table.parentId, table.sortOrder),
    index('categories_active_sort_idx').on(table.isActive, table.sortOrder),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    categoryId: uuid('category_id')
      .references(() => categories.id)
      .notNull(),
    title: text('title').notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    description: text('description').notNull(),
    imageUrl: text('image_url'),
    type: productType('type').notNull(),
    priceMinor: integer('price_minor'),
    currency: varchar('currency', { length: 3 }),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
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
    index('products_category_active_sort_idx').on(
      table.categoryId,
      table.isActive,
      table.sortOrder,
    ),
  ],
);

export const destinations = pgTable(
  'destinations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    region: text('region').notNull(),
    description: text('description').notNull(),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
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
    index('destinations_active_sort_idx').on(table.isActive, table.sortOrder),
  ],
);

export const productDestinations = pgTable(
  'product_destinations',
  {
    productId: uuid('product_id')
      .references(() => products.id)
      .notNull(),
    destinationId: uuid('destination_id')
      .references(() => destinations.id)
      .notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.destinationId],
      name: 'product_destinations_pkey',
    }),
    index('product_destinations_destination_sort_idx').on(
      table.destinationId,
      table.sortOrder,
    ),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Destination = typeof destinations.$inferSelect;
export type NewDestination = typeof destinations.$inferInsert;
export type ProductDestination = typeof productDestinations.$inferSelect;
export type NewProductDestination = typeof productDestinations.$inferInsert;
