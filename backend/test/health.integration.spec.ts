import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Type } from '@nestjs/common';
import { startPostgres } from './support/postgres.js';

describe('GET /health', () => {
  const previousEnv = {
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
  };
  let app: NestFastifyApplication | undefined;
  let appModule: Type<unknown>;
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await startPostgres();
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3001';
    process.env.DATABASE_URL = postgres
      .getConnectionUri()
      .replace(/^postgres:/, 'postgresql:');
    process.env.LOG_LEVEL = 'warn';

    ({ AppModule: appModule } = await import('../src/app.module.js'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await postgres?.stop();

    restoreEnvironment('DATABASE_URL', previousEnv.databaseUrl);
    restoreEnvironment('LOG_LEVEL', previousEnv.logLevel);
    restoreEnvironment('NODE_ENV', previousEnv.nodeEnv);
    restoreEnvironment('PORT', previousEnv.port);
  });

  it('returns readiness and preserves a non-empty request ID when PostgreSQL responds', async () => {
    const { createApiApp } = await import('../src/common/app-factory.js');
    app = await createApiApp(appModule);
    await ready(app);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'request-123' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBe('request-123');
  });

  it('returns sanitized unavailability when the database ping rejects', async () => {
    const { DatabaseService } = await import(
      '../src/database/database.service.js'
    );
    const { registerRequestContext } = await import(
      '../src/common/request-context.js'
    );
    const testingModule = await Test.createTestingModule({
      imports: [appModule],
    })
      .overrideProvider(DatabaseService)
      .useValue({
        ping: async () => {
          throw new Error('private database failure details');
        },
      })
      .compile();
    app = testingModule.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
      { rawBody: true },
    );
    registerRequestContext(app);
    await ready(app);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'unavailable-123' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.headers['x-request-id']).toBe('unavailable-123');
    expect(response.body).not.toContain('private database failure details');
  });

  it('generates a UUID request ID when the incoming header is blank', async () => {
    const { createApiApp } = await import('../src/common/app-factory.js');
    app = await createApiApp(appModule);
    await ready(app);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': '   ' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

async function ready(app: NestFastifyApplication): Promise<void> {
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
