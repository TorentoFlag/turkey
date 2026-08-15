import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { DatabaseService } from '../../database/database.service.js';
import {
  catalogProtocolUploads,
  type Category,
  type Destination,
  type Product,
} from '../../database/schema/index.js';
import type { AuthenticatedAdmin } from '../admin-api/admin-api-auth.js';
import {
  CatalogService,
  type CatalogDestination,
  type CatalogExecutor,
} from '../catalog/catalog.service.js';
import {
  ProductMediaService,
  type ProductPhotoUpload,
} from '../media/product-media.service.js';
import type { AuthenticatedProtocolActor } from './protocol-auth.js';
import { ProtocolOperationsService } from './protocol-operations.service.js';
import {
  CatalogProtocolError,
  createProtocolCategorySchema,
  createProtocolDestinationSchema,
  createProtocolProductSchema,
  destinationMembershipSchema,
  encodeCursor,
  parseCursor,
  parseLimit,
  toCatalogProblem,
  updateProtocolCategorySchema,
  updateProtocolDestinationSchema,
  updateProtocolOfferSchema,
  updateProtocolProductSchema,
  type CatalogMedia,
  type ProtocolCategoryCreate,
  type ProtocolCategoryUpdate,
  type ProtocolDestinationCreate,
  type ProtocolDestinationUpdate,
  type ProtocolOfferUpdate,
  type ProtocolProductCreate,
  type ProtocolProductUpdate,
} from './catalog-protocol.schemas.js';

const uploadLifetimeMs = 24 * 60 * 60 * 1_000;

export type ProtocolResponse = Readonly<{
  body: unknown;
  status: number;
  etag?: string;
  problem?: boolean;
}>;

type MutationContext = Readonly<{
  actor: AuthenticatedProtocolActor;
  request: FastifyRequest;
}>;

type DeleteResource = 'category' | 'product' | 'destination';

@Injectable()
export class CatalogProtocolService {
  constructor(
    private readonly database: DatabaseService,
    private readonly catalog: CatalogService,
    private readonly operations: ProtocolOperationsService,
    private readonly media: ProductMediaService,
  ) {}

  getCapabilities() {
    return turkiyeCatalogCapability;
  }

  async listCategories(query: Record<string, string | undefined>) {
    const items = (await this.catalog.listCategories())
      .filter(
        (category) =>
          query.parentId === undefined ||
          category.parentId ===
            (query.parentId === 'null' ? null : query.parentId),
      )
      .map((category) => this.toCategory(category));
    return paginate(items, query);
  }

  async getCategory(id: string): Promise<ProtocolResponse> {
    const category = await this.catalog.getCategory(id);
    if (!category) throw new NotFoundException('Category was not found.');
    return resourceResponse(this.toCategory(category));
  }

  async createCategory(
    context: MutationContext,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(createProtocolCategorySchema, input);
    return this.mutate(context, 201, async (actor, executor) => {
      const media = await this.resolveMedia(
        command.image,
        context.actor.siteKey,
        executor,
        false,
      );
      const category = await this.catalog.createCategory(
        actor,
        toCategoryCommand(command, media?.url ?? null),
        { executor },
      );
      return this.toCategory(category);
    });
  }

  async updateCategory(
    context: MutationContext,
    id: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(updateProtocolCategorySchema, input);
    return this.mutate(context, 200, async (actor, executor) => {
      const media =
        command.image === undefined
          ? undefined
          : await this.resolveMedia(
              command.image,
              context.actor.siteKey,
              executor,
              false,
            );
      const category = await this.catalog.updateCategory(
        id,
        actor,
        toCategoryUpdateCommand(command, media),
        { executor, expectedRevision },
      );
      return this.toCategory(category);
    });
  }

  async listProducts(query: Record<string, string | undefined>) {
    const normalizedQuery = query.query?.trim().toLocaleLowerCase('ru');
    const items = (await this.catalog.listProducts())
      .filter(
        (product) =>
          (query.categoryId === undefined ||
            product.categoryId === query.categoryId) &&
          (!normalizedQuery ||
            product.title.toLocaleLowerCase('ru').includes(normalizedQuery) ||
            product.slug.includes(normalizedQuery)),
      )
      .map((product) => this.toProduct(product));
    return paginate(items, query);
  }

  async getProduct(id: string): Promise<ProtocolResponse> {
    const product = await this.catalog.getProduct(id);
    if (!product) throw new NotFoundException('Product was not found.');
    return resourceResponse(this.toProduct(product));
  }

  async createProduct(
    context: MutationContext,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(createProtocolProductSchema, input);
    return this.mutate(context, 201, async (actor, executor) => {
      const media = await this.resolveSingleProductMedia(
        command.media,
        context.actor.siteKey,
        executor,
      );
      const product = await this.catalog.createProduct(
        actor,
        toProductCommand(command, media?.url ?? null),
        null,
        { executor },
      );
      if (media?.uploadId) {
        await this.consumeUpload(
          media.uploadId,
          context.actor.siteKey,
          executor,
        );
      }
      return this.toProduct(product);
    });
  }

  async updateProduct(
    context: MutationContext,
    id: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(updateProtocolProductSchema, input);
    return this.mutate(context, 200, async (actor, executor) => {
      const media =
        command.media === undefined
          ? undefined
          : await this.resolveSingleProductMedia(
              command.media,
              context.actor.siteKey,
              executor,
            );
      const product = await this.catalog.updateProduct(
        id,
        actor,
        toProductUpdateCommand(command, media),
        null,
        { executor, expectedRevision },
      );
      if (media?.uploadId) {
        await this.consumeUpload(
          media.uploadId,
          context.actor.siteKey,
          executor,
        );
      }
      return this.toProduct(product);
    });
  }

  async listOffers(query: Record<string, string | undefined>) {
    if (query.sellerId !== undefined) return { items: [], nextCursor: null };
    const items = (await this.catalog.listProducts())
      .filter(
        (product) =>
          query.productId === undefined || product.id === query.productId,
      )
      .map(toOffer);
    return paginate(items, query);
  }

  async getOffer(id: string): Promise<ProtocolResponse> {
    const product = await this.catalog.getProduct(id);
    if (!product) throw new NotFoundException('Offer was not found.');
    return resourceResponse(toOffer(product));
  }

  async createOffer(context: MutationContext): Promise<ProtocolResponse> {
    return this.mutate(context, 201, async () => {
      throw new CatalogProtocolError(
        409,
        'catalog/conflict',
        'Turkiye products already own their default offer.',
      );
    });
  }

  async deleteOffer(
    context: MutationContext,
    id: string,
    expectedRevision: number,
  ): Promise<ProtocolResponse> {
    return this.mutate(context, 200, async (_actor, executor) => {
      const product = await this.catalog.getProduct(id, executor);
      if (!product) throw new NotFoundException('Offer was not found.');
      if (product.revision !== expectedRevision) {
        throw new CatalogProtocolError(
          412,
          'catalog/revision-conflict',
          'Resource revision has changed.',
        );
      }
      throw new CatalogProtocolError(
        409,
        'catalog/conflict',
        'A Turkiye default offer cannot be deleted independently.',
      );
    });
  }

  async updateOffer(
    context: MutationContext,
    id: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(updateProtocolOfferSchema, input);
    return this.mutate(context, 200, async (actor, executor) => {
      const product = await this.catalog.updateProduct(
        id,
        actor,
        toOfferUpdateCommand(command),
        null,
        { executor, expectedRevision },
      );
      return toOffer(product);
    });
  }

  async listDestinations(query: Record<string, string | undefined>) {
    const normalizedQuery = query.query?.trim().toLocaleLowerCase('ru');
    const items = (await this.catalog.listDestinations())
      .filter(
        (destination) =>
          !normalizedQuery ||
          destination.name.toLocaleLowerCase('ru').includes(normalizedQuery) ||
          destination.slug.includes(normalizedQuery),
      )
      .map((destination) => this.toDestination(destination));
    return paginate(items, query);
  }

  async getDestination(id: string): Promise<ProtocolResponse> {
    const destination = await this.catalog.getDestination(id);
    if (!destination) throw new NotFoundException('Destination was not found.');
    return resourceResponse(this.toDestination(destination));
  }

  async createDestination(
    context: MutationContext,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(createProtocolDestinationSchema, input);
    return this.mutate(context, 201, async (actor, executor) => {
      const media = await this.resolveMedia(
        command.image,
        context.actor.siteKey,
        executor,
        true,
      );
      const destination = await this.catalog.createDestination(
        actor,
        toDestinationCommand(command, media?.url ?? null),
        null,
        { executor },
      );
      if (media?.uploadId) {
        await this.consumeUpload(
          media.uploadId,
          context.actor.siteKey,
          executor,
        );
      }
      return this.toDestination({ ...destination, products: [] });
    });
  }

  async updateDestination(
    context: MutationContext,
    id: string,
    expectedRevision: number,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(updateProtocolDestinationSchema, input);
    return this.mutate(context, 200, async (actor, executor) => {
      const media =
        command.image === undefined
          ? undefined
          : await this.resolveMedia(
              command.image,
              context.actor.siteKey,
              executor,
              true,
            );
      const destination = await this.catalog.updateDestination(
        id,
        actor,
        toDestinationUpdateCommand(command, media),
        null,
        { executor, expectedRevision },
      );
      if (media?.uploadId) {
        await this.consumeUpload(
          media.uploadId,
          context.actor.siteKey,
          executor,
        );
      }
      const full = await this.catalog.getDestination(id, executor);
      return this.toDestination(full ?? { ...destination, products: [] });
    });
  }

  async upsertDestinationProduct(
    context: MutationContext,
    destinationId: string,
    productId: string,
    input: unknown,
  ): Promise<ProtocolResponse> {
    const command = parseInput(destinationMembershipSchema, input);
    return this.mutate(context, 200, async (actor, executor) =>
      this.catalog.upsertProductDestination(
        destinationId,
        productId,
        actor,
        command,
        { executor },
      ),
    );
  }

  async deleteDestinationProduct(
    context: MutationContext,
    destinationId: string,
    productId: string,
  ): Promise<ProtocolResponse> {
    return this.mutate(context, 200, async (actor, executor) => {
      await this.catalog.deleteProductDestination(
        destinationId,
        productId,
        actor,
        { executor },
      );
      return { destinationId, productId, deleted: true };
    });
  }

  async deleteResource(
    context: MutationContext,
    resourceType: DeleteResource,
    id: string,
    expectedRevision: number,
    dryRun: boolean,
  ): Promise<ProtocolResponse> {
    return this.mutate(context, 200, async (actor, executor) => {
      const result = await this.inspectDeletion(
        resourceType,
        id,
        expectedRevision,
        executor,
      );
      if (!dryRun && !result.permitted) {
        throw new CatalogProtocolError(
          409,
          'catalog/conflict',
          'Catalog resource has blocking references.',
        );
      }
      if (!dryRun) {
        await this.performDelete(
          resourceType,
          id,
          actor,
          expectedRevision,
          executor,
        );
      }
      return { result: { ...result, dryRun } };
    });
  }

  async uploadMedia(
    context: MutationContext,
    upload: ProductPhotoUpload,
  ): Promise<ProtocolResponse> {
    const uploadId = randomUUID();
    let storedObjectKey: string | undefined;
    try {
      return await this.mutate(context, 201, async (_actor, executor) => {
        const stored = await this.media.storeProtocolUpload(uploadId, upload);
        storedObjectKey = stored.objectKey;
        try {
          await executor.insert(catalogProtocolUploads).values({
            id: uploadId,
            siteKey: context.actor.siteKey,
            actorId: context.actor.actorId,
            objectKey: stored.objectKey,
            mimeType: 'image/webp',
            byteCount: upload.byteLength,
            expiresAt: new Date(Date.now() + uploadLifetimeMs),
          });
          return { id: uploadId, url: stored.imageUrl, alt: null };
        } catch (error) {
          await this.media
            .deleteObject(stored.objectKey)
            .catch(() => undefined);
          storedObjectKey = undefined;
          throw error;
        }
      });
    } catch (error) {
      if (storedObjectKey) {
        await this.media.deleteObject(storedObjectKey).catch(() => undefined);
      }
      throw error;
    }
  }

  async getOperation(
    siteKey: string,
    operationId: string,
  ): Promise<ProtocolResponse> {
    const response = await this.operations.getCompleted(siteKey, operationId);
    if (!response) {
      throw new NotFoundException('Protocol operation was not found.');
    }
    return {
      body: response.body,
      status: response.status,
      etag: responseEtag(response.body),
      problem: isProblemBody(response.body),
    };
  }

  private async mutate<T>(
    context: MutationContext,
    successStatus: number,
    command: (
      actor: AuthenticatedAdmin,
      executor: CatalogExecutor,
    ) => Promise<T>,
  ): Promise<ProtocolResponse> {
    const idempotencyKey = context.actor.idempotencyKey;
    if (!idempotencyKey) {
      throw new CatalogProtocolError(
        400,
        'catalog/invalid-request',
        'Idempotency key is required.',
      );
    }
    const rawBody = context.request.rawBody ?? Buffer.alloc(0);
    const requestFingerprint = createHash('sha256')
      .update(context.request.method.toUpperCase())
      .update('\0')
      .update(context.request.url)
      .update('\0')
      .update(rawBody)
      .digest('hex');

    return this.database.db.transaction(async (transaction) => {
      const begin = await this.operations.begin(
        {
          actorId: context.actor.actorId,
          idempotencyKey,
          method: context.request.method,
          path: context.request.url,
          requestFingerprint,
          requestId: context.actor.requestId,
          siteKey: context.actor.siteKey,
        },
        transaction,
      );
      if (begin.state !== 'in_progress') {
        return {
          body: begin.response.body,
          status: begin.response.status,
          etag: responseEtag(begin.response.body),
          problem: begin.state === 'failed',
        };
      }
      if (!begin.owned) {
        const problem = toCatalogProblem(
          new CatalogProtocolError(
            409,
            'catalog/operation-in-progress',
            'Catalog operation is already in progress.',
          ),
          begin.operation.id,
        );
        return { body: problem.body, status: problem.status, problem: true };
      }

      try {
        const resource = await transaction.transaction((savepoint) =>
          command({ actorId: context.actor.actorId }, savepoint),
        );
        const body = { operationId: begin.operation.id, resource };
        await this.operations.complete(
          begin.operation,
          { body, status: successStatus },
          transaction,
        );
        return {
          body,
          status: successStatus,
          etag: responseEtag(body),
        };
      } catch (error) {
        const problem = toCatalogProblem(error, begin.operation.id);
        await this.operations.fail(
          begin.operation,
          { body: problem.body, status: problem.status },
          transaction,
        );
        return { body: problem.body, status: problem.status, problem: true };
      }
    });
  }

  private async resolveSingleProductMedia(
    media: readonly CatalogMedia[],
    siteKey: string,
    executor: CatalogExecutor,
  ) {
    if (media.length === 0) return null;
    return this.resolveMedia(media[0]!, siteKey, executor, true);
  }

  private async resolveMedia(
    media: CatalogMedia | null,
    siteKey: string,
    executor: CatalogExecutor,
    allowUpload: boolean,
  ): Promise<Readonly<{ url: string; uploadId?: string }> | null> {
    if (media === null) return null;
    const managedKey = this.media.objectKeyFromManagedImageUrl(media.url);
    if (!managedKey) return { url: media.url };
    if (!allowUpload) {
      throw new CatalogProtocolError(
        400,
        'catalog/invalid-media',
        'Managed uploads are not supported for this resource.',
      );
    }
    const upload = (
      await executor
        .select()
        .from(catalogProtocolUploads)
        .where(
          and(
            eq(catalogProtocolUploads.id, media.id),
            eq(catalogProtocolUploads.objectKey, managedKey),
            eq(catalogProtocolUploads.siteKey, siteKey),
            isNull(catalogProtocolUploads.consumedAt),
            gt(catalogProtocolUploads.expiresAt, new Date()),
          ),
        )
        .limit(1)
    )[0];
    if (!upload) {
      throw new CatalogProtocolError(
        400,
        'catalog/invalid-media',
        'Managed upload reference is invalid or expired.',
      );
    }
    return { url: media.url, uploadId: upload.id };
  }

  private async consumeUpload(
    uploadId: string,
    siteKey: string,
    executor: CatalogExecutor,
  ): Promise<void> {
    const consumed = await executor
      .update(catalogProtocolUploads)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(catalogProtocolUploads.id, uploadId),
          eq(catalogProtocolUploads.siteKey, siteKey),
          isNull(catalogProtocolUploads.consumedAt),
          gt(catalogProtocolUploads.expiresAt, new Date()),
        ),
      )
      .returning({ id: catalogProtocolUploads.id });
    if (!consumed[0]) {
      throw new CatalogProtocolError(
        400,
        'catalog/invalid-media',
        'Managed upload reference is invalid or expired.',
      );
    }
  }

  private toCategory(category: Category) {
    return {
      id: category.id,
      revision: String(category.revision),
      parentId: category.parentId,
      name: { ru: category.name },
      slug: category.slug,
      image: toMedia(category.imageUrl),
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    };
  }

  private toProduct(product: Product) {
    return {
      id: product.id,
      revision: String(product.revision),
      categoryId: product.categoryId,
      title: { ru: product.title },
      slug: product.slug,
      description: product.description ? { ru: product.description } : null,
      media: product.imageUrl ? [toMedia(product.imageUrl)] : [],
      sortOrder: product.sortOrder,
      isActive: product.isActive,
      attributes: { type: product.type },
    };
  }

  private toDestination(destination: CatalogDestination) {
    return {
      id: destination.id,
      revision: String(destination.revision),
      name: { ru: destination.name },
      slug: destination.slug,
      description: { ru: destination.description },
      image: toMedia(destination.imageUrl),
      sortOrder: destination.sortOrder,
      isActive: destination.isActive,
      attributes: { region: destination.region },
      products: destination.products.map((membership) => ({
        productId: membership.productId,
        sortOrder: membership.sortOrder,
      })),
    };
  }

  private async inspectDeletion(
    resourceType: DeleteResource,
    id: string,
    expectedRevision: number,
    executor: CatalogExecutor,
  ) {
    const resource = await this.getDeletionResource(resourceType, id, executor);
    if (!resource)
      throw new NotFoundException('Catalog resource was not found.');
    if (resource.revision !== expectedRevision) {
      throw new CatalogProtocolError(
        412,
        'catalog/revision-conflict',
        'Resource revision has changed.',
      );
    }
    const blockingReferences =
      resourceType === 'category'
        ? await this.catalog.inspectCategoryDeletion(id, executor)
        : resourceType === 'product'
          ? await this.catalog.inspectProductDeletion(id, executor)
          : await this.catalog.inspectDestinationDeletion(id, executor);
    const permitted = Object.values(blockingReferences).every(
      (total) => total === 0,
    );
    return { resourceType, resourceId: id, permitted, blockingReferences };
  }

  private getDeletionResource(
    resourceType: DeleteResource,
    id: string,
    executor: CatalogExecutor,
  ): Promise<Category | Product | Destination | undefined> {
    if (resourceType === 'category')
      return this.catalog.getCategory(id, executor);
    if (resourceType === 'product')
      return this.catalog.getProduct(id, executor);
    return this.catalog.getDestination(id, executor);
  }

  private async performDelete(
    resourceType: DeleteResource,
    id: string,
    actor: AuthenticatedAdmin,
    expectedRevision: number,
    executor: CatalogExecutor,
  ): Promise<void> {
    const options = { executor, expectedRevision };
    if (resourceType === 'category') {
      return this.catalog.deleteCategory(id, actor, options);
    }
    if (resourceType === 'product') {
      return this.catalog.deleteProduct(id, actor, options);
    }
    return this.catalog.deleteDestination(id, actor, options);
  }
}

const productTypeSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      title: 'Тип товара',
      enum: ['auto_delivery', 'physical', 'booking'],
    },
  },
  required: ['type'],
} as const;

export const turkiyeCatalogCapability = {
  version: 1,
  baseUrl: 'https://turkeyplanners.com/api/admin/integration/catalog/v1',
  auth: { scheme: 'vv_hmac_v1' },
  locales: ['ru'],
  categories: {
    enabled: true,
    maxDepth: 2,
    fields: ['name', 'slug', 'imageUrl', 'sortOrder', 'isActive'],
    deletion: { mode: 'cascade_unpaid_technical_orders', dryRun: true },
  },
  resources: {
    products: {
      enabled: true,
      categoryRequired: true,
      schema: productTypeSchema,
    },
    offers: {
      enabled: true,
      requiredForPurchasableProduct: true,
      schema: productTypeSchema,
    },
    destinations: {
      enabled: true,
      orderedProductMembership: true,
      schema: {
        type: 'object',
        properties: { region: { type: 'string', title: 'Регион' } },
        required: ['region'],
      },
    },
    sellers: { enabled: false, mode: 'none' },
    collections: { enabled: false },
  },
  media: {
    mode: 'url_or_upload',
    maxBytes: 5_242_880,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
} as const;

function parseInput<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new CatalogProtocolError(
      400,
      'catalog/invalid-request',
      'Catalog request is invalid.',
    );
  }
  return result.data;
}

function paginate<T>(
  items: readonly T[],
  query: Record<string, string | undefined>,
) {
  const offset = parseCursor(query.cursor);
  const limit = parseLimit(query.limit);
  const page = items.slice(offset, offset + limit);
  return {
    items: page,
    nextCursor:
      offset + page.length < items.length
        ? encodeCursor(offset + page.length)
        : null,
  };
}

function resourceResponse(resource: { revision: string }): ProtocolResponse {
  return { body: { resource }, status: 200, etag: `"${resource.revision}"` };
}

function responseEtag(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('resource' in body))
    return undefined;
  const resource = body.resource;
  if (!resource || typeof resource !== 'object' || !('revision' in resource)) {
    return undefined;
  }
  return typeof resource.revision === 'string'
    ? `"${resource.revision}"`
    : undefined;
}

function isProblemBody(body: unknown): boolean {
  return Boolean(
    body && typeof body === 'object' && 'type' in body && 'status' in body,
  );
}

function toCategoryCommand(
  command: ProtocolCategoryCreate,
  imageUrl: string | null,
) {
  return {
    parentId: command.parentId,
    name: command.name.ru,
    slug: command.slug,
    imageUrl,
    sortOrder: command.sortOrder,
    isActive: command.isActive,
  };
}

function toCategoryUpdateCommand(
  command: ProtocolCategoryUpdate,
  media: Readonly<{ url: string }> | null | undefined,
) {
  return {
    ...(command.parentId !== undefined ? { parentId: command.parentId } : {}),
    ...(command.name !== undefined ? { name: command.name.ru } : {}),
    ...(command.slug !== undefined ? { slug: command.slug } : {}),
    ...(command.image !== undefined ? { imageUrl: media?.url ?? null } : {}),
    ...(command.sortOrder !== undefined
      ? { sortOrder: command.sortOrder }
      : {}),
    ...(command.isActive !== undefined ? { isActive: command.isActive } : {}),
  };
}

function toProductCommand(
  command: ProtocolProductCreate,
  imageUrl: string | null,
) {
  return {
    categoryId: command.categoryId,
    title: command.title.ru,
    slug: command.slug,
    description: command.description?.ru ?? '',
    imageUrl,
    type: command.attributes.type,
    priceMinor: null,
    currency: null,
    sortOrder: command.sortOrder,
    isActive: command.isActive,
  };
}

function toProductUpdateCommand(
  command: ProtocolProductUpdate,
  media: Readonly<{ url: string }> | null | undefined,
) {
  return {
    ...(command.categoryId !== undefined
      ? { categoryId: command.categoryId }
      : {}),
    ...(command.title !== undefined ? { title: command.title.ru } : {}),
    ...(command.slug !== undefined ? { slug: command.slug } : {}),
    ...(command.description !== undefined
      ? { description: command.description?.ru ?? '' }
      : {}),
    ...(command.media !== undefined ? { imageUrl: media?.url ?? null } : {}),
    ...(command.attributes !== undefined
      ? { type: command.attributes.type }
      : {}),
    ...(command.sortOrder !== undefined
      ? { sortOrder: command.sortOrder }
      : {}),
    ...(command.isActive !== undefined ? { isActive: command.isActive } : {}),
  };
}

function toOfferUpdateCommand(command: ProtocolOfferUpdate) {
  return {
    ...(command.price !== undefined
      ? {
          priceMinor: command.price?.amountMinor ?? null,
          currency: command.price?.currency ?? null,
        }
      : {}),
    ...(command.isActive !== undefined ? { isActive: command.isActive } : {}),
    ...(command.attributes !== undefined
      ? { type: command.attributes.type }
      : {}),
  };
}

function toDestinationCommand(
  command: ProtocolDestinationCreate,
  imageUrl: string | null,
) {
  return {
    name: command.name.ru,
    slug: command.slug,
    region: command.attributes.region,
    description: command.description.ru,
    imageUrl,
    sortOrder: command.sortOrder,
    isActive: command.isActive,
  };
}

function toDestinationUpdateCommand(
  command: ProtocolDestinationUpdate,
  media: Readonly<{ url: string }> | null | undefined,
) {
  return {
    ...(command.name !== undefined ? { name: command.name.ru } : {}),
    ...(command.slug !== undefined ? { slug: command.slug } : {}),
    ...(command.attributes !== undefined
      ? { region: command.attributes.region }
      : {}),
    ...(command.description !== undefined
      ? { description: command.description.ru }
      : {}),
    ...(command.image !== undefined ? { imageUrl: media?.url ?? null } : {}),
    ...(command.sortOrder !== undefined
      ? { sortOrder: command.sortOrder }
      : {}),
    ...(command.isActive !== undefined ? { isActive: command.isActive } : {}),
  };
}

function toOffer(product: Product) {
  return {
    id: product.id,
    revision: String(product.revision),
    productId: product.id,
    sellerId: null,
    price:
      product.priceMinor === null || product.currency === null
        ? null
        : {
            amountMinor: product.priceMinor,
            currency: product.currency,
            scale: 100,
          },
    availability: null,
    minimumQuantity: null,
    packageQuantity: null,
    delivery: null,
    isActive: product.isActive,
    attributes: { type: product.type },
  };
}

function toMedia(imageUrl: string | null): CatalogMedia | null {
  if (!imageUrl) return null;
  const uploadMatch = imageUrl.match(
    /\/products\/uploads\/([0-9a-f-]{36})\.webp$/i,
  );
  return {
    id: uploadMatch?.[1] ?? imageUrl,
    url: imageUrl,
    alt: null,
  };
}
