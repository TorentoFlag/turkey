import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const PRODUCT_PHOTO_MAX_BYTES = 5_242_880;

export type CatalogMediaSubject = 'products' | 'destinations';

export type ProductPhotoUpload = Readonly<{
  buffer: Buffer;
  byteLength: number;
}>;

export type StoredProductPhoto = Readonly<{
  objectKey: string;
  imageUrl: string;
}>;

export interface ProductMediaStorage {
  putWebp(input: { objectKey: string; body: Buffer }): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
  listCatalogObjects(): Promise<
    ReadonlyArray<{ objectKey: string; lastModified: Date }>
  >;
}

export class ProductMediaService {
  constructor(
    private readonly storage: ProductMediaStorage,
    private readonly mediaPublicBaseUrl: string,
  ) {}

  async store(
    subject: CatalogMediaSubject,
    entityId: string,
    upload: ProductPhotoUpload,
  ): Promise<StoredProductPhoto> {
    return this.storeAtObjectKey(
      `${subject}/${entityId}/${randomUUID()}.webp`,
      upload,
    );
  }

  async storeProtocolUpload(
    uploadId: string,
    upload: ProductPhotoUpload,
  ): Promise<StoredProductPhoto> {
    return this.storeAtObjectKey(`products/uploads/${uploadId}.webp`, upload);
  }

  private async storeAtObjectKey(
    objectKey: string,
    upload: ProductPhotoUpload,
  ): Promise<StoredProductPhoto> {
    if (
      upload.byteLength !== upload.buffer.byteLength ||
      upload.byteLength > PRODUCT_PHOTO_MAX_BYTES
    ) {
      throw new BadRequestException('Invalid catalog photo.');
    }

    let body: Buffer;
    try {
      const image = sharp(upload.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      });
      const metadata = await image.metadata();

      if (
        metadata.format !== 'jpeg' &&
        metadata.format !== 'png' &&
        metadata.format !== 'webp'
      ) {
        throw new Error('Unsupported image format.');
      }

      body = await image
        .rotate()
        .resize({
          width: 2560,
          height: 2560,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Invalid catalog photo.');
    }

    await this.storage.putWebp({ objectKey, body });

    return {
      objectKey,
      imageUrl: `${this.mediaPublicBaseUrl.replace(/\/$/, '')}/${objectKey}`,
    };
  }

  isManagedImageUrl(value: string | null): boolean {
    return value !== null && this.objectKeyFromManagedImageUrl(value) !== null;
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.storage.deleteObject(objectKey);
  }

  objectKeyFromManagedImageUrl(value: string): string | null {
    const baseUrl = this.mediaPublicBaseUrl.replace(/\/$/, '');
    const prefix = `${baseUrl}/`;

    if (!value.startsWith(prefix)) {
      return null;
    }

    const key = value.slice(prefix.length);
    return this.isManagedObjectKey(key) ? key : null;
  }

  isManagedObjectKey(value: string): boolean {
    return (
      /^(products|destinations)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(
        value,
      ) || /^products\/uploads\/[0-9a-f-]{36}\.webp$/i.test(value)
    );
  }
}
