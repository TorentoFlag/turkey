import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { ProductMediaStorage } from './product-media.service.js';

export class MinioProductMediaStorage implements ProductMediaStorage {
  constructor(
    private readonly client: Pick<S3Client, 'send'>,
    private readonly bucket: string,
  ) {}

  async putWebp(input: {
    objectKey: string;
    body: Buffer;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: 'image/webp',
      }),
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async listProductObjects(): Promise<
    ReadonlyArray<{ objectKey: string; lastModified: Date }>
  > {
    const objects: Array<{ objectKey: string; lastModified: Date }> = [];
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: 'products/',
          ContinuationToken: continuationToken,
        }),
      );

      for (const object of page.Contents ?? []) {
        if (!object.Key || !object.LastModified) continue;
        objects.push({ objectKey: object.Key, lastModified: object.LastModified });
      }

      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return objects;
  }
}
