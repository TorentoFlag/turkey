import { HttpException } from '@nestjs/common';
import { z } from 'zod';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localizedTextSchema = z.object({ ru: z.string().trim().min(1) }).strict();
const nullableLocalizedTextSchema = localizedTextSchema.nullable();

export const catalogMediaSchema = z
  .object({
    id: z.string().trim().min(1),
    url: z.url(),
    alt: nullableLocalizedTextSchema,
  })
  .strict();

export const createProtocolCategorySchema = z
  .object({
    parentId: z.uuid().nullable(),
    name: localizedTextSchema,
    slug: z.string().min(1).max(160).regex(slugPattern),
    image: catalogMediaSchema.nullable(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
    isActive: z.boolean(),
  })
  .strict();

export const updateProtocolCategorySchema = createProtocolCategorySchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const productAttributesSchema = z
  .object({
    type: z.enum(['auto_delivery', 'physical', 'booking']),
  })
  .strict();

export const createProtocolProductSchema = z
  .object({
    categoryId: z.uuid(),
    title: localizedTextSchema,
    slug: z.string().min(1).max(160).regex(slugPattern),
    description: nullableLocalizedTextSchema,
    media: z.array(catalogMediaSchema).max(1),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
    isActive: z.boolean(),
    attributes: productAttributesSchema,
  })
  .strict();

export const updateProtocolProductSchema = createProtocolProductSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const updateProtocolOfferSchema = z
  .object({
    price: z
      .object({
        amountMinor: z.number().int().positive(),
        currency: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        scale: z.literal(100),
      })
      .strict()
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
    attributes: productAttributesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

const destinationAttributesSchema = z
  .object({ region: z.string().trim().min(1).max(120) })
  .strict();

export const createProtocolDestinationSchema = z
  .object({
    name: localizedTextSchema,
    slug: z.string().min(1).max(160).regex(slugPattern),
    description: localizedTextSchema,
    image: catalogMediaSchema.nullable(),
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
    isActive: z.boolean(),
    attributes: destinationAttributesSchema,
  })
  .strict();

export const updateProtocolDestinationSchema = createProtocolDestinationSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const destinationMembershipSchema = z
  .object({
    sortOrder: z.number().int().min(-1_000_000).max(1_000_000),
  })
  .strict();

export type CatalogMedia = z.infer<typeof catalogMediaSchema>;
export type ProtocolCategoryCreate = z.infer<
  typeof createProtocolCategorySchema
>;
export type ProtocolCategoryUpdate = z.infer<
  typeof updateProtocolCategorySchema
>;
export type ProtocolProductCreate = z.infer<typeof createProtocolProductSchema>;
export type ProtocolProductUpdate = z.infer<typeof updateProtocolProductSchema>;
export type ProtocolOfferUpdate = z.infer<typeof updateProtocolOfferSchema>;
export type ProtocolDestinationCreate = z.infer<
  typeof createProtocolDestinationSchema
>;
export type ProtocolDestinationUpdate = z.infer<
  typeof updateProtocolDestinationSchema
>;

export class CatalogProtocolError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly title: string,
  ) {
    super(title);
  }
}

export function parseExpectedRevision(value: string | undefined): number {
  const match = value?.match(/^"([1-9]\d*)"$/);
  if (!match) {
    throw new CatalogProtocolError(
      428,
      'catalog/precondition-required',
      'A current If-Match revision is required.',
    );
  }
  return Number(match[1]);
}

export function parseLimit(value: string | undefined): number {
  if (value === undefined) return 50;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new CatalogProtocolError(
      400,
      'catalog/invalid-request',
      'Invalid pagination limit.',
    );
  }
  return parsed;
}

export function parseCursor(value: string | undefined): number {
  if (value === undefined) return 0;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = Number(decoded);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  } catch {
    // The stable public problem below intentionally omits the remote value.
  }
  throw new CatalogProtocolError(
    400,
    'catalog/invalid-request',
    'Invalid pagination cursor.',
  );
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

export function toCatalogProblem(
  error: unknown,
  operationId?: string,
): Readonly<{
  status: number;
  body: {
    type: string;
    title: string;
    status: number;
    operationId?: string;
  };
}> {
  const known = readKnownError(error);
  return {
    status: known.status,
    body: {
      type: known.type,
      title: known.title,
      status: known.status,
      ...(operationId ? { operationId } : {}),
    },
  };
}

function readKnownError(error: unknown): CatalogProtocolError {
  if (error instanceof CatalogProtocolError) return error;
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    'type' in error &&
    typeof error.status === 'number' &&
    typeof error.type === 'string'
  ) {
    return new CatalogProtocolError(
      error.status,
      error.type,
      safeTitleForStatus(error.status),
    );
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    return new CatalogProtocolError(
      status,
      status === 409 ? 'catalog/conflict' : 'catalog/invalid-request',
      safeTitleForStatus(status),
    );
  }
  return new CatalogProtocolError(
    500,
    'catalog/internal-error',
    'Catalog operation failed.',
  );
}

function safeTitleForStatus(status: number): string {
  if (status === 400) return 'Catalog request is invalid.';
  if (status === 404) return 'Catalog resource was not found.';
  if (status === 409) return 'Catalog operation conflicts with current state.';
  if (status === 412) return 'Resource revision has changed.';
  if (status === 428) return 'A request precondition is required.';
  return 'Catalog operation failed.';
}
