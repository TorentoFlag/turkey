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

  private async findCategory(id: string): Promise<Category | undefined> {
    const result = await this.database.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);

    return result[0];
  }
}
