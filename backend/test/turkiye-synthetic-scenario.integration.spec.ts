import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { runMigrations } from '../src/database/migrate.js';
import { startPostgres } from './support/postgres.js';

const scenarioPath =
  '/admin/integration/scenarios/checkout-payment-reached/run';

describe('Turkiye synthetic checkout scenario', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousArcSecret = process.env.ARC_SECRET_API_KEY;
  const previousWebOrigin = process.env.WEB_APP_ORIGIN;
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
    process.env.ARC_API_BASE_URL = 'https://arc.example.test/v1';
    process.env.ARC_WEBHOOK_SECRET = 'test-webhook-secret';
    await runMigrations(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ({ AppModule: appModule } = await import('../src/app.module.js'));
  });

  beforeEach(async () => {
    delete process.env.ARC_SECRET_API_KEY;
    delete process.env.WEB_APP_ORIGIN;
    await pool.query(
      'truncate table audit_log, catalog_protocol_operations, catalog_protocol_uploads, refunds, payments, outbox_events, provider_webhook_events, product_destinations, orders, products, destinations, categories, sessions, auth_rate_limits, users restart identity cascade',
    );
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();
    restoreEnvironment('DATABASE_URL', previousDatabaseUrl);
    restoreEnvironment('ARC_SECRET_API_KEY', previousArcSecret);
    restoreEnvironment('WEB_APP_ORIGIN', previousWebOrigin);
  });

  it('advertises the current health, catalog, orders and site-owned scenario capabilities', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/vv-admin/manifest.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      healthChecks: [
        { key: 'frontend_http' },
        { key: 'backend_http' },
        { key: 'visible_catalog' },
      ],
      catalog: { version: 1 },
      storeOrders: { version: 1 },
      syntheticScenarios: [
        {
          key: 'checkout_payment_reached',
          kind: 'synthetic_transaction',
          productionSafe: true,
          effect: 'creates_synthetic_entities',
          requiresCleanup: true,
          run: {
            method: 'POST',
            url: `https://turkeyplanners.com/api${scenarioPath}`,
          },
        },
      ],
    });
  });

  it('rejects an unsigned scenario request', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'POST',
      url: scenarioPath,
      payload: { runId: randomUUID() },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns stable not_configured evidence without creating an order or calling Arc', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    app = await createApp(appModule);
    const body = JSON.stringify({ runId: randomUUID() });

    const response = await app.inject({
      method: 'POST',
      url: scenarioPath,
      headers: signedScenarioHeaders(body),
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'down',
      summary: 'Synthetic checkout is not configured',
      error: null,
      payment: { reached: false },
      syntheticEntities: [],
      steps: [
        {
          key: 'configuration',
          status: 'not_configured',
          reason: 'payment_provider_not_configured',
        },
      ],
      artifacts: null,
      metadata: {
        outcome: 'not_configured',
        reason: 'payment_provider_not_configured',
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      pool.query('select count(*)::int as count from orders'),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it('creates only an isScenario order and truthfully reaches hosted checkout', async () => {
    process.env.ARC_SECRET_API_KEY = 'sk_test_scenario';
    process.env.WEB_APP_ORIGIN = 'https://turkeyplanners.test';
    const providerCheckoutId = randomUUID();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            method: 'sbp',
            payment_mode: 'redirect',
            is_active: true,
            supported_currencies: ['RUB'],
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: providerCheckoutId,
          url: 'https://pay.example.test/checkout/scenario',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await seedPayableProduct(pool);
    app = await createApp(appModule);
    const runId = randomUUID();
    const body = JSON.stringify({ runId });

    const response = await app.inject({
      method: 'POST',
      url: scenarioPath,
      headers: signedScenarioHeaders(body),
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      payment: { reached: true },
      syntheticEntities: [
        {
          type: 'order',
          externalId: expect.any(String),
          cleanupStatus: 'cancelled',
        },
      ],
      artifacts: null,
      metadata: { checkoutUrlHost: 'pay.example.test' },
    });
    const orderId = response.json<{
      syntheticEntities: { externalId: string }[];
    }>().syntheticEntities[0]!.externalId;
    await expect(
      pool.query(
        `select o.is_scenario, o.is_processed, p.state, p.provider_checkout_id
         from orders o join payments p on p.order_id = o.id where o.id = $1`,
        [orderId],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          is_scenario: true,
          is_processed: true,
          state: 'failed',
          provider_checkout_id: providerCheckoutId,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function signedScenarioHeaders(body: string) {
  const timestamp = new Date().toISOString();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signature = createHmac(
    'sha256',
    process.env.VV_ADMIN_INTEGRATION_SECRET!,
  )
    .update(['POST', scenarioPath, timestamp, bodyHash].join('\n'))
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-vv-admin-timestamp': timestamp,
    'x-vv-admin-signature': signature,
  };
}

async function seedPayableProduct(pool: Pool): Promise<void> {
  const categoryId = randomUUID();
  await pool.query(
    `insert into categories (id, name, slug, is_active)
     values ($1, 'Scenario category', 'scenario-category', true)`,
    [categoryId],
  );
  await pool.query(
    `insert into products
       (id, category_id, title, slug, description, type, price_minor, currency, is_active)
     values ($1, $2, 'Scenario product', 'scenario-product', 'Synthetic test product', 'auto_delivery', 10000, 'RUB', true)`,
    [randomUUID(), categoryId],
  );
}

async function createApp(module: Type<unknown>) {
  const { createApiApp } = await import('../src/common/app-factory.js');
  const app = await createApiApp(module);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
