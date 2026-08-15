import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import {
  auditLog,
  categories,
  type Category,
  destinations,
  type Destination,
  orders,
  productDestinations,
  type ProductDestination,
  products,
  type Product,
} from '../../database/schema/index.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import {
  ProductMediaService,
  type ProductPhotoUpload,
} from '../media/product-media.service.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const categoryTreeLock = sql`select pg_advisory_xact_lock(22094, 1)`;

const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().min(1).max(160).regex(slugPattern),
    parentId: z.uuid().nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().min(1).max(160).regex(slugPattern).optional(),
    parentId: z.uuid().nullable().optional(),
    imageUrl: z.string().url().nullable().optional(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const createProductSchema = z
  .object({
    categoryId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    slug: z.string().min(1).max(160).regex(slugPattern),
    description: z.string().trim().min(1).max(10_000),
    imageUrl: z.string().url().nullable().optional(),
    type: z.enum(['auto_delivery', 'physical', 'booking']),
    priceMinor: z.number().int().positive().nullable().optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict()
  .superRefine((product, context) => {
    if (
      product.type !== 'booking' &&
      product.isActive &&
      (product.priceMinor == null || product.currency == null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Payable products require priceMinor and currency.',
      });
    }
  });

const updateProductSchema = z
  .object({
    categoryId: z.uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    slug: z.string().min(1).max(160).regex(slugPattern).optional(),
    description: z.string().trim().min(1).max(10_000).optional(),
    imageUrl: z.string().url().nullable().optional(),
    type: z.enum(['auto_delivery', 'physical', 'booking']).optional(),
    priceMinor: z.number().int().positive().nullable().optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const createDestinationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().min(1).max(160).regex(slugPattern),
    region: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(10_000),
    imageUrl: z.string().url().nullable().optional(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

const updateDestinationSchema = createDestinationSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const upsertProductDestinationSchema = z
  .object({
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  })
  .strict();

export type PublicCategory = Readonly<{
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  children: PublicCategory[];
}>;

export type PublicProduct = Readonly<{
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  type: Product['type'];
  priceMinor: number | null;
  currency: string | null;
}>;

export type PublicDestination = Readonly<{
  id: string;
  name: string;
  slug: string;
  region: string;
  description: string;
  imageUrl: string | null;
  productCount: number;
}>;

export type PublicDestinationDetail = Readonly<{
  destination: PublicDestination;
  products: PublicProduct[];
}>;

export type CatalogDestination = Destination &
  Readonly<{
    products: ProductDestination[];
  }>;

export type CatalogExecutor = Pick<
  DatabaseService['db'],
  'delete' | 'execute' | 'insert' | 'select' | 'update'
>;

export type CatalogCommandOptions = Readonly<{
  audit?: boolean;
  expectedRevision?: number;
  executor?: CatalogExecutor;
}>;

export class CatalogRevisionConflictError extends Error {
  readonly status = 412;
  readonly type = 'catalog/revision-conflict';

  constructor() {
    super('Catalog resource revision has changed.');
  }
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly media: ProductMediaService,
  ) {}

  async listCategories(
    executor: CatalogExecutor = this.database.db,
  ): Promise<Category[]> {
    return executor
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async createCategory(
    actor: AuthenticatedAdmin,
    input: unknown,
    options: CatalogCommandOptions = {},
  ): Promise<Category> {
    const parsed = createCategorySchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid category payload.');
    }

    return this.executeWrite(options.executor, async (transaction) => {
      await this.lockCategoryTree(transaction);
      const command = parsed.data;

      if (command.parentId) {
        const parent = await this.findCategory(command.parentId, transaction);

        if (!parent) {
          throw new NotFoundException('Parent category was not found.');
        }

        if (parent.parentId !== null) {
          throw new BadRequestException(
            'A category can have only one level of subcategories.',
          );
        }
      }

      const inserted = await transaction
        .insert(categories)
        .values(command)
        .onConflictDoNothing()
        .returning();
      const category = inserted[0];

      if (!category) {
        throw new ConflictException('Category slug already exists.');
      }

      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'category.created',
        entityType: 'category',
        entityId: category.id,
        payload: {
          name: category.name,
          slug: category.slug,
          parentId: category.parentId,
        },
      });

      return category;
    });
  }

  async updateCategory(
    id: string,
    actor: AuthenticatedAdmin,
    input: unknown,
    options: CatalogCommandOptions = {},
  ): Promise<Category> {
    const parsed = updateCategorySchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid category payload.');
    }

    return this.executeWrite(options.executor, async (transaction) => {
      await this.lockCategoryTree(transaction);
      const current = await this.findCategory(id, transaction);

      if (!current) {
        throw new NotFoundException('Category was not found.');
      }

      const changes = parsed.data;
      await this.validateCategoryParentChange(
        current,
        changes.parentId,
        transaction,
      );

      if (changes.slug && changes.slug !== current.slug) {
        await this.assertCategorySlugAvailable(
          changes.slug,
          current.id,
          transaction,
        );
      }

      const updated = await transaction
        .update(categories)
        .set({
          ...changes,
          revision: sql`${categories.revision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          options.expectedRevision === undefined
            ? eq(categories.id, id)
            : and(
                eq(categories.id, id),
                eq(categories.revision, options.expectedRevision),
              ),
        )
        .returning();
      const category = updated[0];

      if (!category) {
        if (options.expectedRevision !== undefined) {
          throw new CatalogRevisionConflictError();
        }
        throw new NotFoundException('Category was not found.');
      }

      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'category.updated',
        entityType: 'category',
        entityId: category.id,
        payload: { changedFields: Object.keys(changes) },
      });

      return category;
    });
  }

  async deleteCategory(
    id: string,
    actor: AuthenticatedAdmin,
    options: CatalogCommandOptions = {},
  ): Promise<void> {
    const current = await this.findCategory(id, options.executor);
    if (!current) throw new NotFoundException('Category was not found.');

    const [child, product] = await Promise.all([
      (options.executor ?? this.database.db)
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, id))
        .limit(1),
      (options.executor ?? this.database.db)
        .select({ id: products.id })
        .from(products)
        .where(eq(products.categoryId, id))
        .limit(1),
    ]);
    if (child[0] || product[0]) {
      throw new ConflictException(
        'A category with subcategories or products cannot be deleted.',
      );
    }

    await this.executeWrite(options.executor, async (transaction) => {
      const deleted = await transaction
        .delete(categories)
        .where(
          options.expectedRevision === undefined
            ? eq(categories.id, id)
            : and(
                eq(categories.id, id),
                eq(categories.revision, options.expectedRevision),
              ),
        )
        .returning({ id: categories.id });
      if (!deleted[0]) {
        if (options.expectedRevision !== undefined) {
          throw new CatalogRevisionConflictError();
        }
        throw new NotFoundException('Category was not found.');
      }
      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'category.deleted',
        entityType: 'category',
        entityId: id,
        payload: { slug: current.slug, parentId: current.parentId },
      });
    });
  }

  async listProducts(
    executor: CatalogExecutor = this.database.db,
  ): Promise<Product[]> {
    return executor
      .select()
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.title));
  }

  async listDestinations(
    executor: CatalogExecutor = this.database.db,
  ): Promise<CatalogDestination[]> {
    const records = await executor
      .select({ destination: destinations, membership: productDestinations })
      .from(destinations)
      .leftJoin(
        productDestinations,
        eq(productDestinations.destinationId, destinations.id),
      )
      .orderBy(
        asc(destinations.sortOrder),
        asc(destinations.name),
        asc(productDestinations.sortOrder),
      );
    const result = new Map<string, CatalogDestination>();

    for (const { destination, membership } of records) {
      const current = result.get(destination.id) ?? {
        ...destination,
        products: [],
      };
      if (membership) current.products.push(membership);
      result.set(destination.id, current);
    }

    return [...result.values()];
  }

  async createDestination(
    actor: AuthenticatedAdmin,
    input: unknown,
    photo: ProductPhotoUpload | null = null,
    options: CatalogCommandOptions = {},
  ): Promise<Destination> {
    const parsed = createDestinationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Invalid destination payload.');
    }

    const destinationId = photo ? randomUUID() : undefined;
    const stored =
      photo && destinationId
        ? await this.media.store('destinations', destinationId, photo)
        : null;
    try {
      return await this.executeWrite(options.executor, async (transaction) => {
        const inserted = await transaction
          .insert(destinations)
          .values({
            ...parsed.data,
            ...(destinationId ? { id: destinationId } : {}),
            ...(stored ? { imageUrl: stored.imageUrl } : {}),
          })
          .onConflictDoNothing()
          .returning();
        const destination = inserted[0];
        if (!destination) {
          throw new ConflictException('Destination slug already exists.');
        }

        await transaction.insert(auditLog).values({
          actorId: actor.actorId,
          action: 'destination.created',
          entityType: 'destination',
          entityId: destination.id,
          payload: { slug: destination.slug, imageUploaded: stored !== null },
        });
        return destination;
      });
    } catch (error) {
      if (stored) {
        await this.media.deleteObject(stored.objectKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async updateDestination(
    id: string,
    actor: AuthenticatedAdmin,
    input: unknown,
    photo: ProductPhotoUpload | null = null,
    options: CatalogCommandOptions = {},
  ): Promise<Destination> {
    const parsed = updateDestinationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Invalid destination payload.');
    }

    const current = await this.findDestination(id, options.executor);
    if (!current) throw new NotFoundException('Destination was not found.');
    const changes = parsed.data;
    if (changes.slug && changes.slug !== current.slug) {
      await this.assertDestinationSlugAvailable(
        changes.slug,
        current.id,
        options.executor,
      );
    }

    const stored = photo
      ? await this.media.store('destinations', id, photo)
      : null;
    try {
      const destination = await this.executeWrite(
        options.executor,
        async (transaction) => {
          const updated = await transaction
            .update(destinations)
            .set({
              ...changes,
              ...(stored ? { imageUrl: stored.imageUrl } : {}),
              revision: sql`${destinations.revision} + 1`,
              updatedAt: new Date(),
            })
            .where(
              options.expectedRevision === undefined
                ? eq(destinations.id, id)
                : and(
                    eq(destinations.id, id),
                    eq(destinations.revision, options.expectedRevision),
                  ),
            )
            .returning();
          const destination = updated[0];
          if (!destination) {
            if (options.expectedRevision !== undefined) {
              throw new CatalogRevisionConflictError();
            }
            throw new NotFoundException('Destination was not found.');
          }

          await transaction.insert(auditLog).values({
            actorId: actor.actorId,
            action: 'destination.updated',
            entityType: 'destination',
            entityId: destination.id,
            payload: {
              changedFields: [
                ...Object.keys(changes),
                ...(stored ? ['imageUrl'] : []),
              ],
              imageUploaded: stored !== null,
            },
          });
          return destination;
        },
      );
      const previousKey = current.imageUrl
        ? this.media.objectKeyFromManagedImageUrl(current.imageUrl)
        : null;
      if (stored && previousKey) {
        await this.media.deleteObject(previousKey).catch(() => undefined);
      }
      return destination;
    } catch (error) {
      if (stored) {
        await this.media.deleteObject(stored.objectKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async deleteDestination(
    id: string,
    actor: AuthenticatedAdmin,
    options: CatalogCommandOptions = {},
  ): Promise<void> {
    const current = await this.findDestination(id, options.executor);
    if (!current) throw new NotFoundException('Destination was not found.');
    const linkedProduct = await (options.executor ?? this.database.db)
      .select({ productId: productDestinations.productId })
      .from(productDestinations)
      .where(eq(productDestinations.destinationId, id))
      .limit(1);
    if (linkedProduct[0]) {
      throw new ConflictException(
        'A destination with products cannot be deleted.',
      );
    }

    await this.executeWrite(options.executor, async (transaction) => {
      const deleted = await transaction
        .delete(destinations)
        .where(
          options.expectedRevision === undefined
            ? eq(destinations.id, id)
            : and(
                eq(destinations.id, id),
                eq(destinations.revision, options.expectedRevision),
              ),
        )
        .returning({ id: destinations.id });
      if (!deleted[0]) {
        if (options.expectedRevision !== undefined) {
          throw new CatalogRevisionConflictError();
        }
        throw new NotFoundException('Destination was not found.');
      }
      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'destination.deleted',
        entityType: 'destination',
        entityId: id,
        payload: { slug: current.slug },
      });
    });

    const key = current.imageUrl
      ? this.media.objectKeyFromManagedImageUrl(current.imageUrl)
      : null;
    if (key && !options.executor) {
      await this.media.deleteObject(key).catch(() => undefined);
    }
  }

  async upsertProductDestination(
    destinationId: string,
    productId: string,
    actor: AuthenticatedAdmin,
    input: unknown,
    options: CatalogCommandOptions = {},
  ): Promise<ProductDestination> {
    const parsed = upsertProductDestinationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Invalid destination product payload.');
    }
    return this.executeWrite(options.executor, async (transaction) => {
      const [destination, product] = await Promise.all([
        this.findDestination(destinationId, transaction),
        this.findProduct(productId, transaction),
      ]);

      if (!destination) {
        throw new NotFoundException('Destination was not found.');
      }
      if (!product) {
        throw new NotFoundException('Product was not found.');
      }
      if (!destination.isActive || !product.isActive) {
        throw new BadRequestException(
          'Only active destinations and products can be related.',
        );
      }

      await this.incrementDestinationRevision(
        destinationId,
        options.expectedRevision,
        transaction,
      );
      const records = await transaction
        .insert(productDestinations)
        .values({ destinationId, productId, sortOrder: parsed.data.sortOrder })
        .onConflictDoUpdate({
          target: [
            productDestinations.productId,
            productDestinations.destinationId,
          ],
          set: { sortOrder: parsed.data.sortOrder },
        })
        .returning();
      const membership = records[0];
      if (!membership)
        throw new NotFoundException('Product relation was not found.');

      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'destination.product.upserted',
        entityType: 'destination',
        entityId: destinationId,
        payload: { productId, sortOrder: membership.sortOrder },
      });
      return membership;
    });
  }

  async deleteProductDestination(
    destinationId: string,
    productId: string,
    actor: AuthenticatedAdmin,
    options: CatalogCommandOptions = {},
  ): Promise<void> {
    await this.executeWrite(options.executor, async (transaction) => {
      const destination = await this.findDestination(
        destinationId,
        transaction,
      );
      if (!destination) {
        throw new NotFoundException('Destination was not found.');
      }

      await this.incrementDestinationRevision(
        destinationId,
        options.expectedRevision,
        transaction,
      );
      const records = await transaction
        .delete(productDestinations)
        .where(
          and(
            eq(productDestinations.destinationId, destinationId),
            eq(productDestinations.productId, productId),
          ),
        )
        .returning();
      const membership = records[0];
      if (!membership)
        throw new NotFoundException('Product relation was not found.');

      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'destination.product.deleted',
        entityType: 'destination',
        entityId: destinationId,
        payload: { productId },
      });
    });
  }

  async listPublicCategories(): Promise<PublicCategory[]> {
    const activeCategories = await this.database.db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    const childrenByParentId = new Map<string, Category[]>();

    for (const category of activeCategories) {
      if (category.parentId) {
        const children = childrenByParentId.get(category.parentId) ?? [];
        children.push(category);
        childrenByParentId.set(category.parentId, children);
      }
    }

    return activeCategories
      .filter((category) => category.parentId === null)
      .map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        imageUrl: category.imageUrl,
        children: (childrenByParentId.get(category.id) ?? []).map((child) => ({
          id: child.id,
          name: child.name,
          slug: child.slug,
          imageUrl: child.imageUrl,
          children: [],
        })),
      }));
  }

  async listPublicDestinations(): Promise<PublicDestination[]> {
    const [activeDestinations, records] = await Promise.all([
      this.database.db
        .select()
        .from(destinations)
        .where(eq(destinations.isActive, true))
        .orderBy(asc(destinations.sortOrder), asc(destinations.name)),
      this.database.db
        .select({ destination: destinations, productId: products.id })
        .from(destinations)
        .innerJoin(
          productDestinations,
          eq(productDestinations.destinationId, destinations.id),
        )
        .innerJoin(products, eq(products.id, productDestinations.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(destinations.isActive, true),
            eq(products.isActive, true),
            eq(categories.isActive, true),
          ),
        )
        .orderBy(asc(destinations.sortOrder), asc(destinations.name)),
    ]);

    const productCountByDestinationId = new Map<string, number>();
    for (const { destination } of records) {
      productCountByDestinationId.set(
        destination.id,
        (productCountByDestinationId.get(destination.id) ?? 0) + 1,
      );
    }
    return activeDestinations.map((destination) => ({
      id: destination.id,
      name: destination.name,
      slug: destination.slug,
      region: destination.region,
      description: destination.description,
      imageUrl: destination.imageUrl,
      productCount: productCountByDestinationId.get(destination.id) ?? 0,
    }));
  }

  async getPublicDestination(slug: string): Promise<PublicDestinationDetail> {
    const destination = await this.findActiveDestinationBySlug(slug);
    if (!destination) throw new NotFoundException('Destination was not found.');

    const records = await this.database.db
      .select({ product: products })
      .from(productDestinations)
      .innerJoin(products, eq(products.id, productDestinations.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(productDestinations.destinationId, destination.id),
          eq(products.isActive, true),
          eq(categories.isActive, true),
        ),
      )
      .orderBy(
        asc(productDestinations.sortOrder),
        asc(products.sortOrder),
        asc(products.title),
      );
    return {
      destination: {
        id: destination.id,
        name: destination.name,
        slug: destination.slug,
        region: destination.region,
        description: destination.description,
        imageUrl: destination.imageUrl,
        productCount: records.length,
      },
      products: records.map(({ product }) => toPublicProduct(product)),
    };
  }

  async listPublicProducts(
    categorySlug?: string,
    destinationSlug?: string,
  ): Promise<PublicProduct[]> {
    const categoryIds = categorySlug
      ? await this.findPublicCategoryFamily(categorySlug)
      : undefined;

    if (categoryIds && categoryIds.length === 0) {
      return [];
    }

    const conditions = [
      eq(products.isActive, true),
      eq(categories.isActive, true),
      ...(categoryIds ? [inArray(products.categoryId, categoryIds)] : []),
    ];

    if (destinationSlug) {
      const destination =
        await this.findActiveDestinationBySlug(destinationSlug);
      if (!destination) return [];

      const records = await this.database.db
        .select({ product: products })
        .from(productDestinations)
        .innerJoin(products, eq(products.id, productDestinations.productId))
        .innerJoin(categories, eq(categories.id, products.categoryId))
        .where(
          and(
            eq(productDestinations.destinationId, destination.id),
            ...conditions,
          ),
        )
        .orderBy(
          asc(productDestinations.sortOrder),
          asc(products.sortOrder),
          asc(products.title),
        );
      return records.map(({ product }) => toPublicProduct(product));
    }

    const records = await this.database.db
      .select({ product: products })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), asc(products.title));

    return records.map(({ product }) => toPublicProduct(product));
  }

  async getPublicCatalogHealth(): Promise<Readonly<{ total: number }>> {
    const records = await this.database.db
      .select({ total: count() })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(eq(products.isActive, true), eq(categories.isActive, true)));

    return { total: records[0]?.total ?? 0 };
  }

  async getPublicProduct(slug: string): Promise<PublicProduct> {
    const records = await this.database.db
      .select({ product: products })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.slug, slug),
          eq(products.isActive, true),
          eq(categories.isActive, true),
        ),
      )
      .limit(1);
    const record = records[0];

    if (!record) {
      throw new NotFoundException('Product was not found.');
    }

    return toPublicProduct(record.product);
  }

  async getActiveProductForOrder(productId: string): Promise<Product> {
    const records = await this.database.db
      .select({ product: products })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.id, productId),
          eq(products.isActive, true),
          eq(categories.isActive, true),
        ),
      )
      .limit(1);
    const record = records[0];

    if (!record) {
      throw new NotFoundException('Product was not found.');
    }

    return record.product;
  }

  async createProduct(
    actor: AuthenticatedAdmin,
    input: unknown,
    photo: ProductPhotoUpload | null = null,
    options: CatalogCommandOptions = {},
  ): Promise<Product> {
    const parsed = createProductSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid product payload.');
    }

    const command = parsed.data;
    const category = await this.findCategory(
      command.categoryId,
      options.executor,
    );

    if (!category) {
      throw new NotFoundException('Product category was not found.');
    }

    const productId = photo ? randomUUID() : undefined;
    const stored =
      photo && productId
        ? await this.media.store('products', productId, photo)
        : null;
    try {
      return await this.executeWrite(options.executor, async (transaction) => {
        const inserted = await transaction
          .insert(products)
          .values({
            ...command,
            ...(productId ? { id: productId } : {}),
            ...(stored ? { imageUrl: stored.imageUrl } : {}),
          })
          .onConflictDoNothing()
          .returning();
        const product = inserted[0];

        if (!product) {
          throw new ConflictException('Product slug already exists.');
        }

        await transaction.insert(auditLog).values({
          actorId: actor.actorId,
          action: 'product.created',
          entityType: 'product',
          entityId: product.id,
          payload: {
            categoryId: product.categoryId,
            slug: product.slug,
            type: product.type,
            imageUploaded: stored !== null,
          },
        });

        return product;
      });
    } catch (error) {
      if (stored) {
        await this.media.deleteObject(stored.objectKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async updateProduct(
    id: string,
    actor: AuthenticatedAdmin,
    input: unknown,
    photo: ProductPhotoUpload | null = null,
    options: CatalogCommandOptions = {},
  ): Promise<Product> {
    const parsed = updateProductSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid product payload.');
    }

    const current = await this.findProduct(id, options.executor);

    if (!current) {
      throw new NotFoundException('Product was not found.');
    }

    const changes = parsed.data;
    const type = changes.type ?? current.type;
    const priceMinor = Object.hasOwn(changes, 'priceMinor')
      ? changes.priceMinor
      : current.priceMinor;
    const currency = Object.hasOwn(changes, 'currency')
      ? changes.currency
      : current.currency;
    const isActive = changes.isActive ?? current.isActive;

    if (
      type !== 'booking' &&
      isActive &&
      (priceMinor == null || currency == null)
    ) {
      throw new BadRequestException(
        'Payable products require priceMinor and currency.',
      );
    }

    if (changes.categoryId && changes.categoryId !== current.categoryId) {
      const category = await this.findCategory(
        changes.categoryId,
        options.executor,
      );

      if (!category) {
        throw new NotFoundException('Product category was not found.');
      }
    }

    if (changes.slug && changes.slug !== current.slug) {
      await this.assertProductSlugAvailable(
        changes.slug,
        current.id,
        options.executor,
      );
    }

    const stored = photo
      ? await this.media.store('products', current.id, photo)
      : null;
    try {
      const product = await this.executeWrite(
        options.executor,
        async (transaction) => {
          const updated = await transaction
            .update(products)
            .set({
              ...changes,
              ...(stored ? { imageUrl: stored.imageUrl } : {}),
              revision: sql`${products.revision} + 1`,
              updatedAt: new Date(),
            })
            .where(
              options.expectedRevision === undefined
                ? eq(products.id, id)
                : and(
                    eq(products.id, id),
                    eq(products.revision, options.expectedRevision),
                  ),
            )
            .returning();
          const product = updated[0];

          if (!product) {
            if (options.expectedRevision !== undefined) {
              throw new CatalogRevisionConflictError();
            }
            throw new NotFoundException('Product was not found.');
          }

          await transaction.insert(auditLog).values({
            actorId: actor.actorId,
            action: 'product.updated',
            entityType: 'product',
            entityId: product.id,
            payload: {
              changedFields: [
                ...Object.keys(changes),
                ...(stored ? ['imageUrl'] : []),
              ],
              imageUploaded: stored !== null,
            },
          });

          return product;
        },
      );
      const previousKey = current.imageUrl
        ? this.media.objectKeyFromManagedImageUrl(current.imageUrl)
        : null;
      if (stored && previousKey) {
        await this.media.deleteObject(previousKey).catch(() => undefined);
      }
      return product;
    } catch (error) {
      if (stored) {
        await this.media.deleteObject(stored.objectKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async deleteProduct(
    id: string,
    actor: AuthenticatedAdmin,
    options: CatalogCommandOptions = {},
  ): Promise<void> {
    const current = await this.findProduct(id, options.executor);
    if (!current) throw new NotFoundException('Product was not found.');

    const [linkedOrder, linkedDestination] = await Promise.all([
      (options.executor ?? this.database.db)
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.productId, id))
        .limit(1),
      (options.executor ?? this.database.db)
        .select({ destinationId: productDestinations.destinationId })
        .from(productDestinations)
        .where(eq(productDestinations.productId, id))
        .limit(1),
    ]);
    if (linkedOrder[0] || linkedDestination[0]) {
      throw new ConflictException(
        'A product with orders or direction assignments cannot be deleted.',
      );
    }

    await this.executeWrite(options.executor, async (transaction) => {
      const deleted = await transaction
        .delete(products)
        .where(
          options.expectedRevision === undefined
            ? eq(products.id, id)
            : and(
                eq(products.id, id),
                eq(products.revision, options.expectedRevision),
              ),
        )
        .returning({ id: products.id });
      if (!deleted[0]) {
        if (options.expectedRevision !== undefined) {
          throw new CatalogRevisionConflictError();
        }
        throw new NotFoundException('Product was not found.');
      }
      if (options.audit !== false) {
        await transaction.insert(auditLog).values({
          actorId: actor.actorId,
          action: 'product.deleted',
          entityType: 'product',
          entityId: id,
          payload: { slug: current.slug, categoryId: current.categoryId },
        });
      }
    });

    const key = current.imageUrl
      ? this.media.objectKeyFromManagedImageUrl(current.imageUrl)
      : null;
    if (key && !options.executor) {
      await this.media.deleteObject(key).catch(() => undefined);
    }
  }

  async getCategory(
    id: string,
    executor?: CatalogExecutor,
  ): Promise<Category | undefined> {
    return this.findCategory(id, executor);
  }

  async getProduct(
    id: string,
    executor?: CatalogExecutor,
  ): Promise<Product | undefined> {
    return this.findProduct(id, executor);
  }

  async getDestination(
    id: string,
    executor?: CatalogExecutor,
  ): Promise<CatalogDestination | undefined> {
    return (await this.listDestinations(executor)).find(
      (destination) => destination.id === id,
    );
  }

  async inspectCategoryDeletion(
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<Readonly<{ categories: number; products: number }>> {
    const [childRecords, productRecords] = await Promise.all([
      executor
        .select({ total: count() })
        .from(categories)
        .where(eq(categories.parentId, id)),
      executor
        .select({ total: count() })
        .from(products)
        .where(eq(products.categoryId, id)),
    ]);
    return {
      categories: childRecords[0]?.total ?? 0,
      products: productRecords[0]?.total ?? 0,
    };
  }

  async inspectProductDeletion(
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<Readonly<{ orders: number; destinationProducts: number }>> {
    const [orderRecords, destinationRecords] = await Promise.all([
      executor
        .select({ total: count() })
        .from(orders)
        .where(eq(orders.productId, id)),
      executor
        .select({ total: count() })
        .from(productDestinations)
        .where(eq(productDestinations.productId, id)),
    ]);
    return {
      orders: orderRecords[0]?.total ?? 0,
      destinationProducts: destinationRecords[0]?.total ?? 0,
    };
  }

  async inspectDestinationDeletion(
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<Readonly<{ destinationProducts: number }>> {
    const records = await executor
      .select({ total: count() })
      .from(productDestinations)
      .where(eq(productDestinations.destinationId, id));
    return { destinationProducts: records[0]?.total ?? 0 };
  }

  private async findCategory(
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<Category | undefined> {
    const result = await executor
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return result[0];
  }

  private async findProduct(
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<Product | undefined> {
    const result = await executor
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return result[0];
  }

  private async findDestination(
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<Destination | undefined> {
    const result = await executor
      .select()
      .from(destinations)
      .where(eq(destinations.id, id))
      .limit(1);

    return result[0];
  }

  private async findActiveDestinationBySlug(
    slug: string,
  ): Promise<Destination | undefined> {
    const result = await this.database.db
      .select()
      .from(destinations)
      .where(and(eq(destinations.slug, slug), eq(destinations.isActive, true)))
      .limit(1);

    return result[0];
  }

  private async findPublicCategoryFamily(slug: string): Promise<string[]> {
    const categoriesBySlug = await this.database.db
      .select()
      .from(categories)
      .where(and(eq(categories.slug, slug), eq(categories.isActive, true)))
      .limit(1);
    const category = categoriesBySlug[0];

    if (!category) {
      return [];
    }

    const children = await this.database.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.parentId, category.id),
          eq(categories.isActive, true),
        ),
      );

    return [category.id, ...children.map((child) => child.id)];
  }

  private async validateCategoryParentChange(
    category: Category,
    parentId: string | null | undefined,
    executor: CatalogExecutor = this.database.db,
  ): Promise<void> {
    if (parentId === undefined || parentId === category.parentId) {
      return;
    }

    if (parentId === category.id) {
      throw new BadRequestException('A category cannot be its own parent.');
    }

    if (parentId !== null) {
      const parent = await this.findCategory(parentId, executor);

      if (!parent) {
        throw new NotFoundException('Parent category was not found.');
      }

      if (parent.parentId !== null) {
        throw new BadRequestException(
          'A category can have only one level of subcategories.',
        );
      }

      const child = await executor
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, category.id))
        .limit(1);

      if (child[0]) {
        throw new BadRequestException(
          'A category with subcategories cannot become a subcategory.',
        );
      }
    }
  }

  private async assertCategorySlugAvailable(
    slug: string,
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<void> {
    const existing = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, slug), ne(categories.id, id)))
      .limit(1);

    if (existing[0]) {
      throw new ConflictException('Category slug already exists.');
    }
  }

  private async assertProductSlugAvailable(
    slug: string,
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<void> {
    const existing = await executor
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.slug, slug), ne(products.id, id)))
      .limit(1);

    if (existing[0]) {
      throw new ConflictException('Product slug already exists.');
    }
  }

  private async assertDestinationSlugAvailable(
    slug: string,
    id: string,
    executor: CatalogExecutor = this.database.db,
  ): Promise<void> {
    const existing = await executor
      .select({ id: destinations.id })
      .from(destinations)
      .where(and(eq(destinations.slug, slug), ne(destinations.id, id)))
      .limit(1);

    if (existing[0]) {
      throw new ConflictException('Destination slug already exists.');
    }
  }

  private async lockCategoryTree(executor: CatalogExecutor): Promise<void> {
    await executor.execute(categoryTreeLock);
  }

  private async incrementDestinationRevision(
    id: string,
    expectedRevision: number | undefined,
    executor: CatalogExecutor,
  ): Promise<void> {
    const updated = await executor
      .update(destinations)
      .set({
        revision: sql`${destinations.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        expectedRevision === undefined
          ? eq(destinations.id, id)
          : and(
              eq(destinations.id, id),
              eq(destinations.revision, expectedRevision),
            ),
      )
      .returning({ id: destinations.id });

    if (!updated[0]) {
      if (expectedRevision !== undefined) {
        throw new CatalogRevisionConflictError();
      }
      throw new NotFoundException('Destination was not found.');
    }
  }

  private executeWrite<T>(
    executor: CatalogExecutor | undefined,
    command: (executor: CatalogExecutor) => Promise<T>,
  ): Promise<T> {
    return executor
      ? command(executor)
      : this.database.db.transaction((transaction) => command(transaction));
  }
}

function toPublicProduct(product: Product): PublicProduct {
  return {
    id: product.id,
    categoryId: product.categoryId,
    title: product.title,
    slug: product.slug,
    description: product.description,
    imageUrl: product.imageUrl,
    type: product.type,
    priceMinor: product.priceMinor,
    currency: product.currency,
  };
}
