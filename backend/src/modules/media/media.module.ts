import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import type { AppEnv } from '../../config/env.js';
import { MinioProductMediaStorage } from './minio-product-media.storage.js';
import {
  ProductMediaService,
  type ProductMediaStorage,
} from './product-media.service.js';

export const PRODUCT_MEDIA_STORAGE = Symbol('PRODUCT_MEDIA_STORAGE');

@Module({
  providers: [
    {
      provide: PRODUCT_MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>): ProductMediaStorage =>
        new MinioProductMediaStorage(
          new S3Client({
            endpoint: config.get('MINIO_ENDPOINT', { infer: true }),
            forcePathStyle: true,
            region: 'us-east-1',
            credentials: {
              accessKeyId: config.get('MINIO_ACCESS_KEY', { infer: true }),
              secretAccessKey: config.get('MINIO_SECRET_KEY', { infer: true }),
            },
          }),
          config.get('MINIO_BUCKET', { infer: true }),
        ),
    },
    {
      provide: ProductMediaService,
      inject: [PRODUCT_MEDIA_STORAGE, ConfigService],
      useFactory: (
        storage: ProductMediaStorage,
        config: ConfigService<AppEnv, true>,
      ) =>
        new ProductMediaService(
          storage,
          config.get('MEDIA_PUBLIC_BASE_URL', { infer: true }),
        ),
    },
  ],
  exports: [ProductMediaService, PRODUCT_MEDIA_STORAGE],
})
export class MediaModule {}
