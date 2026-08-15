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
  const previousArcBaseUrl = process.env.ARC_API_BASE_URL;
  const previousScenarioSecret = process.env.VV_SCENARIO_AUTH_SECRET;
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
    process.env.VV_SCENARIO_AUTH_SECRET = 'test-vv-scenario-auth-secret';
    await runMigrations(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ({ AppModule: appModule } = await import('../src/app.module.js'));
  });

  beforeEach(async () => {
    delete process.env.ARC_SECRET_API_KEY;
    delete process.env.WEB_APP_ORIGIN;
    process.env.ARC_API_BASE_URL = 'https://arc.example.test/v1';
    await pool.query(
      'truncate table audit_log, synthetic_scenario_runs, catalog_protocol_operations, catalog_protocol_uploads, refunds, payments, outbox_events, provider_webhook_events, product_destinations, orders, products, destinations, categories, sessions, auth_rate_limits, users restart identity cascade',
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
    restoreEnvironment('ARC_API_BASE_URL', previousArcBaseUrl);
    restoreEnvironment('VV_SCENARIO_AUTH_SECRET', previousScenarioSecret);
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
      payload: scenarioBody(),
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a scenario signed with the general integration secret', async () => {
    app = await createApp(appModule);
    const body = JSON.stringify(scenarioBody());

    const response = await app.inject({
      method: 'POST',
      url: scenarioPath,
      headers: signedScenarioHeaders(
        body,
        process.env.VV_ADMIN_INTEGRATION_SECRET!,
      ),
      payload: body,
    });

    expect(response.statusCode).toBe(401);
    const [runs, orders] = await Promise.all([
      pool.query('select count(*)::int as count from synthetic_scenario_runs'),
      pool.query('select count(*)::int as count from orders'),
    ]);
    expect(runs.rows[0].count).toBe(0);
    expect(orders.rows[0].count).toBe(0);
  });

  it('returns stable not_configured evidence without creating an order or calling Arc', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    app = await createApp(appModule);
    const body = JSON.stringify(scenarioBody());

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
          reason: 'sandbox_payment_proof_not_configured',
        },
      ],
      artifacts: null,
      metadata: {
        outcome: 'not_configured',
        reason: 'sandbox_payment_proof_not_configured',
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      pool.query('select count(*)::int as count from orders'),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(
      pool.query('select count(*)::int as count from synthetic_scenario_runs'),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    await expect(
      pool.query('select count(*)::int as count from audit_log'),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it('returns payable-product not_configured with no database or provider writes', async () => {
    process.env.ARC_SECRET_API_KEY = 'sk_test_scenario';
    process.env.WEB_APP_ORIGIN = 'https://turkeyplanners.test';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    app = await createApp(appModule);
    const body = JSON.stringify(scenarioBody());

    const response = await app.inject({
      method: 'POST',
      url: scenarioPath,
      headers: signedScenarioHeaders(body),
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'down',
      payment: { reached: false },
      metadata: {
        outcome: 'not_configured',
        reason: 'payable_product_not_configured',
      },
    });
    const counts = await Promise.all(
      [
        'synthetic_scenario_runs',
        'audit_log',
        'orders',
        'payments',
        'users',
      ].map((table) =>
        pool.query(`select count(*)::int as count from ${table}`),
      ),
    );
    expect(counts.map((result) => result.rows[0].count)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
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
    const input = scenarioBody();
    const body = JSON.stringify(input);

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
    await expect(
      pool.query(
        `select action, entity_id, payload
         from audit_log where action = 'synthetic_scenario.completed'`,
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          entity_id: input.runId,
          payload: {
            runId: input.runId,
            siteId: input.siteId,
            scenarioKey: input.scenarioKey,
            orderId,
            outcome: 'healthy',
          },
        },
      ],
    });
  });

  it('rejects signed bodies for another site, scenario or stale requestedAt before side effects', async () => {
    process.env.ARC_SECRET_API_KEY = 'sk_test_scenario';
    process.env.WEB_APP_ORIGIN = 'https://turkeyplanners.test';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    app = await createApp(appModule);
    const invalidInputs = [
      scenarioBody({ siteId: randomUUID() }),
      scenarioBody({ scenarioKey: 'another_scenario' }),
      scenarioBody({ requestedAt: '2026-08-15T00:00:00.000Z' }),
    ];

    for (const input of invalidInputs) {
      const body = JSON.stringify(input);
      const response = await app.inject({
        method: 'POST',
        url: scenarioPath,
        headers: signedScenarioHeaders(body),
        payload: body,
      });
      expect(response.statusCode).toBe(400);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      pool.query('select count(*)::int as count from orders'),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
  });

  it.each([
    {
      name: 'live provider key',
      arcSecret: 'sk_live_scenario',
      arcBaseUrl: 'https://arc.example.test/v1',
      webOrigin: 'https://turkeyplanners.test',
    },
    {
      name: 'storefront URL with a path',
      arcSecret: 'sk_test_scenario',
      arcBaseUrl: 'https://arc.example.test/v1',
      webOrigin: 'https://turkeyplanners.test/store',
    },
  ])(
    'fails closed for $name before DB/provider side effects',
    async (input) => {
      process.env.ARC_SECRET_API_KEY = input.arcSecret;
      process.env.ARC_API_BASE_URL = input.arcBaseUrl;
      process.env.WEB_APP_ORIGIN = input.webOrigin;
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      app = await createApp(appModule);
      const body = JSON.stringify(scenarioBody());

      const response = await app.inject({
        method: 'POST',
        url: scenarioPath,
        headers: signedScenarioHeaders(body),
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'down',
        payment: { reached: false },
        metadata: {
          outcome: 'not_configured',
          reason: 'sandbox_payment_proof_not_configured',
        },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(
        pool.query('select count(*)::int as count from orders'),
      ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    },
  );

  it('durably replays the same run without another order or provider call', async () => {
    process.env.ARC_SECRET_API_KEY = 'sk_test_scenario';
    process.env.WEB_APP_ORIGIN = 'https://turkeyplanners.test';
    const providerCheckoutId = randomUUID();
    const fetchMock = hostedCheckoutFetch(providerCheckoutId);
    vi.stubGlobal('fetch', fetchMock);
    await seedPayableProduct(pool);
    app = await createApp(appModule);
    const body = JSON.stringify(scenarioBody());
    const request = () =>
      app!.inject({
        method: 'POST',
        url: scenarioPath,
        headers: signedScenarioHeaders(body),
        payload: body,
      });

    const first = await request();
    const replay = await request();

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(
      pool.query('select count(*)::int as count from orders'),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
    await expect(
      pool.query(
        'select count(*)::int as count from audit_log where action = $1',
        ['synthetic_scenario.completed'],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 1 }] });
  });

  it('preserves reached evidence and reports cleanup_required when cleanup fails', async () => {
    process.env.ARC_SECRET_API_KEY = 'sk_test_scenario';
    process.env.WEB_APP_ORIGIN = 'https://turkeyplanners.test';
    vi.stubGlobal('fetch', hostedCheckoutFetch(randomUUID()));
    await seedPayableProduct(pool);
    await pool.query(`
      create function reject_scenario_cleanup() returns trigger language plpgsql as $$
      begin
        if old.is_scenario and new.is_processed then
          raise exception 'forced scenario cleanup failure';
        end if;
        return new;
      end $$;
      create trigger reject_scenario_cleanup before update on orders
      for each row execute function reject_scenario_cleanup();
    `);
    app = await createApp(appModule);
    const body = JSON.stringify(scenarioBody());

    try {
      const response = await app.inject({
        method: 'POST',
        url: scenarioPath,
        headers: signedScenarioHeaders(body),
        payload: body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'healthy',
        summary: 'Synthetic checkout reached payment but cleanup is required',
        error: 'cleanup_required',
        payment: { reached: true },
        syntheticEntities: [{ cleanupStatus: 'failed' }],
        metadata: {
          outcome: 'cleanup_required',
          checkoutUrlHost: 'pay.example.test',
        },
      });
    } finally {
      await pool.query(
        'drop trigger if exists reject_scenario_cleanup on orders; drop function if exists reject_scenario_cleanup()',
      );
    }
  });

  it('ignores a captured webhook for a scenario payment and emits no notification', async () => {
    process.env.ARC_SECRET_API_KEY = 'sk_test_scenario';
    process.env.WEB_APP_ORIGIN = 'https://turkeyplanners.test';
    const providerCheckoutId = randomUUID();
    const fetchMock = hostedCheckoutFetch(providerCheckoutId);
    vi.stubGlobal('fetch', fetchMock);
    await seedPayableProduct(pool);
    app = await createApp(appModule);
    const body = JSON.stringify(scenarioBody());
    const scenario = await app.inject({
      method: 'POST',
      url: scenarioPath,
      headers: signedScenarioHeaders(body),
      payload: body,
    });
    const orderId = scenario.json<{
      syntheticEntities: { externalId: string }[];
    }>().syntheticEntities[0]!.externalId;
    const webhook = signedArcWebhook({
      event_type: 'payment.captured',
      data: { checkout_session_id: providerCheckoutId },
    });

    const captured = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/arc',
      headers: webhook.headers,
      payload: webhook.body,
    });

    expect(captured.statusCode).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(
      pool.query('select state from payments where order_id = $1', [orderId]),
    ).resolves.toMatchObject({ rows: [{ state: 'failed' }] });
    await expect(
      pool.query(
        'select count(*)::int as count from outbox_events where aggregate_id = $1',
        [orderId],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    const { NotificationDeliveryService } = await import(
      '../src/modules/notifications/notification-delivery.service.js'
    );
    await app.get(NotificationDeliveryService).deliver({
      id: randomUUID(),
      type: 'order.accepted',
      aggregateId: orderId,
      idempotencyKey: `order.accepted:${orderId}`,
      payload: { orderId },
      attempts: 1,
      claimToken: randomUUID(),
      nextAttemptAt: null,
      deliveredAt: null,
      createdAt: new Date(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function signedScenarioHeaders(
  body: string,
  secret = process.env.VV_SCENARIO_AUTH_SECRET!,
) {
  const timestamp = new Date().toISOString();
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signature = createHmac('sha256', secret)
    .update(['POST', scenarioPath, timestamp, bodyHash].join('\n'))
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-vv-admin-timestamp': timestamp,
    'x-vv-admin-signature': signature,
  };
}

function scenarioBody(
  overrides: Partial<{
    runId: string;
    siteId: string;
    scenarioKey: string;
    requestedAt: string;
  }> = {},
) {
  return {
    runId: randomUUID(),
    siteId: '018f71c1-4afe-7b1d-9f55-123456789abc',
    scenarioKey: 'checkout_payment_reached',
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

function hostedCheckoutFetch(providerCheckoutId: string) {
  return vi
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
}

function signedArcWebhook(payload: unknown) {
  const eventId = randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', 'test-webhook-secret')
    .update(`${eventId}.${timestamp}.${body}`)
    .digest('hex');
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': eventId,
      'webhook-signature': `t=${timestamp},v1=${signature}`,
      'webhook-timestamp': timestamp,
    },
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
