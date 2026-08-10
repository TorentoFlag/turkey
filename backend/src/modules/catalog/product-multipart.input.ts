import { BadRequestException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { ProductPhotoUpload } from '../media/product-media.service.js';

export type ProductMutationPayload = Readonly<{
  input: unknown;
  photo: ProductPhotoUpload | null;
}>;

export async function readProductMutationPayload(
  request: FastifyRequest,
): Promise<ProductMutationPayload> {
  if (!request.isMultipart()) {
    return { input: request.body, photo: null };
  }

  let product: unknown;
  let photo: ProductPhotoUpload | null = null;

  try {
    for await (const part of request.parts()) {
      if (part.type === 'field') {
        if (part.fieldname !== 'product' || product !== undefined) {
          throw new Error('Invalid multipart fields.');
        }
        const value = Buffer.isBuffer(part.value)
          ? part.value.toString('utf8')
          : part.value;
        if (value === undefined || value === null) {
          throw new Error('Invalid multipart field value.');
        }
        product = typeof value === 'string' ? JSON.parse(value) : value;
        continue;
      }

      if (part.fieldname !== 'photo' || photo !== null) {
        throw new Error('Invalid multipart file.');
      }
      const buffer = await part.toBuffer();
      photo = { buffer, byteLength: buffer.byteLength };
    }
  } catch {
    throw new BadRequestException('Invalid product multipart payload.');
  }

  if (product === undefined) {
    throw new BadRequestException('Invalid product multipart payload.');
  }

  if (
    photo !== null &&
    product !== null &&
    typeof product === 'object' &&
    'imageUrl' in product &&
    (product as { imageUrl?: unknown }).imageUrl !== null
  ) {
    throw new BadRequestException('Invalid product multipart payload.');
  }

  return { input: product, photo };
}
