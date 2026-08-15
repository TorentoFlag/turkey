import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { runMigrations } from '../src/database/migrate.js';
import { startPostgres } from './support/postgres.js';

describe('legacy admin orders regression', () => {
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
    process.env.ARC_SECRET_API_KEY = 'sk_test_legacy';
    process.env.ARC_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.WEB_APP_ORIGIN = 'https://shop.example.test';
    await runMigrations(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ({ AppModule: appModule } = await import('../src/app.module.js'));
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

  it('keeps the existing admin processing endpoint compatible', async () => {
    const userId = randomUUID();
    const categoryId = randomUUID();
    const productId = randomUUID();
    const orderId = randomUUID();
    await pool.query(
      'truncate table audit_log, orders, products, categories, users restart identity cascade',
    );
    await pool.query(
      'insert into users (id, email, password_hash) values ($1, $2, $3)',
      [userId, `${orderId}@example.test`, 'test-password-hash'],
    );
    await pool.query(
      'insert into categories (id, name, slug) values ($1, $2, $3)',
      [categoryId, 'Legacy orders', `legacy-orders-${categoryId}`],
    );
    await pool.query(
      `insert into products (id, category_id, title, slug, description, type)
       values ($1, $2, 'Legacy product', $3, 'Legacy product.', 'booking')`,
      [productId, categoryId, `legacy-product-${productId}`],
    );
    await pool.query(
      `insert into orders
        (id, user_id, product_id, idempotency_key, product_title, product_type, email, phone)
       values ($1, $2, $3, $4, 'Legacy product', 'booking', 'legacy@example.test', '+70000000000')`,
      [orderId, userId, productId, randomUUID()],
    );
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/orders/${orderId}`,
      headers: {
        'x-admin-api-key': 'test-static-admin-key',
        'x-admin-actor-id': 'legacy-manager',
      },
      payload: { isProcessed: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: orderId, isProcessed: true });
  });

  it('keeps the existing admin full-refund endpoint compatible', async () => {
    const providerPaymentId = randomUUID();
    const providerRefundId = randomUUID();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          id: providerRefundId,
          payment_id: providerPaymentId,
          amount: 5_000,
          currency: 'RUB',
          status: 'succeeded',
          created_at: '2026-08-15T12:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { orderId } = await createOrderFixture(pool);
    await pool.query(
      `insert into payments
        (order_id, provider_payment_id, idempotency_key, amount_minor, currency, state)
       values ($1, $2, $3, 5000, 'RUB', 'succeeded')`,
      [orderId, providerPaymentId, randomUUID()],
    );
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'POST',
      url: `/v1/admin/orders/${orderId}/refund`,
      headers: {
        'x-admin-api-key': 'test-static-admin-key',
        'x-admin-actor-id': 'legacy-manager',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      amountMinor: 5_000,
      currency: 'RUB',
      providerRefundId,
      state: 'succeeded',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

async function createOrderFixture(pool: Pool) {
  const userId = randomUUID();
  const categoryId = randomUUID();
  const productId = randomUUID();
  const orderId = randomUUID();
  await pool.query(
    'truncate table audit_log, refunds, payments, orders, products, categories, users restart identity cascade',
  );
  await pool.query(
    'insert into users (id, email, password_hash) values ($1, $2, $3)',
    [userId, `${orderId}@example.test`, 'test-password-hash'],
  );
  await pool.query(
    'insert into categories (id, name, slug) values ($1, $2, $3)',
    [categoryId, 'Legacy orders', `legacy-orders-${categoryId}`],
  );
  await pool.query(
    `insert into products
      (id, category_id, title, slug, description, type, price_minor, currency)
     values ($1, $2, 'Legacy product', $3, 'Legacy product.', 'physical', 5000, 'RUB')`,
    [productId, categoryId, `legacy-product-${productId}`],
  );
  await pool.query(
    `insert into orders
      (id, user_id, product_id, idempotency_key, product_title, product_type,
       price_minor, currency, email, phone, delivery_address)
     values ($1, $2, $3, $4, 'Legacy product', 'physical', 5000, 'RUB',
       'legacy@example.test', '+70000000000', 'Legacy address')`,
    [orderId, userId, productId, randomUUID()],
  );
  return { orderId };
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
