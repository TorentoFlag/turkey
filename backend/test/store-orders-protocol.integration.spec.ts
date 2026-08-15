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

describe('Store Orders Protocol v1', () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
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
    process.env.ARC_SECRET_API_KEY = 'sk_test_protocol';
    process.env.ARC_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.WEB_APP_ORIGIN = 'https://shop.example.test';
    await runMigrations(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ({ AppModule: appModule } = await import('../src/app.module.js'));
  });

  beforeEach(async () => {
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
  });

  it('lists orders through the signed protocol without exposing purge controls', async () => {
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, { isProcessed: false });
    const path = '/admin/integration/store-orders/v1/orders';

    const response = await app.inject({
      method: 'GET',
      url: path,
      headers: signedRequest('GET', path).headers,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [
        {
          id: fixture.orderId,
          revision: '1',
          productTitle: 'Protocol order product',
          productType: 'booking',
          isProcessed: false,
          payment: null,
          refund: null,
        },
      ],
    });
    expect(JSON.stringify(response.json())).not.toContain('isPurgeable');
    expect(JSON.stringify(response.json())).not.toContain('isScenario');
  });

  it('revision-checks and idempotently replays processing updates with one audit event', async () => {
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, { isProcessed: false });
    const path = `/admin/integration/store-orders/v1/orders/${fixture.orderId}/processing`;
    const body = JSON.stringify({ isProcessed: true });
    const request = signedRequest('PATCH', path, body);

    const missingPrecondition = await app.inject({
      method: 'PATCH',
      url: path,
      headers: signedRequest('PATCH', path, body).headers,
      payload: body,
    });
    expect(missingPrecondition.statusCode).toBe(428);

    const first = await app.inject({
      method: 'PATCH',
      url: path,
      headers: { ...request.headers, 'if-match': '"1"' },
      payload: body,
    });
    const replay = await app.inject({
      method: 'PATCH',
      url: path,
      headers: { ...request.headers, 'if-match': '"1"' },
      payload: body,
    });

    expect(first.statusCode).toBe(200);
    expect(first.headers.etag).toBe('"2"');
    expect(first.json()).toMatchObject({
      operationId: expect.any(String),
      resource: {
        id: fixture.orderId,
        revision: '2',
        isProcessed: true,
      },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());

    const recoveryPath = `/admin/integration/store-orders/v1/operations/by-request/${request.requestId}`;
    const recovery = await app.inject({
      method: 'GET',
      url: recoveryPath,
      headers: signedRequest('GET', recoveryPath).headers,
    });
    expect(recovery.statusCode).toBe(200);
    expect(recovery.json()).toEqual({
      requestId: request.requestId,
      status: 'completed',
      response: {
        status: 200,
        body: first.json(),
      },
    });
    expect(
      await pool.query(
        'select actor_id, action, entity_id from audit_log where entity_id = $1 order by created_at',
        [fixture.orderId],
      ),
    ).toMatchObject({
      rows: [
        {
          actor_id: 'protocol-manager-42',
          action: 'order.processed',
          entity_id: fixture.orderId,
        },
      ],
    });

    const staleBody = JSON.stringify({ isProcessed: false });
    const stale = await app.inject({
      method: 'PATCH',
      url: path,
      headers: {
        ...signedRequest('PATCH', path, staleBody).headers,
        'if-match': '"1"',
      },
      payload: staleBody,
    });
    expect(stale.statusCode).toBe(412);
    expect(stale.json()).toMatchObject({
      type: 'catalog/revision-conflict',
      status: 412,
    });
  });

  it('requests a full refund once and replays the terminal protocol response', async () => {
    const providerPaymentId = randomUUID();
    const providerRefundId = randomUUID();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          id: providerRefundId,
          payment_id: providerPaymentId,
          amount: 7_500,
          currency: 'RUB',
          status: 'succeeded',
          created_at: '2026-08-15T12:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, {
      payment: {
        amountMinor: 7_500,
        currency: 'RUB',
        providerPaymentId,
        state: 'succeeded',
      },
    });
    const path = `/admin/integration/store-orders/v1/orders/${fixture.orderId}/refunds`;
    const body = '';
    const request = signedRequest('POST', path, body);

    const missingPrecondition = await app.inject({
      method: 'POST',
      url: path,
      headers: signedRequest('POST', path).headers,
    });
    expect(missingPrecondition.statusCode).toBe(428);

    const invalidBody = JSON.stringify({ amountMinor: 1 });
    const rejectedOverride = await app.inject({
      method: 'POST',
      url: path,
      headers: {
        ...signedRequest('POST', path, invalidBody).headers,
        'if-match': '"1"',
      },
      payload: invalidBody,
    });
    expect(rejectedOverride.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();

    const first = await app.inject({
      method: 'POST',
      url: path,
      headers: { ...request.headers, 'if-match': '"1"' },
    });
    const replay = await app.inject({
      method: 'POST',
      url: path,
      headers: { ...request.headers, 'if-match': '"1"' },
    });

    expect(first.statusCode).toBe(201);
    expect(first.headers.etag).toBe('"2"');
    expect(first.json()).toMatchObject({
      operationId: expect.any(String),
      resource: {
        orderId: fixture.orderId,
        revision: '2',
        refund: {
          state: 'succeeded',
          providerRefundId,
          amountMinor: 7_500,
          currency: 'RUB',
        },
      },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      await pool.query(
        'select action, entity_type from audit_log where action = $1',
        ['refund.requested'],
      ),
    ).toMatchObject({
      rows: [{ action: 'refund.requested', entity_type: 'refund' }],
    });
  });

  it('dry-runs and then deletes only an explicitly purgeable payment-free scenario order', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, {
      isPurgeable: true,
      isScenario: true,
    });
    const dryRunPath = `/admin/integration/catalog/v1/products/${fixture.productId}?dryRun=true`;
    const dryRun = await app.inject({
      method: 'DELETE',
      url: dryRunPath,
      headers: {
        ...signedRequest('DELETE', dryRunPath).headers,
        'if-match': '"1"',
      },
    });

    expect(dryRun.statusCode, dryRun.body).toBe(200);
    expect(dryRun.json()).toMatchObject({
      resource: {
        result: {
          resourceId: fixture.productId,
          resourceType: 'product',
          dryRun: true,
          permitted: true,
          deletedOrderIds: [fixture.orderId],
          blockingReferences: {
            destinationProducts: 0,
            protectedOrders: 0,
          },
        },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await pool.query('select id from orders')).rowCount).toBe(1);
    expect((await pool.query('select id from products')).rowCount).toBe(1);
    expect((await pool.query('select id from outbox_events')).rowCount).toBe(0);
    expect((await pool.query('select id from audit_log')).rowCount).toBe(0);

    const deletePath = `/admin/integration/catalog/v1/products/${fixture.productId}`;
    const deleted = await app.inject({
      method: 'DELETE',
      url: deletePath,
      headers: {
        ...signedRequest('DELETE', deletePath).headers,
        'if-match': '"1"',
      },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json()).toMatchObject({
      resource: {
        result: {
          dryRun: false,
          permitted: true,
          deletedOrderIds: [fixture.orderId],
        },
      },
    });
    expect((await pool.query('select id from orders')).rowCount).toBe(0);
    expect((await pool.query('select id from products')).rowCount).toBe(0);
    const audit = await pool.query<{
      action: string;
      payload: Record<string, unknown>;
    }>('select action, payload from audit_log order by created_at');
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: 'product.deleted',
      payload: {
        productId: fixture.productId,
        deletedOrderIds: [fixture.orderId],
        deletedOrderCount: 1,
      },
    });
    expect(JSON.stringify(audit.rows[0])).not.toContain(
      'scenario@example.test',
    );
  });

  it('rechecks financial history in the physical delete when inspection becomes stale', async () => {
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, {
      isPurgeable: true,
      isScenario: true,
    });
    const { OrdersService } = await import(
      '../src/modules/orders/orders.service.js'
    );
    vi.spyOn(
      app.get(OrdersService),
      'inspectProductOrderDeletion',
    ).mockResolvedValue({
      deletedOrderIds: [fixture.orderId],
      protectedOrders: 0,
    });
    const paymentId = await insertFinancialHistory(pool, fixture.orderId);
    const path = `/admin/integration/catalog/v1/products/${fixture.productId}`;

    const response = await app.inject({
      method: 'DELETE',
      url: path,
      headers: {
        ...signedRequest('DELETE', path).headers,
        'if-match': '"1"',
      },
    });

    expect(response.statusCode, response.body).toBe(409);
    expect(response.json()).toMatchObject({
      type: 'catalog/order-history-protected',
      status: 409,
    });
    await expectHistoryToRemain(pool, fixture, paymentId);
  });

  it('serializes a concurrent financial writer before technical deletion', async () => {
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, {
      isPurgeable: true,
      isScenario: true,
    });
    const writer = await pool.connect();
    let writerFinished = false;
    try {
      await writer.query('begin');
      const paymentId = await insertFinancialHistory(writer, fixture.orderId);
      const path = `/admin/integration/catalog/v1/products/${fixture.productId}`;
      const deletion = app.inject({
        method: 'DELETE',
        url: path,
        headers: {
          ...signedRequest('DELETE', path).headers,
          'if-match': '"1"',
        },
      });

      const race = await Promise.race([
        deletion.then(() => 'settled' as const),
        delay(100).then(() => 'blocked' as const),
      ]);
      expect(race).toBe('blocked');

      await writer.query('commit');
      writerFinished = true;
      const response = await deletion;

      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({
        type: 'catalog/order-history-protected',
        status: 409,
      });
      await expectHistoryToRemain(pool, fixture, paymentId);
    } finally {
      if (!writerFinished) await writer.query('rollback');
      writer.release();
    }
  });

  it.each([
    ['customer order', { isPurgeable: true, isScenario: false }],
    ['non-purgeable scenario', { isPurgeable: false, isScenario: true }],
    [
      'processed scenario',
      { isProcessed: true, isPurgeable: true, isScenario: true },
    ],
    [
      'payment-linked scenario',
      {
        isPurgeable: true,
        isScenario: true,
        payment: {
          amountMinor: 7_500,
          currency: 'RUB',
          providerPaymentId: randomUUID(),
          state: 'succeeded' as const,
        },
      },
    ],
    [
      'refunded scenario',
      {
        isPurgeable: true,
        isScenario: true,
        payment: {
          amountMinor: 7_500,
          currency: 'RUB',
          providerPaymentId: randomUUID(),
          state: 'succeeded' as const,
        },
        refund: true,
      },
    ],
  ])('protects product history for a %s', async (_label, options) => {
    app = await createApp(appModule);
    const fixture = await createOrderFixture(pool, options);
    const path = `/admin/integration/catalog/v1/products/${fixture.productId}`;
    const response = await app.inject({
      method: 'DELETE',
      url: path,
      headers: {
        ...signedRequest('DELETE', path).headers,
        'if-match': '"1"',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      type: 'catalog/order-history-protected',
      status: 409,
    });
    expect(
      (
        await pool.query('select id from orders where id = $1', [
          fixture.orderId,
        ])
      ).rowCount,
    ).toBe(1);
    expect(
      (
        await pool.query('select id from products where id = $1', [
          fixture.productId,
        ])
      ).rowCount,
    ).toBe(1);
  });
});

type FixtureOptions = Readonly<{
  isProcessed?: boolean;
  isPurgeable?: boolean;
  isScenario?: boolean;
  payment?: Readonly<{
    amountMinor: number;
    currency: string;
    providerPaymentId: string;
    state: 'pending' | 'succeeded' | 'failed';
  }>;
  refund?: boolean;
}>;

async function createOrderFixture(pool: Pool, options: FixtureOptions = {}) {
  const userId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const orderId = randomUUID();
  await pool.query(
    'insert into users (id, email, password_hash) values ($1, $2, $3)',
    [userId, `${orderId}@example.test`, 'test-password-hash'],
  );
  await pool.query(
    'insert into categories (id, name, slug) values ($1, $2, $3)',
    [categoryId, 'Protocol orders', `protocol-orders-${categoryId}`],
  );
  await pool.query(
    `insert into products
      (id, category_id, title, slug, description, type, is_active)
     values ($1, $2, $3, $4, $5, 'booking', true)`,
    [
      productId,
      categoryId,
      'Protocol order product',
      `protocol-order-product-${productId}`,
      'Protocol order product description.',
    ],
  );
  await pool.query(
    `insert into orders
      (id, user_id, product_id, idempotency_key, product_title, product_type,
       email, phone, is_processed, is_scenario, is_purgeable)
     values ($1, $2, $3, $4, $5, 'booking', $6, $7, $8, $9, $10)`,
    [
      orderId,
      userId,
      productId,
      randomUUID(),
      'Protocol order product',
      'scenario@example.test',
      '+70000000000',
      options.isProcessed ?? false,
      options.isScenario ?? false,
      options.isPurgeable ?? false,
    ],
  );
  if (options.payment) {
    const payment = await pool.query<{ id: string }>(
      `insert into payments
        (order_id, provider_payment_id, idempotency_key, amount_minor, currency, state)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        orderId,
        options.payment.providerPaymentId,
        randomUUID(),
        options.payment.amountMinor,
        options.payment.currency,
        options.payment.state,
      ],
    );
    if (options.refund) {
      await pool.query(
        `insert into refunds
          (payment_id, provider_refund_id, amount_minor, currency, idempotency_key, state)
         values ($1, $2, $3, $4, $5, 'succeeded')`,
        [
          payment.rows[0]!.id,
          randomUUID(),
          options.payment.amountMinor,
          options.payment.currency,
          randomUUID(),
        ],
      );
    }
  }
  return { categoryId, orderId, productId, userId };
}

type QueryExecutor = Pick<Pool, 'query'>;

async function insertFinancialHistory(
  executor: QueryExecutor,
  orderId: string,
): Promise<string> {
  const payment = await executor.query<{ id: string }>(
    `insert into payments
      (order_id, provider_payment_id, idempotency_key, amount_minor, currency, state)
     values ($1, $2, $3, 7500, 'RUB', 'succeeded')
     returning id`,
    [orderId, randomUUID(), randomUUID()],
  );
  const paymentId = payment.rows[0]!.id;
  await executor.query(
    `insert into refunds
      (payment_id, provider_refund_id, amount_minor, currency, idempotency_key, state)
     values ($1, $2, 7500, 'RUB', $3, 'succeeded')`,
    [paymentId, randomUUID(), randomUUID()],
  );
  return paymentId;
}

async function expectHistoryToRemain(
  pool: Pool,
  fixture: Readonly<{ orderId: string; productId: string }>,
  paymentId: string,
) {
  await expect(
    pool.query(
      `select
        exists(select 1 from products where id = $1) as product_exists,
        exists(select 1 from orders where id = $2) as order_exists,
        exists(select 1 from payments where id = $3) as payment_exists,
        exists(select 1 from refunds where payment_id = $3) as refund_exists`,
      [fixture.productId, fixture.orderId, paymentId],
    ),
  ).resolves.toMatchObject({
    rows: [
      {
        product_exists: true,
        order_exists: true,
        payment_exists: true,
        refund_exists: true,
      },
    ],
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function signedRequest(method: string, path: string, body = '') {
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();
  const digest = createHash('sha256').update(body).digest('hex');
  const canonical = `v1.${timestamp}.${requestId}.${method}.${path}.${digest}`;
  const signature = createHmac(
    'sha256',
    process.env.VV_ADMIN_INTEGRATION_SECRET!,
  )
    .update(canonical)
    .digest('hex');
  return {
    requestId,
    headers: {
      ...(body.length > 0 ? { 'content-type': 'application/json' } : {}),
      'x-vv-site-key': process.env.VV_ADMIN_INTEGRATION_SITE_KEY!,
      'x-vv-actor-id': 'protocol-manager-42',
      'x-vv-request-id': requestId,
      'x-vv-timestamp': timestamp,
      'x-vv-signature-version': '1',
      'x-vv-signature': `sha256=${signature}`,
      ...(['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
        ? { 'idempotency-key': randomUUID() }
        : {}),
    },
  };
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
