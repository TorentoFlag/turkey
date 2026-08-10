import { describe, expect, it } from 'vitest';
import { CatalogMediaCleanupService } from '../src/modules/media/catalog-media-cleanup.service.js';
import {
  ProductMediaService,
  type ProductMediaStorage,
} from '../src/modules/media/product-media.service.js';

describe('CatalogMediaCleanupService', () => {
  it('deletes only stale unreferenced managed product objects', async () => {
    const referencedKey =
      'products/11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp';
    const staleKey =
      'products/22222222-2222-2222-2222-222222222222/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp';
    const recentKey =
      'products/33333333-3333-3333-3333-333333333333/cccccccc-cccc-cccc-cccc-cccccccccccc.webp';
    const storage = new FakeProductMediaStorage([
      {
        objectKey: referencedKey,
        lastModified: new Date('2026-08-09T12:00:00Z'),
      },
      { objectKey: staleKey, lastModified: new Date('2026-08-09T11:59:59Z') },
      { objectKey: recentKey, lastModified: new Date('2026-08-09T12:00:01Z') },
      {
        objectKey: 'other/unrelated.webp',
        lastModified: new Date('2026-08-01T00:00:00Z'),
      },
    ]);
    const database = {
      db: {
        select: () => ({
          from: async () => [
            {
              imageUrl: `https://turkeyplanners.test/media/${referencedKey}`,
            },
            { imageUrl: 'https://images.example.test/legacy.jpg' },
          ],
        }),
      },
    };
    const media = new ProductMediaService(
      storage,
      'https://turkeyplanners.test/media',
    );
    const service = new CatalogMediaCleanupService(
      database as never,
      media,
      storage,
    );

    await expect(
      service.runOnce(new Date('2026-08-10T12:00:00Z')),
    ).resolves.toBe(1);
    expect(storage.deleted).toEqual([staleKey]);
  });

  it('retains referenced direction covers and cleans only stale managed prefixes', async () => {
    const referencedKey =
      'destinations/11111111-1111-1111-1111-111111111111/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp';
    const staleKey =
      'destinations/22222222-2222-2222-2222-222222222222/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.webp';
    const storage = new FakeProductMediaStorage([
      {
        objectKey: referencedKey,
        lastModified: new Date('2026-08-09T12:00:00Z'),
      },
      { objectKey: staleKey, lastModified: new Date('2026-08-09T11:59:59Z') },
      {
        objectKey: 'unrelated/old.webp',
        lastModified: new Date('2026-08-01T00:00:00Z'),
      },
    ]);
    const database = {
      db: {
        select: () => ({
          from: async () => [
            {
              imageUrl: `https://turkeyplanners.test/media/${referencedKey}`,
            },
          ],
        }),
      },
    };
    const media = new ProductMediaService(
      storage,
      'https://turkeyplanners.test/media',
    );
    const service = new CatalogMediaCleanupService(
      database as never,
      media,
      storage,
    );

    await expect(
      service.runOnce(new Date('2026-08-10T12:00:00Z')),
    ).resolves.toBe(1);
    expect(storage.deleted).toEqual([staleKey]);
  });
});

class FakeProductMediaStorage implements ProductMediaStorage {
  readonly deleted: string[] = [];

  constructor(
    private readonly objects: ReadonlyArray<{
      objectKey: string;
      lastModified: Date;
    }>,
  ) {}

  async putWebp(): Promise<void> {}

  async deleteObject(objectKey: string): Promise<void> {
    this.deleted.push(objectKey);
  }

  async listCatalogObjects() {
    return this.objects;
  }
}
