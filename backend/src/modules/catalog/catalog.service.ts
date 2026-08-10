import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
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

@Injectable()
export class CatalogService {
  constructor(
    private readonly database: DatabaseService,
    private readonly media: ProductMediaService,
  ) {}

  async listCategories(): Promise<Category[]> {
    return this.database.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async createCategory(
    actor: AuthenticatedAdmin,
    input: unknown,
  ): Promise<Category> {
    const parsed = createCategorySchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid category payload.');
    }

    const command = parsed.data;

    if (command.parentId) {
      const parent = await this.findCategory(command.parentId);

      if (!parent) {
        throw new NotFoundException('Parent category was not found.');
      }

      if (parent.parentId !== null) {
        throw new BadRequestException(
          'A category can have only one level of subcategories.',
        );
      }
    }

    return this.database.db.transaction(async (transaction) => {
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
  ): Promise<Category> {
    const parsed = updateCategorySchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid category payload.');
    }

    const current = await this.findCategory(id);

    if (!current) {
      throw new NotFoundException('Category was not found.');
    }

    const changes = parsed.data;
    await this.validateCategoryParentChange(current, changes.parentId);

    if (changes.slug && changes.slug !== current.slug) {
      await this.assertCategorySlugAvailable(changes.slug, current.id);
    }

    return this.database.db.transaction(async (transaction) => {
      const updated = await transaction
        .update(categories)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(categories.id, id))
        .returning();
      const category = updated[0];

      if (!category) {
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

  async deleteCategory(id: string, actor: AuthenticatedAdmin): Promise<void> {
    const current = await this.findCategory(id);
    if (!current) throw new NotFoundException('Category was not found.');

    const [child, product] = await Promise.all([
      this.database.db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, id))
        .limit(1),
      this.database.db
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

    await this.database.db.transaction(async (transaction) => {
      await transaction.delete(categories).where(eq(categories.id, id));
      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'category.deleted',
        entityType: 'category',
        entityId: id,
        payload: { slug: current.slug, parentId: current.parentId },
      });
    });
  }

  async listProducts(): Promise<Product[]> {
    return this.database.db
      .select()
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.title));
  }

  async listDestinations(): Promise<Destination[]> {
    return this.database.db
      .select()
      .from(destinations)
      .orderBy(asc(destinations.sortOrder), asc(destinations.name));
  }

  async createDestination(
    actor: AuthenticatedAdmin,
    input: unknown,
  ): Promise<Destination> {
    const parsed = createDestinationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Invalid destination payload.');
    }

    return this.database.db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(destinations)
        .values(parsed.data)
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
        payload: { slug: destination.slug },
      });
      return destination;
    });
  }

  async updateDestination(
    id: string,
    actor: AuthenticatedAdmin,
    input: unknown,
  ): Promise<Destination> {
    const parsed = updateDestinationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Invalid destination payload.');
    }

    const current = await this.findDestination(id);
    if (!current) throw new NotFoundException('Destination was not found.');
    const changes = parsed.data;
    if (changes.slug && changes.slug !== current.slug) {
      await this.assertDestinationSlugAvailable(changes.slug, current.id);
    }

    return this.database.db.transaction(async (transaction) => {
      const updated = await transaction
        .update(destinations)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(destinations.id, id))
        .returning();
      const destination = updated[0];
      if (!destination)
        throw new NotFoundException('Destination was not found.');

      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'destination.updated',
        entityType: 'destination',
        entityId: destination.id,
        payload: { changedFields: Object.keys(changes) },
      });
      return destination;
    });
  }

  async deleteDestination(
    id: string,
    actor: AuthenticatedAdmin,
  ): Promise<void> {
    const current = await this.findDestination(id);
    if (!current) throw new NotFoundException('Destination was not found.');
    const linkedProduct = await this.database.db
      .select({ productId: productDestinations.productId })
      .from(productDestinations)
      .where(eq(productDestinations.destinationId, id))
      .limit(1);
    if (linkedProduct[0]) {
      throw new ConflictException(
        'A destination with products cannot be deleted.',
      );
    }

    await this.database.db.transaction(async (transaction) => {
      await transaction.delete(destinations).where(eq(destinations.id, id));
      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'destination.deleted',
        entityType: 'destination',
        entityId: id,
        payload: { slug: current.slug },
      });
    });
  }

  async upsertProductDestination(
    destinationId: string,
    productId: string,
    actor: AuthenticatedAdmin,
    input: unknown,
  ): Promise<ProductDestination> {
    const parsed = upsertProductDestinationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Invalid destination product payload.');
    }
    const [destination, product] = await Promise.all([
      this.findDestination(destinationId),
      this.findProduct(productId),
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

    return this.database.db.transaction(async (transaction) => {
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
  ): Promise<void> {
    await this.database.db.transaction(async (transaction) => {
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
    const records = await this.database.db
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
      .orderBy(asc(destinations.sortOrder), asc(destinations.name));

    const result = new Map<string, PublicDestination>();
    for (const { destination } of records) {
      const current = result.get(destination.id);
      result.set(destination.id, {
        id: destination.id,
        name: destination.name,
        slug: destination.slug,
        region: destination.region,
        description: destination.description,
        imageUrl: destination.imageUrl,
        productCount: (current?.productCount ?? 0) + 1,
      });
    }
    return [...result.values()];
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
    if (records.length === 0) {
      throw new NotFoundException('Destination was not found.');
    }
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
  ): Promise<Product> {
    const parsed = createProductSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid product payload.');
    }

    const command = parsed.data;
    const category = await this.findCategory(command.categoryId);

    if (!category) {
      throw new NotFoundException('Product category was not found.');
    }

    const productId = photo ? randomUUID() : undefined;
    const stored =
      photo && productId ? await this.media.store(productId, photo) : null;
    try {
      return await this.database.db.transaction(async (transaction) => {
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
  ): Promise<Product> {
    const parsed = updateProductSchema.safeParse(input);

    if (!parsed.success) {
      throw new BadRequestException('Invalid product payload.');
    }

    const current = await this.findProduct(id);

    if (!current) {
      throw new NotFoundException('Product was not found.');
    }

    const changes = parsed.data;
    const type = changes.type ?? current.type;
    const priceMinor = changes.priceMinor ?? current.priceMinor;
    const currency = changes.currency ?? current.currency;

    if (type !== 'booking' && (priceMinor == null || currency == null)) {
      throw new BadRequestException(
        'Payable products require priceMinor and currency.',
      );
    }

    if (changes.categoryId && changes.categoryId !== current.categoryId) {
      const category = await this.findCategory(changes.categoryId);

      if (!category) {
        throw new NotFoundException('Product category was not found.');
      }
    }

    if (changes.slug && changes.slug !== current.slug) {
      await this.assertProductSlugAvailable(changes.slug, current.id);
    }

    const stored = photo ? await this.media.store(current.id, photo) : null;
    try {
      const product = await this.database.db.transaction(
        async (transaction) => {
          const updated = await transaction
            .update(products)
            .set({
              ...changes,
              ...(stored ? { imageUrl: stored.imageUrl } : {}),
              updatedAt: new Date(),
            })
            .where(eq(products.id, id))
            .returning();
          const product = updated[0];

          if (!product) {
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

  async deleteProduct(id: string, actor: AuthenticatedAdmin): Promise<void> {
    const current = await this.findProduct(id);
    if (!current) throw new NotFoundException('Product was not found.');

    const [linkedOrder, linkedDestination] = await Promise.all([
      this.database.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.productId, id))
        .limit(1),
      this.database.db
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

    await this.database.db.transaction(async (transaction) => {
      await transaction.delete(products).where(eq(products.id, id));
      await transaction.insert(auditLog).values({
        actorId: actor.actorId,
        action: 'product.deleted',
        entityType: 'product',
        entityId: id,
        payload: { slug: current.slug, categoryId: current.categoryId },
      });
    });

    const key = current.imageUrl
      ? this.media.objectKeyFromManagedImageUrl(current.imageUrl)
      : null;
    if (key) await this.media.deleteObject(key).catch(() => undefined);
  }

  private async findCategory(id: string): Promise<Category | undefined> {
    const result = await this.database.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return result[0];
  }

  private async findProduct(id: string): Promise<Product | undefined> {
    const result = await this.database.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    return result[0];
  }

  private async findDestination(id: string): Promise<Destination | undefined> {
    const result = await this.database.db
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
  ): Promise<void> {
    if (parentId === undefined || parentId === category.parentId) {
      return;
    }

    if (parentId === category.id) {
      throw new BadRequestException('A category cannot be its own parent.');
    }

    if (parentId !== null) {
      const parent = await this.findCategory(parentId);

      if (!parent) {
        throw new NotFoundException('Parent category was not found.');
      }

      if (parent.parentId !== null) {
        throw new BadRequestException(
          'A category can have only one level of subcategories.',
        );
      }

      const child = await this.database.db
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
  ): Promise<void> {
    const existing = await this.database.db
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
  ): Promise<void> {
    const existing = await this.database.db
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
  ): Promise<void> {
    const existing = await this.database.db
      .select({ id: destinations.id })
      .from(destinations)
      .where(and(eq(destinations.slug, slug), ne(destinations.id, id)))
      .limit(1);

    if (existing[0]) {
      throw new ConflictException('Destination slug already exists.');
    }
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
