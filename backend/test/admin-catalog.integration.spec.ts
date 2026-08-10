import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Type } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
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
import { MinioProductMediaStorage } from '../src/modules/media/minio-product-media.storage.js';
import { startPostgres } from './support/postgres.js';

describe('admin catalog API', () => {
  const previousEnv = {
    adminApiKey: process.env.ADMIN_API_KEY,
    arcApiBaseUrl: process.env.ARC_API_BASE_URL,
    arcSecretApiKey: process.env.ARC_SECRET_API_KEY,
    arcWebhookSecret: process.env.ARC_WEBHOOK_SECRET,
    authRateLimitMaxAttempts: process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    authRateLimitWindowSeconds: process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    databaseUrl: process.env.DATABASE_URL,
    logLevel: process.env.LOG_LEVEL,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    webAppOrigin: process.env.WEB_APP_ORIGIN,
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
    process.env.ARC_API_BASE_URL = 'https://arc.example.test/v1';
    process.env.ARC_SECRET_API_KEY = 'sk_test_checkout';
    process.env.ARC_WEBHOOK_SECRET = 'test-webhook-secret';
    process.env.WEB_APP_ORIGIN = 'https://shop.example.test';
    process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '2';
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '900';
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

    restoreEnvironment('ADMIN_API_KEY', previousEnv.adminApiKey);
    restoreEnvironment('ARC_API_BASE_URL', previousEnv.arcApiBaseUrl);
    restoreEnvironment('ARC_SECRET_API_KEY', previousEnv.arcSecretApiKey);
    restoreEnvironment('ARC_WEBHOOK_SECRET', previousEnv.arcWebhookSecret);
    restoreEnvironment(
      'AUTH_RATE_LIMIT_MAX_ATTEMPTS',
      previousEnv.authRateLimitMaxAttempts,
    );
    restoreEnvironment(
      'AUTH_RATE_LIMIT_WINDOW_SECONDS',
      previousEnv.authRateLimitWindowSeconds,
    );
    restoreEnvironment('DATABASE_URL', previousEnv.databaseUrl);
    restoreEnvironment('LOG_LEVEL', previousEnv.logLevel);
    restoreEnvironment('NODE_ENV', previousEnv.nodeEnv);
    restoreEnvironment('PORT', previousEnv.port);
    restoreEnvironment('WEB_APP_ORIGIN', previousEnv.webAppOrigin);
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

  it('allows one subcategory level and rejects a third category level', async () => {
    app = await createApp(appModule);
    const root = await createCategory(app, {
      name: 'Экскурсии',
      slug: 'excursions',
    });
    const child = await createCategory(app, {
      name: 'Анталья',
      slug: 'antalya-excursions',
      parentId: root.id,
    });

    const thirdLevel = await app.inject({
      method: 'POST',
      url: '/v1/admin/categories',
      headers: adminHeaders(),
      payload: {
        name: 'Морские прогулки',
        slug: 'antalya-boat-trips',
        parentId: child.id,
      },
    });

    expect(thirdLevel.statusCode).toBe(400);
  });

  it('updates and deactivates a category while recording the actor', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Шопинг',
      slug: 'shopping',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/categories/${category.id}`,
      headers: adminHeaders(),
      payload: {
        name: 'Шопинг в Турции',
        slug: 'turkey-shopping',
        isActive: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: category.id,
      name: 'Шопинг в Турции',
      slug: 'turkey-shopping',
      isActive: false,
    });

    const audit = await pool.query<{
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
    }>(
      'select actor_id, action, entity_type, entity_id from audit_log where entity_id = $1 and action = $2',
      [category.id, 'category.updated'],
    );

    expect(audit.rows).toEqual([
      {
        actor_id: 'manager-42',
        action: 'category.updated',
        entity_type: 'category',
        entity_id: category.id,
      },
    ]);
  });

  it('deletes an empty category and records the authenticated actor', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, { name: 'Удаляемая категория', slug: 'deletable-category' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/categories/${category.id}`,
      headers: { ...adminHeaders(), 'x-admin-actor-id': 'catalog-delete-test' },
    });

    expect(response.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/categories', headers: adminHeaders() })).json())
      .not.toContainEqual(expect.objectContaining({ id: category.id }));
    expect((await pool.query('select actor_id, action from audit_log where entity_id = $1', [category.id])).rows)
      .toContainEqual({ actor_id: 'catalog-delete-test', action: 'category.deleted' });
  });

  it('rejects deleting a category with a child or product', async () => {
    app = await createApp(appModule);
    const root = await createCategory(app, { name: 'Занятая категория', slug: 'occupied-category' });
    await createCategory(app, { name: 'Дочерняя категория', slug: 'occupied-child', parentId: root.id });
    expect((await app.inject({ method: 'DELETE', url: `/v1/admin/categories/${root.id}`, headers: adminHeaders() })).statusCode).toBe(409);

    const productCategory = await createCategory(app, { name: 'Категория с товаром', slug: 'product-category' });
    await createProduct(app, { categoryId: productCategory.id, title: 'Тестовый товар', slug: 'blocked-delete-product', description: 'Тестовый товар для запрета удаления категории.', type: 'booking' });
    expect((await app.inject({ method: 'DELETE', url: `/v1/admin/categories/${productCategory.id}`, headers: adminHeaders() })).statusCode).toBe(409);
  });

  it('creates booking and payable products with their required payment fields', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Аренда',
      slug: 'rentals',
    });

    const booking = await app.inject({
      method: 'POST',
      url: '/v1/admin/products',
      headers: adminHeaders(),
      payload: {
        categoryId: category.id,
        title: 'Аренда яхты',
        slug: 'yacht-rental',
        description: 'Индивидуальная заявка на аренду яхты.',
        type: 'booking',
      },
    });

    expect(booking.statusCode).toBe(201);
    expect(booking.json()).toMatchObject({
      categoryId: category.id,
      type: 'booking',
      priceMinor: null,
      currency: null,
    });

    const missingPrice = await app.inject({
      method: 'POST',
      url: '/v1/admin/products',
      headers: adminHeaders(),
      payload: {
        categoryId: category.id,
        title: 'Шуба из Турции',
        slug: 'turkish-fur-coat',
        description: 'Шуба от производителя.',
        type: 'physical',
      },
    });

    expect(missingPrice.statusCode).toBe(400);

    const physical = await app.inject({
      method: 'POST',
      url: '/v1/admin/products',
      headers: adminHeaders(),
      payload: {
        categoryId: category.id,
        title: 'Шуба из Турции',
        slug: 'turkish-fur-coat',
        description: 'Шуба от производителя.',
        type: 'physical',
        priceMinor: 250_000,
        currency: 'TRY',
      },
    });

    expect(physical.statusCode).toBe(201);
    expect(physical.json()).toMatchObject({
      categoryId: category.id,
      type: 'physical',
      priceMinor: 250_000,
      currency: 'TRY',
    });

    const products = await app.inject({
      method: 'GET',
      url: '/v1/admin/products',
      headers: adminHeaders(),
    });

    expect(products.statusCode).toBe(200);
    expect(products.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: booking.json<{ id: string }>().id }),
        expect.objectContaining({ id: physical.json<{ id: string }>().id }),
      ]),
    );

    const product = physical.json<{ id: string }>();
    const audit = await pool.query<{
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
    }>(
      'select actor_id, action, entity_type, entity_id from audit_log where entity_id = $1',
      [product.id],
    );

    expect(audit.rows).toEqual([
      {
        actor_id: 'manager-42',
        action: 'product.created',
        entity_type: 'product',
        entity_id: product.id,
      },
    ]);
  });

  it('creates a product from one multipart photo and rejects a competing image URL', async () => {
    const putPhoto = vi
      .spyOn(MinioProductMediaStorage.prototype, 'putWebp')
      .mockResolvedValue(undefined);
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Фото товаров',
      slug: 'product-photos',
    });
    const photo = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    })
      .png()
      .toBuffer();
    const productInput = {
      categoryId: category.id,
      title: 'Товар с фотографией',
      slug: 'product-with-photo',
      description: 'Товар, созданный с загруженной фотографией.',
      type: 'physical',
      priceMinor: 10_000,
      currency: 'TRY',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/products',
      headers: {
        ...adminHeaders(),
        'content-type': multipartContentType(),
      },
      payload: multipartProductPayload(productInput, photo),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      slug: 'product-with-photo',
      imageUrl: expect.stringMatching(
        /^https:\/\/turkeyplanners\.test\/media\/products\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i,
      ),
    });
    expect(putPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: expect.stringMatching(/^products\/[0-9a-f-]{36}\//i),
        body: expect.any(Buffer),
      }),
    );

    const conflicting = await app.inject({
      method: 'POST',
      url: '/v1/admin/products',
      headers: {
        ...adminHeaders(),
        'content-type': multipartContentType(),
      },
      payload: multipartProductPayload(
        {
          ...productInput,
          slug: 'product-with-conflicting-photo',
          imageUrl: 'https://images.example.test/legacy.jpg',
        },
        photo,
      ),
    });

    expect(conflicting.statusCode).toBe(400);
    expect(putPhoto).toHaveBeenCalledTimes(1);
  });

  it('updates and deactivates a product while preserving its type rules', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Товары',
      slug: 'goods',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Ювелирное украшение',
      slug: 'jewellery',
      description: 'Украшение от турецкого производителя.',
      type: 'physical',
      priceMinor: 100_000,
      currency: 'TRY',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/products/${product.id}`,
      headers: adminHeaders(),
      payload: {
        title: 'Ювелирное украшение премиум',
        priceMinor: 125_000,
        isActive: false,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: product.id,
      title: 'Ювелирное украшение премиум',
      priceMinor: 125_000,
      currency: 'TRY',
      type: 'physical',
      isActive: false,
    });

    const audit = await pool.query<{
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
    }>(
      'select actor_id, action, entity_type, entity_id from audit_log where entity_id = $1 and action = $2',
      [product.id, 'product.updated'],
    );

    expect(audit.rows).toEqual([
      {
        actor_id: 'manager-42',
        action: 'product.updated',
        entity_type: 'product',
        entity_id: product.id,
      },
    ]);
  });

  it('deletes a product without orders and records the authenticated actor', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, { name: 'Удаляемые товары', slug: 'deletable-products' });
    const product = await createProduct(app, { categoryId: category.id, title: 'Удаляемый товар', slug: 'deletable-product', description: 'Тестовый товар без заказов.', type: 'booking' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/products/${product.id}`,
      headers: { ...adminHeaders(), 'x-admin-actor-id': 'catalog-delete-test' },
    });

    expect(response.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/products', headers: adminHeaders() })).json())
      .not.toContainEqual(expect.objectContaining({ id: product.id }));
    expect((await pool.query('select actor_id, action from audit_log where entity_id = $1', [product.id])).rows)
      .toContainEqual({ actor_id: 'catalog-delete-test', action: 'product.deleted' });
  });

  it('exposes only active catalog records to the public API', async () => {
    app = await createApp(appModule);
    const root = await createCategory(app, {
      name: 'Публичный каталог',
      slug: 'public-catalog',
    });
    const child = await createCategory(app, {
      name: 'Экскурсии',
      slug: 'public-excursions',
      parentId: root.id,
    });
    await createCategory(app, {
      name: 'Скрытая категория',
      slug: 'hidden-public-category',
      parentId: root.id,
      isActive: false,
    });
    const rootProduct = await createProduct(app, {
      categoryId: root.id,
      title: 'Трансфер из аэропорта',
      slug: 'public-airport-transfer',
      description: 'Индивидуальный трансфер.',
      type: 'auto_delivery',
      priceMinor: 5_000,
      currency: 'TRY',
    });
    const childProduct = await createProduct(app, {
      categoryId: child.id,
      title: 'Экскурсия в Каппадокию',
      slug: 'public-cappadocia-tour',
      description: 'Бронирование экскурсии.',
      type: 'booking',
    });
    const hiddenProduct = await createProduct(app, {
      categoryId: root.id,
      title: 'Скрытый товар',
      slug: 'hidden-public-product',
      description: 'Не должен быть доступен публично.',
      type: 'physical',
      priceMinor: 10_000,
      currency: 'TRY',
      isActive: false,
    });

    const categoriesResponse = await app.inject({
      method: 'GET',
      url: '/v1/public/categories',
    });

    expect(categoriesResponse.statusCode).toBe(200);
    expect(categoriesResponse.json()).toContainEqual(
      expect.objectContaining({
        id: root.id,
        children: [expect.objectContaining({ id: child.id })],
      }),
    );

    const productsResponse = await app.inject({
      method: 'GET',
      url: '/v1/public/products?categorySlug=public-catalog',
    });

    expect(productsResponse.statusCode).toBe(200);
    expect(productsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: rootProduct.id }),
        expect.objectContaining({ id: childProduct.id }),
      ]),
    );
    expect(productsResponse.json()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: hiddenProduct.id }),
      ]),
    );

    const catalogHealthResponse = await app.inject({
      method: 'GET',
      url: '/v1/public/catalog-health',
    });

    expect(catalogHealthResponse.statusCode).toBe(200);
    expect(catalogHealthResponse.json()).toMatchObject({
      total: expect.any(Number),
    });
    expect(catalogHealthResponse.json().total).toBeGreaterThanOrEqual(2);

    const productResponse = await app.inject({
      method: 'GET',
      url: '/v1/public/products/public-cappadocia-tour',
    });

    expect(productResponse.statusCode).toBe(200);
    expect(productResponse.json()).toMatchObject({ id: childProduct.id });

    const hiddenProductResponse = await app.inject({
      method: 'GET',
      url: '/v1/public/products/hidden-public-product',
    });

    expect(hiddenProductResponse.statusCode).toBe(404);
  });

  it('registers a user and authenticates the resulting server session', async () => {
    app = await createApp(appModule);

    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'traveler@example.test',
        password: 'correct-horse-battery-staple',
      },
    });

    expect(registration.statusCode).toBe(201);
    expect(registration.json()).toEqual({ email: 'traveler@example.test' });
    expect(registration.headers['set-cookie']).toMatch(/HttpOnly/i);
    expect(registration.headers['set-cookie']).toMatch(/SameSite=Lax/i);
    expect(
      await pool.query(
        "select type, idempotency_key from outbox_events where type = 'user.registered'",
      ),
    ).toMatchObject({
      rows: [
        {
          type: 'user.registered',
          idempotency_key: expect.stringMatching(/^user\.registered:/),
        },
      ],
    });

    const sessionCookie = Array.isArray(registration.headers['set-cookie'])
      ? registration.headers['set-cookie'][0]
      : registration.headers['set-cookie'];
    const profile = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: sessionCookie },
    });

    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual({ email: 'traveler@example.test' });
  });

  it('logs in with a password and revokes the session on logout', async () => {
    app = await createApp(appModule);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'login@example.test',
        password: 'correct-horse-battery-staple',
      },
    });

    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'login@example.test',
        password: 'correct-horse-battery-staple',
      },
    });

    expect(login.statusCode).toBe(201);
    const sessionCookie = Array.isArray(login.headers['set-cookie'])
      ? login.headers['set-cookie'][0]
      : login.headers['set-cookie'];

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie: sessionCookie },
    });

    expect(logout.statusCode).toBe(201);
    expect(logout.headers['set-cookie']).toMatch(/Max-Age=0/i);

    const profile = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie: sessionCookie },
    });

    expect(profile.statusCode).toBe(401);
  });

  it('requires trusted origin and a session-derived CSRF token for browser mutations', async () => {
    app = await createApp(appModule);
    const rejectedOrigin = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: 'https://untrusted.example.test' },
      payload: {
        email: 'cross-origin@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    expect(rejectedOrigin.statusCode).toBe(403);

    const category = await createCategory(app, {
      name: 'CSRF бронирование',
      slug: 'csrf-booking',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Бронирование для CSRF',
      slug: 'csrf-booking-product',
      description: 'Тестовая заявка с CSRF защитой.',
      type: 'booking',
    });

    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: 'https://shop.example.test' },
      payload: {
        email: 'csrf-owner@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const cookie = getSessionCookie(registration);
    const csrf = await app.inject({
      method: 'GET',
      url: '/v1/auth/csrf',
      headers: { cookie },
    });
    expect(csrf.statusCode).toBe(200);
    const token = csrf.json<{ token: string }>().token;

    const orderPayload = {
      productId: product.id,
      email: 'csrf-owner@example.test',
      phone: '+905551112233',
      bookingStartDate: '2026-09-10',
      bookingEndDate: '2026-09-12',
    };
    const missingOrderToken = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie, origin: 'https://shop.example.test' },
      payload: orderPayload,
    });
    expect(missingOrderToken.statusCode).toBe(403);
    const validOrder = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: {
        cookie,
        origin: 'https://shop.example.test',
        'x-csrf-token': token,
      },
      payload: orderPayload,
    });
    expect(validOrder.statusCode).toBe(201);

    const missingToken = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie, origin: 'https://shop.example.test' },
    });
    expect(missingToken.statusCode).toBe(403);
    const validLogout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: {
        cookie,
        origin: 'https://shop.example.test',
        'x-csrf-token': token,
      },
    });
    expect(validLogout.statusCode).toBe(201);
  });

  it('limits repeated login attempts with a hashed PostgreSQL identity key', async () => {
    app = await createApp(appModule);
    const request = {
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'limited-login@example.test',
        password: 'correct-horse-battery-staple',
      },
    } as const;
    expect((await app.inject(request)).statusCode).toBe(401);
    expect((await app.inject(request)).statusCode).toBe(401);
    expect((await app.inject(request)).statusCode).toBe(429);
    const stored = await pool.query<{ key_hash: string }>(
      'select key_hash from auth_rate_limits where attempts = 3',
    );
    expect(stored.rows).toEqual([
      { key_hash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(JSON.stringify(stored.rows)).not.toContain(
      'limited-login@example.test',
    );
  });

  it('creates a booking request from an active product for the authenticated user', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Аренда транспорта',
      slug: 'transport-rental',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Аренда яхты в Анталье',
      slug: 'antalya-yacht-rental',
      description: 'Индивидуальная заявка на аренду яхты.',
      type: 'booking',
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'booking@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const sessionCookie = getSessionCookie(registration);

    const request = {
      method: 'POST',
      url: '/v1/orders',
      headers: {
        cookie: sessionCookie,
        'idempotency-key': '018f71c1-4afe-7b1d-9f55-123456789a01',
      },
      payload: {
        productId: product.id,
        email: 'guest@example.test',
        phone: '+905551112233',
        bookingStartDate: '2026-09-10',
        bookingEndDate: '2026-09-12',
      },
    } as const;
    const response = await app.inject(request);
    const repeated = await app.inject(request);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      product: {
        id: product.id,
        title: 'Аренда яхты в Анталье',
        type: 'booking',
        priceMinor: null,
        currency: null,
      },
      email: 'guest@example.test',
      phone: '+905551112233',
      deliveryAddress: null,
      bookingStartDate: '2026-09-10',
      bookingEndDate: '2026-09-12',
    });
    expect(response.json()).not.toHaveProperty('isProcessed');
    const orderId = response.json<{ id: string }>().id;
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json<{ id: string }>().id).toBe(orderId);
    expect(
      await pool.query('select id from orders where idempotency_key = $1', [
        request.headers['idempotency-key'],
      ]),
    ).toMatchObject({ rows: [{ id: orderId }] });
    expect(
      await pool.query(
        'select type, aggregate_id, idempotency_key from outbox_events where aggregate_id = $1',
        [orderId],
      ),
    ).toMatchObject({
      rows: [
        {
          type: 'order.accepted',
          aggregate_id: orderId,
          idempotency_key: `order.accepted:${orderId}`,
        },
      ],
    });
  });

  it('creates a physical-product order with its server-side price snapshot', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Шопинг',
      slug: 'shopping-orders',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Ювелирное украшение',
      slug: 'jewellery-order',
      description: 'Украшение от турецкого производителя.',
      type: 'physical',
      priceMinor: 125_000,
      currency: 'TRY',
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'physical-order@example.test',
        password: 'correct-horse-battery-staple',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie: getSessionCookie(registration) },
      payload: {
        productId: product.id,
        email: 'delivery@example.test',
        phone: '+905551112233',
        deliveryAddress: 'Antalya, Konyaalti, Ataturk Blv. 10',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      product: {
        id: product.id,
        title: 'Ювелирное украшение',
        type: 'physical',
        priceMinor: 125_000,
        currency: 'TRY',
      },
      email: 'delivery@example.test',
      phone: '+905551112233',
      deliveryAddress: 'Antalya, Konyaalti, Ataturk Blv. 10',
      bookingStartDate: null,
      bookingEndDate: null,
    });
    expect(response.json()).not.toHaveProperty('isProcessed');
  });

  it('returns only the authenticated users order history', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'История заказов',
      slug: 'order-history',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Экскурсия на яхте',
      slug: 'history-yacht-trip',
      description: 'Заявка на морскую экскурсию.',
      type: 'booking',
    });
    const firstRegistration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'history-owner@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const ownerCookie = getSessionCookie(firstRegistration);

    await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie: ownerCookie },
      payload: {
        productId: product.id,
        email: 'history-owner@example.test',
        phone: '+905551112233',
        bookingStartDate: '2026-10-01',
        bookingEndDate: '2026-10-02',
      },
    });

    const secondRegistration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'another-traveler@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie: getSessionCookie(secondRegistration) },
      payload: {
        productId: product.id,
        email: 'another-traveler@example.test',
        phone: '+905554445566',
        bookingStartDate: '2026-10-03',
        bookingEndDate: '2026-10-04',
      },
    });

    const history = await app.inject({
      method: 'GET',
      url: '/v1/me/orders',
      headers: { cookie: ownerCookie },
    });

    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual([
      expect.objectContaining({
        product: expect.objectContaining({ id: product.id }),
        email: 'history-owner@example.test',
      }),
    ]);
    expect(history.json()[0]).not.toHaveProperty('isProcessed');
  });

  it('marks an order processed through the admin API and records the actor', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Обработка заявок',
      slug: 'order-processing',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Аренда вертолета',
      slug: 'helicopter-rental',
      description: 'Индивидуальная заявка на аренду вертолета.',
      type: 'booking',
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'process-order@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const order = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie: getSessionCookie(registration) },
      payload: {
        productId: product.id,
        email: 'process-order@example.test',
        phone: '+905551112233',
        bookingStartDate: '2026-11-01',
        bookingEndDate: '2026-11-02',
      },
    });
    const orderId = order.json<{ id: string }>().id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/orders/${orderId}`,
      headers: adminHeaders(),
      payload: { isProcessed: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: orderId,
      isProcessed: true,
    });

    const audit = await pool.query<{
      actor_id: string;
      action: string;
      entity_type: string;
      entity_id: string;
    }>(
      'select actor_id, action, entity_type, entity_id from audit_log where entity_id = $1 and action = $2',
      [orderId, 'order.processed'],
    );

    expect(audit.rows).toEqual([
      {
        actor_id: 'manager-42',
        action: 'order.processed',
        entity_type: 'order',
        entity_id: orderId,
      },
    ]);
  });

  it('lists orders with the contact data needed by the external admin', async () => {
    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Админские заявки',
      slug: 'admin-order-list',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Трансфер из аэропорта',
      slug: 'airport-transfer-admin-list',
      description: 'Трансфер в отель.',
      type: 'auto_delivery',
      priceMinor: 5_000,
      currency: 'TRY',
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'admin-list@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const order = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie: getSessionCookie(registration) },
      payload: {
        productId: product.id,
        email: 'contact@example.test',
        phone: '+905551112233',
      },
    });
    const orderId = order.json<{ id: string }>().id;

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/orders',
      headers: adminHeaders(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: orderId,
          email: 'contact@example.test',
          phone: '+905551112233',
          productTitle: 'Трансфер из аэропорта',
          isProcessed: false,
        }),
      ]),
    );
  });

  it('creates one hosted checkout using only the active SBP method', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            method: 'sbp',
            payment_mode: 'h2h',
            display_name: 'SBP',
            is_active: true,
            supported_currencies: ['RUB'],
          },
          {
            method: 'bank_card',
            payment_mode: 'h2h',
            display_name: 'Card',
            is_active: true,
            supported_currencies: ['RUB'],
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            id: '018f71c1-4afe-7b1d-9f55-123456789abc',
            url: 'https://checkout.arc.example.test/session/018f71c1',
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Оплата через Arc',
      slug: 'arc-checkout',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Туристическая eSIM',
      slug: 'travel-esim-checkout',
      description: 'Электронная SIM-карта для поездки.',
      type: 'auto_delivery',
      priceMinor: 1_990,
      currency: 'RUB',
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'checkout-owner@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const cookie = getSessionCookie(registration);
    const order = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie },
      payload: {
        productId: product.id,
        email: 'checkout-owner@example.test',
        phone: '+905551112233',
      },
    });
    const orderId = order.json<{ id: string }>().id;

    const created = await app.inject({
      method: 'POST',
      url: `/v1/orders/${orderId}/checkout`,
      headers: { cookie },
    });
    const repeated = await app.inject({
      method: 'POST',
      url: `/v1/orders/${orderId}/checkout`,
      headers: { cookie },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({
      checkoutUrl: 'https://checkout.arc.example.test/session/018f71c1',
    });
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json()).toEqual(created.json());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://arc.example.test/v1/payment-methods/available?environment=sandbox',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://arc.example.test/v1/checkout/sessions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"amount":1990'),
      }),
    );
    const checkoutRequest = fetchMock.mock.calls[1]?.[1];
    expect(JSON.parse(String(checkoutRequest?.body))).toMatchObject({
      description: '-',
      payment_methods: [{ method: 'sbp', payment_mode: 'h2h' }],
      success_url: `https://shop.example.test/checkout/return?order=${orderId}&result=success`,
      fail_url: `https://shop.example.test/checkout/return?order=${orderId}&result=failed`,
      cancel_url: `https://shop.example.test/checkout/return?order=${orderId}&result=cancelled`,
    });
  });

  it('correlates a signed capture webhook by Arc payment_id and creates the order notification event once', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            method: 'sbp',
            payment_mode: 'h2h',
            display_name: 'SBP',
            is_active: true,
            supported_currencies: ['RUB'],
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            id: '018f71c1-4afe-7b1d-9f55-123456789abd',
            url: 'https://checkout.arc.example.test/session/018f71c2',
          },
          { status: 201 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    app = await createApp(appModule);
    const category = await createCategory(app, {
      name: 'Webhook оплаты',
      slug: 'payment-webhook',
    });
    const product = await createProduct(app, {
      categoryId: category.id,
      title: 'Туристическая SIM-карта',
      slug: 'travel-sim-webhook',
      description: 'SIM-карта с доставкой на email.',
      type: 'auto_delivery',
      priceMinor: 1_990,
      currency: 'RUB',
    });
    const registration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'webhook-owner@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const cookie = getSessionCookie(registration);
    const order = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { cookie },
      payload: {
        productId: product.id,
        email: 'webhook-owner@example.test',
        phone: '+905551112233',
      },
    });
    const orderId = order.json<{ id: string }>().id;
    await app.inject({
      method: 'POST',
      url: `/v1/orders/${orderId}/checkout`,
      headers: { cookie },
    });
    const payment = await pool.query<{ id: string }>(
      'select id from payments where order_id = $1',
      [orderId],
    );
    const paymentId = payment.rows[0]?.id;

    if (!paymentId) {
      throw new Error('Expected checkout payment record.');
    }

    const pendingReturn = await app.inject({
      method: 'GET',
      url: `/v1/me/orders/${orderId}`,
      headers: { cookie },
    });
    expect(pendingReturn.statusCode).toBe(200);
    expect(pendingReturn.json()).toMatchObject({
      id: orderId,
      payment: { state: 'pending' },
    });
    const otherRegistration = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'other-return-owner@example.test',
        password: 'correct-horse-battery-staple',
      },
    });
    const forbiddenReturn = await app.inject({
      method: 'GET',
      url: `/v1/me/orders/${orderId}`,
      headers: { cookie: getSessionCookie(otherRegistration) },
    });
    expect(forbiddenReturn.statusCode).toBe(404);

    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: '018f71c1-4afe-7b1d-9f55-123456789abf',
        external_id: orderId,
      }),
    );

    const eventId = '018f71c1-4afe-7b1d-9f55-123456789abe';
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const body = JSON.stringify({
      event_type: 'payment.captured',
      data: {
        payment_id: '018f71c1-4afe-7b1d-9f55-123456789abf',
      },
    });
    const signature = createHmac('sha256', 'test-webhook-secret')
      .update(`${eventId}.${timestamp}.${body}`)
      .digest('hex');
    const headers = {
      'content-type': 'application/json',
      'webhook-id': eventId,
      'webhook-signature': `t=${timestamp},v1=${signature}`,
      'webhook-timestamp': timestamp,
    };

    const captured = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/arc',
      headers,
      payload: body,
    });
    const repeated = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/arc',
      headers,
      payload: body,
    });

    expect(captured.statusCode).toBe(204);
    expect(repeated.statusCode).toBe(204);
    const succeededReturn = await app.inject({
      method: 'GET',
      url: `/v1/me/orders/${orderId}`,
      headers: { cookie },
    });
    expect(succeededReturn.statusCode).toBe(200);
    expect(succeededReturn.json()).toMatchObject({
      id: orderId,
      payment: { state: 'succeeded' },
    });
    expect(
      await pool.query(
        'select state, provider_payment_id from payments where id = $1',
        [paymentId],
      ),
    ).toMatchObject({
      rows: [
        {
          state: 'succeeded',
          provider_payment_id: '018f71c1-4afe-7b1d-9f55-123456789abf',
        },
      ],
    });
    expect(
      await pool.query(
        'select type, aggregate_id, idempotency_key from outbox_events where aggregate_id = $1',
        [orderId],
      ),
    ).toMatchObject({
      rows: [
        {
          type: 'order.accepted',
          aggregate_id: orderId,
          idempotency_key: `order.accepted:${orderId}`,
        },
      ],
    });

    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          id: '018f71c1-4afe-7b1d-9f55-123456789ac0',
          payment_id: '018f71c1-4afe-7b1d-9f55-123456789abf',
          amount: 1_990,
          currency: 'RUB',
          status: 'succeeded',
          created_at: '2026-08-04T18:00:00.000Z',
        },
        { status: 201 },
      ),
    );
    const refund = await app.inject({
      method: 'POST',
      url: `/v1/admin/orders/${orderId}/refund`,
      headers: adminHeaders(),
    });

    expect(refund.statusCode).toBe(201);
    expect(refund.json()).toMatchObject({
      amountMinor: 1_990,
      currency: 'RUB',
      state: 'succeeded',
      providerRefundId: '018f71c1-4afe-7b1d-9f55-123456789ac0',
    });
    const history = await app.inject({
      method: 'GET',
      url: '/v1/me/orders',
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual([
      expect.objectContaining({
        id: orderId,
        refund: { state: 'succeeded' },
      }),
    ]);
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://arc.example.test/v1/payments/018f71c1-4afe-7b1d-9f55-123456789abf/refunds',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ amount: 1_990 }),
      }),
    );
    const duplicateRefund = await app.inject({
      method: 'POST',
      url: `/v1/admin/orders/${orderId}/refund`,
      headers: adminHeaders(),
    });
    expect(duplicateRefund.statusCode).toBe(409);
  });

  it('rejects an Arc webhook before parsing an unsigned body', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/arc',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    });

    expect(response.statusCode).toBe(401);
  });
});

function adminHeaders() {
  return {
    'x-admin-api-key': 'test-static-admin-key',
    'x-admin-actor-id': 'manager-42',
  };
}

function getSessionCookie(response: {
  headers: Record<string, string | string[] | number | undefined>;
}): string {
  const sessionCookie = Array.isArray(response.headers['set-cookie'])
    ? response.headers['set-cookie'][0]
    : response.headers['set-cookie'];

  if (typeof sessionCookie !== 'string') {
    throw new Error('Expected a session cookie.');
  }

  return sessionCookie;
}

async function createCategory(
  app: NestFastifyApplication,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/categories',
    headers: adminHeaders(),
    payload,
  });

  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>();
}

async function createProduct(
  app: NestFastifyApplication,
  payload: Record<string, unknown>,
): Promise<{ id: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/products',
    headers: adminHeaders(),
    payload,
  });

  expect(response.statusCode).toBe(201);
  return response.json<{ id: string }>();
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

const multipartBoundary = 'turkiye-product-photo-boundary';

function multipartContentType(): string {
  return `multipart/form-data; boundary=${multipartBoundary}`;
}

function multipartProductPayload(
  product: Record<string, unknown>,
  photo: Buffer,
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${multipartBoundary}\r\nContent-Disposition: form-data; name="product"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(product)}\r\n--${multipartBoundary}\r\nContent-Disposition: form-data; name="photo"; filename="product.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    photo,
    Buffer.from(`\r\n--${multipartBoundary}--\r\n`),
  ]);
}
