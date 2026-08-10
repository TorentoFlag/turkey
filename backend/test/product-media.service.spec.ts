import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  PRODUCT_PHOTO_MAX_BYTES,
  ProductMediaService,
  type ProductMediaStorage,
} from '../src/modules/media/product-media.service.js';

describe('ProductMediaService', () => {
  it('normalizes a permitted upload to a generated public WebP object', async () => {
    const tinyPng = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 12, g: 34, b: 56, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const storage = new FakeProductMediaStorage();
    const service = new ProductMediaService(
      storage,
      'https://turkeyplanners.test/media',
    );

    const stored = await service.store('product-1', {
      buffer: tinyPng,
      byteLength: tinyPng.byteLength,
    });

    expect(stored.objectKey).toMatch(
      /^products\/product-1\/[0-9a-f-]{36}\.webp$/,
    );
    expect(stored.imageUrl).toBe(
      `https://turkeyplanners.test/media/${stored.objectKey}`,
    );
    expect(storage.puts).toEqual([
      expect.objectContaining({ objectKey: stored.objectKey }),
    ]);
    expect(storage.puts[0]?.body.subarray(0, 4).toString('ascii')).toBe(
      'RIFF',
    );
  });

  it.each([
    ['an oversized file', Buffer.alloc(PRODUCT_PHOTO_MAX_BYTES + 1)],
    ['an SVG payload', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['corrupt image bytes', Buffer.from('not an image')],
  ])('rejects %s before storage write', async (_label, buffer) => {
    const storage = new FakeProductMediaStorage();
    const service = new ProductMediaService(
      storage,
      'https://turkeyplanners.test/media',
    );

    await expect(
      service.store('product-1', {
        buffer,
        byteLength: buffer.byteLength,
      }),
    ).rejects.toThrow(/photo/i);
    expect(storage.puts).toEqual([]);
  });
});

class FakeProductMediaStorage implements ProductMediaStorage {
  readonly puts: Array<{ objectKey: string; body: Buffer }> = [];

  async putWebp(input: { objectKey: string; body: Buffer }): Promise<void> {
    this.puts.push(input);
  }

  async deleteObject(): Promise<void> {}

  async listProductObjects() {
    return [];
  }
}
