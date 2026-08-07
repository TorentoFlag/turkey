import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../../database/database.service.js';
import {
  auditLog,
  categories,
  type Category,
  products,
  type Product,
} from '../../database/schema/index.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';

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

@Injectable()
export class CatalogService {
  constructor(private readonly database: DatabaseService) {}

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

  async listProducts(): Promise<Product[]> {
    return this.database.db
      .select()
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.title));
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

  async listPublicProducts(categorySlug?: string): Promise<PublicProduct[]> {
    const categoryIds = categorySlug
      ? await this.findPublicCategoryFamily(categorySlug)
      : undefined;

    if (categoryIds && categoryIds.length === 0) {
      return [];
    }

    const records = await this.database.db
      .select({ product: products })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        categoryIds
          ? and(
              eq(products.isActive, true),
              eq(categories.isActive, true),
              inArray(products.categoryId, categoryIds),
            )
          : and(eq(products.isActive, true), eq(categories.isActive, true)),
      )
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

    return this.database.db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(products)
        .values(command)
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
        },
      });

      return product;
    });
  }

  async updateProduct(
    id: string,
    actor: AuthenticatedAdmin,
    input: unknown,
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

    return this.database.db.transaction(async (transaction) => {
      const updated = await transaction
        .update(products)
        .set({ ...changes, updatedAt: new Date() })
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
        payload: { changedFields: Object.keys(changes) },
      });

      return product;
    });
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
