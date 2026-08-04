import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
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

  async listProducts(): Promise<Product[]> {
    return this.database.db
      .select()
      .from(products)
      .orderBy(asc(products.sortOrder), asc(products.title));
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

  private async findCategory(id: string): Promise<Category | undefined> {
    const result = await this.database.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return result[0];
  }
}
