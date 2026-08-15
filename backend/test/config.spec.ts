import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/turkiye_test',
  LOG_LEVEL: 'warn',
  ADMIN_API_KEY: 'test-static-admin-key',
  VV_ADMIN_INTEGRATION_SECRET: 'test-vv-admin-integration-secret',
  VV_ADMIN_INTEGRATION_SITE_KEY: 'turkiye',
  MINIO_ENDPOINT: 'http://minio:9000',
  MINIO_BUCKET: 'turkiye-catalog-media',
  MINIO_ACCESS_KEY: 'catalog-media-app',
  MINIO_SECRET_KEY: 'catalog-media-secret-for-tests',
  MEDIA_PUBLIC_BASE_URL: 'https://turkeyplanners.test/media',
};

describe('parseEnv', () => {
  it('returns typed configuration for a valid environment', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'test',
      PORT: 3001,
      DATABASE_URL: valid.DATABASE_URL,
      LOG_LEVEL: 'warn',
      ADMIN_API_KEY: valid.ADMIN_API_KEY,
      VV_ADMIN_INTEGRATION_SECRET: valid.VV_ADMIN_INTEGRATION_SECRET,
      VV_ADMIN_INTEGRATION_SITE_KEY: valid.VV_ADMIN_INTEGRATION_SITE_KEY,
      MINIO_ENDPOINT: valid.MINIO_ENDPOINT,
      MINIO_BUCKET: valid.MINIO_BUCKET,
      MINIO_ACCESS_KEY: valid.MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY: valid.MINIO_SECRET_KEY,
      MEDIA_PUBLIC_BASE_URL: valid.MEDIA_PUBLIC_BASE_URL,
      ARC_API_BASE_URL: 'https://api.arcpay.space/v1',
      AUTH_RATE_LIMIT_MAX_ATTEMPTS: 10,
      AUTH_RATE_LIMIT_WINDOW_SECONDS: 900,
      WORKER_POLL_INTERVAL_MS: 5_000,
    });
  });

  it.each([
    { ...valid, DATABASE_URL: undefined },
    { ...valid, DATABASE_URL: 'not-a-url' },
    { ...valid, PORT: '0' },
    { ...valid, NODE_ENV: 'preview' },
    { ...valid, ADMIN_API_KEY: undefined },
    { ...valid, ADMIN_API_KEY: '   ' },
    { ...valid, VV_ADMIN_INTEGRATION_SECRET: undefined },
    { ...valid, VV_ADMIN_INTEGRATION_SITE_KEY: '   ' },
    { ...valid, WORKER_POLL_INTERVAL_MS: '249' },
  ])('rejects invalid server configuration', (input) => {
    expect(() => parseEnv(input)).toThrow(/configuration/i);
  });

  it('requires a safe complete media-storage configuration', () => {
    const withoutMedia = { ...valid, MINIO_ENDPOINT: undefined };
    expect(() => parseEnv(withoutMedia)).toThrow(/configuration/i);

    expect(
      parseEnv({
        ...valid,
      }),
    ).toMatchObject({
      MINIO_ENDPOINT: 'http://minio:9000',
      MINIO_BUCKET: 'turkiye-catalog-media',
      MEDIA_PUBLIC_BASE_URL: 'https://turkeyplanners.test/media',
    });

    expect(() =>
      parseEnv({
        ...valid,
        MINIO_ENDPOINT: 'not-a-url',
        MEDIA_PUBLIC_BASE_URL: 'http://turkeyplanners.test/media',
      }),
    ).toThrow(/configuration/i);
  });
});
