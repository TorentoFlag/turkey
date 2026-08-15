import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Controller, Module, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createApiApp,
  protocolRawBodyMaxBytes,
} from '../src/common/app-factory.js';
import { runMigrations } from '../src/database/migrate.js';
import type { AppEnv } from '../src/config/env.js';
import {
  authenticateProtocolRequest,
  type ProtocolHeaders,
} from '../src/modules/integration/protocol-auth.js';
import {
  ProtocolAuthGuard,
  getProtocolActor,
} from '../src/modules/integration/protocol-auth.guard.js';
import { ProtocolOperationsService } from '../src/modules/integration/protocol-operations.service.js';
import { DatabaseService } from '../src/database/database.service.js';
import { startPostgres } from './support/postgres.js';

const secret = 'test-vv-admin-integration-secret';
const siteKey = 'turkiye';
const protocolPath = '/admin/integration/test/echo';

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

  it.each([
    '2026-08-15 12:00:00Z',
    '2026-08-15T15:00:00+03:00',
    'Fri, 15 Aug 2026 12:00:00 GMT',
    '2026-02-30T12:00:00Z',
  ])('rejects a non-strict UTC timestamp: %s', (timestamp) => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const body = Buffer.from('{}');
    const headers = signedHeaders({
      body,
      method: 'POST',
      path: protocolPath,
      timestamp,
    });

    expect(() =>
      authenticateProtocolRequest(
        { headers, method: 'POST', path: protocolPath, rawBody: body },
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

  it('rejects a reused request ID when it belongs to another idempotency key', async () => {
    const first = operationInput();
    await operations.begin(first);

    await expect(
      operations.begin({
        ...operationInput(),
        requestId: first.requestId,
      }),
    ).rejects.toMatchObject({
      status: 409,
      type: 'catalog/request-id-conflict',
    });
  });

  it('replays a completed idempotent operation with a new request ID', async () => {
    const first = operationInput();
    const started = await operations.begin(first);
    await operations.complete(started.operation, {
      body: { resource: { id: 'category-2' } },
      status: 201,
    });

    await expect(
      operations.begin({ ...first, requestId: randomUUID() }),
    ).resolves.toMatchObject({
      state: 'completed',
      response: { status: 201 },
    });
  });
});

describe('Turkiye protocol raw HTTP requests', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApiApp(ProtocolHttpTestModule);
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addContentTypeParser(
      'application/x-vv-admin-protocol-test',
      { bodyLimit: protocolRawBodyMaxBytes, parseAs: 'buffer' },
      (_request, body, done) => done(null, body),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('authenticates JSON with whitespace using its exact raw bytes', async () => {
    const body = Buffer.from('{\n  "name": "Test"\n}', 'utf8');
    const response = await app.inject({
      headers: {
        ...signedHeaders({ body, method: 'POST', path: protocolPath }),
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: body,
      url: protocolPath,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      actorId: 'vv-operator-42',
      rawBody: body.toString('base64'),
    });
  });

  it('authenticates multipart bytes and parses the restored stream once', async () => {
    const boundary = 'vv-admin-protocol-test-boundary';
    const file = Buffer.from([0, 1, 2, 255, 10]);
    const body = multipartBody(boundary, file);
    const path = '/admin/integration/test/multipart';
    const response = await app.inject({
      headers: {
        ...signedHeaders({ body, method: 'POST', path }),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      method: 'POST',
      payload: body,
      url: path,
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      rawBody: body.toString('base64'),
      upload: {
        bytes: file.toString('base64'),
        filename: 'test.bin',
        mimetype: 'application/octet-stream',
      },
    });
  });

  it('accepts exactly the protocol body limit and rejects one byte over it', async () => {
    const accepted = Buffer.alloc(protocolRawBodyMaxBytes, 0x61);
    const acceptedResponse = await app.inject({
      headers: {
        ...signedHeaders({
          body: accepted,
          method: 'POST',
          path: protocolPath,
        }),
        'content-type': 'application/x-vv-admin-protocol-test',
      },
      method: 'POST',
      payload: accepted,
      url: protocolPath,
    });

    expect(acceptedResponse.statusCode).toBe(201);
    expect(acceptedResponse.json()).toMatchObject({
      rawBodyLength: protocolRawBodyMaxBytes,
    });

    const rejected = Buffer.alloc(protocolRawBodyMaxBytes + 1, 0x61);
    const rejectedResponse = await app.inject({
      headers: {
        ...signedHeaders({
          body: rejected,
          method: 'POST',
          path: protocolPath,
        }),
        'content-type': 'application/x-vv-admin-protocol-test',
      },
      method: 'POST',
      payload: rejected,
      url: protocolPath,
    });

    expect(rejectedResponse.statusCode).toBe(413);
  });
});

function signedHeaders(input: {
  body: Buffer;
  method: string;
  path: string;
  now?: Date;
  timestamp?: string;
}): ProtocolHeaders {
  const timestamp = input.timestamp ?? (input.now ?? new Date()).toISOString();
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

function multipartBody(boundary: string, file: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      'utf8',
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
}

@Controller('/admin/integration/test')
class ProtocolHttpTestController {
  @Post('echo')
  @UseGuards(ProtocolAuthGuard)
  echo(@Req() request: FastifyRequest) {
    return {
      actorId: getProtocolActor(request).actorId,
      rawBody:
        request.rawBody && request.rawBody.length <= 1024
          ? request.rawBody.toString('base64')
          : undefined,
      rawBodyLength: request.rawBody?.length,
    };
  }

  @Post('multipart')
  @UseGuards(ProtocolAuthGuard)
  async multipart(@Req() request: FastifyRequest) {
    const upload = await request.file();

    if (!upload) {
      throw new Error('Multipart upload is missing.');
    }

    return {
      rawBody: request.rawBody?.toString('base64'),
      upload: {
        bytes: (await upload.toBuffer()).toString('base64'),
        filename: upload.filename,
        mimetype: upload.mimetype,
      },
    };
  }
}

@Module({
  controllers: [ProtocolHttpTestController],
  providers: [
    {
      provide: ConfigService,
      useValue: new ConfigService({
        VV_ADMIN_INTEGRATION_SECRET: secret,
        VV_ADMIN_INTEGRATION_SITE_KEY: siteKey,
      }) as unknown as ConfigService<AppEnv, true>,
    },
    ProtocolAuthGuard,
  ],
})
class ProtocolHttpTestModule {}

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
