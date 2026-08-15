import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import {
  catalogProtocolUploads,
  destinations,
  products,
} from '../../database/schema/index.js';
import { inArray } from 'drizzle-orm';
import { PRODUCT_MEDIA_STORAGE } from './media.constants.js';
import {
  ProductMediaService,
  type ProductMediaStorage,
} from './product-media.service.js';

const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class CatalogMediaCleanupService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProductMediaService) private readonly media: ProductMediaService,
    @Inject(PRODUCT_MEDIA_STORAGE)
    private readonly storage: ProductMediaStorage,
  ) {}

  async runOnce(now = new Date()): Promise<number> {
    const [productRecords, destinationRecords, uploadRecords] =
      await Promise.all([
        this.database.db.select({ imageUrl: products.imageUrl }).from(products),
        this.database.db
          .select({ imageUrl: destinations.imageUrl })
          .from(destinations),
        this.database.db
          .select({
            id: catalogProtocolUploads.id,
            objectKey: catalogProtocolUploads.objectKey,
            expiresAt: catalogProtocolUploads.expiresAt,
            consumedAt: catalogProtocolUploads.consumedAt,
          })
          .from(catalogProtocolUploads),
      ]);
    const records = [...productRecords, ...destinationRecords];
    const referencedKeys = new Set(
      records.flatMap(({ imageUrl }) => {
        if (!imageUrl) return [];
        const key = this.media.objectKeyFromManagedImageUrl(imageUrl);
        return key ? [key] : [];
      }),
    );
    const orphanedBefore = now.getTime() - ORPHAN_GRACE_MS;
    const protocolUploads = uploadRecords.filter(
      (upload) =>
        typeof upload.objectKey === 'string' &&
        upload.expiresAt instanceof Date,
    );
    const activeUploadKeys = new Set(
      protocolUploads
        .filter(
          (upload) =>
            upload.consumedAt === null &&
            upload.expiresAt.getTime() > now.getTime(),
        )
        .map((upload) => upload.objectKey),
    );
    const expiredUploadsByKey = new Map(
      protocolUploads
        .filter(
          (upload) =>
            upload.consumedAt === null &&
            upload.expiresAt.getTime() <= now.getTime(),
        )
        .map((upload) => [upload.objectKey, upload.id] as const),
    );
    const objects = await this.storage.listCatalogObjects();
    let deleted = 0;
    const deletedUploadIds: string[] = [];

    for (const object of objects) {
      const expiredUploadId = expiredUploadsByKey.get(object.objectKey);
      if (
        !this.media.isManagedObjectKey(object.objectKey) ||
        referencedKeys.has(object.objectKey) ||
        activeUploadKeys.has(object.objectKey) ||
        (!expiredUploadId && object.lastModified.getTime() > orphanedBefore)
      ) {
        continue;
      }

      await this.storage.deleteObject(object.objectKey);
      deleted += 1;
      if (expiredUploadId) deletedUploadIds.push(expiredUploadId);
    }

    if (deletedUploadIds.length > 0) {
      await this.database.db
        .delete(catalogProtocolUploads)
        .where(inArray(catalogProtocolUploads.id, deletedUploadIds));
    }

    return deleted;
  }
}
