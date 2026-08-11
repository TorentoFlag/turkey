import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('product media deployment topology', () => {
  it('binds production MinIO only for the host media proxy and provides local MinIO for development', async () => {
    const [production, development, environment, runbook] = await Promise.all([
      readFile(`${repositoryRoot}/compose.prod.yml`, 'utf8'),
      readFile(`${repositoryRoot}/compose.dev.yml`, 'utf8'),
      readFile(`${repositoryRoot}/backend/.env.example`, 'utf8'),
      readFile(
        `${repositoryRoot}/docs/development/production-runbook.md`,
        'utf8',
      ),
    ]);

    expect(production).toContain('\n  minio:');
    expect(production).toContain('\n  minio-init:');
    const minioSection = production
      .split('\n  minio-init:')[0]
      ?.split('\n  minio:')[1];
    expect(minioSection).toContain('127.0.0.1:${MINIO_BIND_PORT:-9000}:9000');
    expect(production).toContain('turkiye-minio-data:/data');
    expect(production).toContain('service_completed_successfully');
    expect(production).toContain(
      'mc admin policy attach local catalog-media-app-v2',
    );
    expect(production).toContain('"$$MINIO_BUCKET"\'/destinations/*');
    expect(development).toContain('\n  minio:');
    expect(development).toContain('127.0.0.1:${MINIO_BIND_PORT:-9000}:9000');
    expect(development).toContain(
      'mc admin policy attach local catalog-media-app-v2',
    );
    expect(development).toContain('"$$MINIO_BUCKET"\'/destinations/*');
    expect(environment).toContain('MINIO_ENDPOINT=');
    expect(environment).toContain('MEDIA_PUBLIC_BASE_URL=');
    expect(runbook).toContain('location ^~ /media/');
    expect(runbook).toContain('http://127.0.0.1:9000/turkiye-catalog-media/');
  });
});
