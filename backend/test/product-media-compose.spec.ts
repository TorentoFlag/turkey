import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('product media deployment topology', () => {
  it('keeps production MinIO private and provides local MinIO for development', async () => {
    const [production, development, environment] = await Promise.all([
      readFile(`${repositoryRoot}/compose.prod.yml`, 'utf8'),
      readFile(`${repositoryRoot}/compose.dev.yml`, 'utf8'),
      readFile(`${repositoryRoot}/backend/.env.example`, 'utf8'),
    ]);

    expect(production).toContain('\n  minio:');
    expect(production).toContain('\n  minio-init:');
    const minioSection = production
      .split('\n  minio-init:')[0]
      ?.split('\n  minio:')[1];
    expect(minioSection).not.toContain('\n    ports:');
    expect(production).toContain('turkiye-minio-data:/data');
    expect(production).toContain('service_completed_successfully');
    expect(development).toContain('\n  minio:');
    expect(development).toContain('127.0.0.1:9000:9000');
    expect(environment).toContain('MINIO_ENDPOINT=');
    expect(environment).toContain('MEDIA_PUBLIC_BASE_URL=');
  });
});
