import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/database/migrate.js';
import type { AppEnv } from '../src/config/env.js';
import {
  authenticateProtocolRequest,
  type ProtocolHeaders,
} from '../src/modules/integration/protocol-auth.js';
import { ProtocolOperationsService } from '../src/modules/integration/protocol-operations.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import { startPostgres } from './support/postgres.js';

const secret = 'test-vv-admin-integration-secret';
const siteKey = 'turkiye';

describe('Turkiye protocol authentication', () => {
  it('accepts a current HMAC request and rejects a modified body digest', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const body = Buffer.from('{"name":"Test"}', 'utf8');
    const validHeaders = signedHeaders({
      body,
      now,
      method: 'POST',
      path: '/api/admin/integration/catalog/v1/categories',
    });

    expect(() =>
      authenticateProtocolRequest(
        {
          headers: validHeaders,
          method: 'POST',
          path: '/api/admin/integration/catalog/v1/categories',
          rawBody: body,
        },
        secret,
        siteKey,
        now,
      ),
    ).not.toThrow();

    expect(() =>
      authenticateProtocolRequest(
        {
          headers: { ...validHeaders, 'x-vv-signature': 'sha256=bad' },
          method: 'POST',
          path: '/api/admin/integration/catalog/v1/categories',
          rawBody: body,
        },
        secret,
        siteKey,
        now,
      ),
    ).toThrow('Integration authentication failed.');
  });
});

describe('Turkiye protocol operation persistence', () => {
  let database: DatabaseService;
  let operations: ProtocolOperationsService;
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await startPostgres();
    const databaseUrl = postgres
      .getConnectionUri()
      .replace(/^postgres:/, 'postgresql:');

    await runMigrations(databaseUrl);
    database = new DatabaseService(
      new ConfigService({
        DATABASE_URL: databaseUrl,
      }) as unknown as ConfigService<AppEnv, true>,
    );
    operations = new ProtocolOperationsService(database);
  }, 120_000);

  afterAll(async () => {
    await database?.onApplicationShutdown();
    await postgres?.stop();
  }, 120_000);

  it('replays the completed response for the same idempotency key and fingerprint', async () => {
    const operation = operationInput();
    const first = await operations.begin(operation);

    expect(first.state).toBe('in_progress');

    await operations.complete(first.operation, {
      body: { resource: { id: 'category-1' } },
      status: 201,
    });

    await expect(operations.begin(operation)).resolves.toMatchObject({
      state: 'completed',
      response: {
        body: { resource: { id: 'category-1' } },
        status: 201,
      },
    });
  });

  it('rejects the same idempotency key when its request fingerprint changes', async () => {
    const operation = operationInput();
    await operations.begin(operation);

    await expect(
      operations.begin({
        ...operation,
        requestFingerprint: createHash('sha256')
          .update('changed-body')
          .digest('hex'),
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'catalog/idempotency-conflict',
    });
  });
});

function signedHeaders(input: {
  body: Buffer;
  method: string;
  now: Date;
  path: string;
}): ProtocolHeaders {
  const timestamp = input.now.toISOString();
  const requestId = randomUUID();
  const bodyDigest = createHash('sha256').update(input.body).digest('hex');
  const value = `v1.${timestamp}.${requestId}.${input.method}.${input.path}.${bodyDigest}`;

  return {
    'idempotency-key': randomUUID(),
    'x-vv-actor-id': 'vv-operator-42',
    'x-vv-request-id': requestId,
    'x-vv-signature': `sha256=${createHmac('sha256', secret).update(value).digest('hex')}`,
    'x-vv-signature-version': '1',
    'x-vv-site-key': siteKey,
    'x-vv-timestamp': timestamp,
  };
}

function operationInput() {
  const idempotencyKey = randomUUID();

  return {
    actorId: 'vv-operator-42',
    idempotencyKey,
    method: 'POST',
    path: '/api/admin/integration/catalog/v1/categories',
    requestFingerprint: createHash('sha256')
      .update(`POST:${idempotencyKey}`)
      .digest('hex'),
    requestId: randomUUID(),
    siteKey,
  };
}
