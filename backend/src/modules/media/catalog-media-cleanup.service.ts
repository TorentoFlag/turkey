import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { destinations, products } from '../../database/schema/index.js';
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
    const [productRecords, destinationRecords] = await Promise.all([
      this.database.db.select({ imageUrl: products.imageUrl }).from(products),
      this.database.db
        .select({ imageUrl: destinations.imageUrl })
        .from(destinations),
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
    const objects = await this.storage.listCatalogObjects();
    let deleted = 0;

    for (const object of objects) {
      if (
        !this.media.isManagedObjectKey(object.objectKey) ||
        referencedKeys.has(object.objectKey) ||
        object.lastModified.getTime() > orphanedBefore
      ) {
        continue;
      }

      await this.storage.deleteObject(object.objectKey);
      deleted += 1;
    }

    return deleted;
  }
}
