import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { MinioProductMediaStorage } from '../src/modules/media/minio-product-media.storage.js';

describe('MinioProductMediaStorage', () => {
  it('writes and deletes only generated product objects in the configured bucket', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new MinioProductMediaStorage({ send } as never, 'turkiye-catalog-media');

    await storage.putWebp({ objectKey: 'products/product-1/photo.webp', body: Buffer.from('webp') });
    await storage.deleteObject('products/product-1/photo.webp');

    expect(send).toHaveBeenNthCalledWith(1, expect.any(PutObjectCommand));
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: 'turkiye-catalog-media', Key: 'products/product-1/photo.webp', ContentType: 'image/webp',
    });
    expect(send).toHaveBeenNthCalledWith(2, expect.any(DeleteObjectCommand));
    expect(send.mock.calls[1]?.[0].input).toMatchObject({
      Bucket: 'turkiye-catalog-media', Key: 'products/product-1/photo.webp',
    });
  });

  it('lists only the literal products prefix across pages', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Contents: [{ Key: 'products/product-1/a.webp', LastModified: new Date('2026-01-01') }], IsTruncated: true, NextContinuationToken: 'next' })
      .mockResolvedValueOnce({ Contents: [{ Key: 'products/product-2/b.webp', LastModified: new Date('2026-01-02') }], IsTruncated: false });
    const storage = new MinioProductMediaStorage({ send } as never, 'turkiye-catalog-media');

    await expect(storage.listProductObjects()).resolves.toEqual([
      { objectKey: 'products/product-1/a.webp', lastModified: new Date('2026-01-01') },
      { objectKey: 'products/product-2/b.webp', lastModified: new Date('2026-01-02') },
    ]);
    expect(send).toHaveBeenNthCalledWith(1, expect.any(ListObjectsV2Command));
    expect(send.mock.calls[0]?.[0].input).toMatchObject({ Bucket: 'turkiye-catalog-media', Prefix: 'products/' });
    expect(send.mock.calls[1]?.[0].input).toMatchObject({ ContinuationToken: 'next' });
  });
});
