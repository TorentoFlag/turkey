import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Type } from '@nestjs/common';
import { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/database/migrate.js';
import { startPostgres } from './support/postgres.js';

describe('admin catalog API', () => {
  const previousEnv = {
    adminApiKey: process.env.ADMIN_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
  };
  let app: NestFastifyApplication | undefined;
  let appModule: Type<unknown>;
  let pool: Pool;
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await startPostgres();
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.DATABASE_URL = postgres
      .getConnectionUri()
      .replace(/^postgres:/, 'postgresql:');
    process.env.LOG_LEVEL = 'warn';
    process.env.ADMIN_API_KEY = 'test-static-admin-key';
    await runMigrations(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    ({ AppModule: appModule } = await import('../src/app.module.js'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();

    restoreEnvironment('ADMIN_API_KEY', previousEnv.adminApiKey);
    restoreEnvironment('DATABASE_URL', previousEnv.databaseUrl);
    restoreEnvironment('LOG_LEVEL', previousEnv.logLevel);
    restoreEnvironment('NODE_ENV', previousEnv.nodeEnv);
    restoreEnvironment('PORT', previousEnv.port);
  });

  it('requires the static API key and actor ID before listing categories', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/categories',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).not.toHaveProperty('stack');
  });

  it('lists categories for an authenticated admin request', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/categories',
      headers: {
        'x-admin-api-key': 'test-static-admin-key',
        'x-admin-actor-id': 'manager-42',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('creates a root category and records the authenticated actor in the audit log', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/categories',
      headers: adminHeaders(),
      payload: {
        name: 'Связь',
        slug: 'connectivity',
        imageUrl: 'https://cdn.example.test/categories/connectivity.jpg',
        sortOrder: 10,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'Связь',
      slug: 'connectivity',
      parentId: null,
      sortOrder: 10,
      isActive: true,
    });

    const category = response.json<{ id: string }>();
    const audit = await pool.query<{
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
    }>(
      'select actor_id, action, entity_type, entity_id from audit_log where entity_id = $1',
      [category.id],
    );

    expect(audit.rows).toEqual([
      {
        actor_id: 'manager-42',
        action: 'category.created',
        entity_type: 'category',
        entity_id: category.id,
      },
    ]);
  });
});

function adminHeaders() {
  return {
    'x-admin-api-key': 'test-static-admin-key',
    'x-admin-actor-id': 'manager-42',
  };
}

async function createApp(
  module: Type<unknown>,
): Promise<NestFastifyApplication> {
  const { createApiApp } = await import('../src/common/app-factory.js');
  const app = await createApiApp(module);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
