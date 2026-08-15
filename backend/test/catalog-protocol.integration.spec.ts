import type { Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
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
import { MinioProductMediaStorage } from '../src/modules/media/minio-product-media.storage.js';
import { startPostgres } from './support/postgres.js';

describe('Catalog Protocol v1', () => {
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
    process.env.WEB_APP_ORIGIN = 'https://shop.example.test';
    await runMigrations(process.env.DATABASE_URL);
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    ({ AppModule: appModule } = await import('../src/app.module.js'));
  });

  beforeEach(async () => {
    await pool.query(
      'truncate table audit_log, catalog_protocol_operations, catalog_protocol_uploads, product_destinations, orders, products, destinations, categories restart identity cascade',
    );
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();
    restoreEnvironment('DATABASE_URL', previousDatabaseUrl);
  });

  it('publishes a secret-free manifest with catalog, destinations, and store-order capabilities', async () => {
    app = await createApp(appModule);

    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/vv-admin/manifest.json',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      protocolVersion: 1,
      site: {
        key: 'turkiye',
        publicOrigin: 'https://turkeyplanners.com',
        adminOrigin: 'https://turkeyplanners.com/api',
      },
      catalog: {
        version: 1,
        baseUrl: 'https://turkeyplanners.com/api/admin/integration/catalog/v1',
        auth: { scheme: 'vv_hmac_v1' },
        categories: { maxDepth: 2 },
        resources: {
          destinations: { enabled: true, orderedProductMembership: true },
          offers: { enabled: true },
          products: { enabled: true },
        },
      },
      storeOrders: {
        version: 1,
        baseUrl:
          'https://turkeyplanners.com/api/admin/integration/store-orders/v1',
      },
    });
    expect(JSON.stringify(response.json())).not.toContain(
      process.env.VV_ADMIN_INTEGRATION_SECRET,
    );
  });

  it('creates, paginates, revision-checks, and idempotently replays categories', async () => {
    app = await createApp(appModule);
    const firstBody = JSON.stringify({
      name: { ru: 'Экскурсии' },
      slug: 'protocol-excursions',
      parentId: null,
      image: null,
      sortOrder: 10,
      isActive: true,
    });
    const firstRequest = signedRequest(
      'POST',
      '/admin/integration/catalog/v1/categories',
      firstBody,
    );

    const first = await app.inject({
      method: 'POST',
      url: '/admin/integration/catalog/v1/categories',
      headers: firstRequest.headers,
      payload: firstBody,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/admin/integration/catalog/v1/categories',
      headers: firstRequest.headers,
      payload: firstBody,
    });

    expect(first.statusCode).toBe(201);
    expect(first.headers.etag).toBe('"1"');
    expect(first.json()).toMatchObject({
      operationId: expect.any(String),
      resource: {
        revision: '1',
        name: { ru: 'Экскурсии' },
        slug: 'protocol-excursions',
      },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());

    const operationId = first.json<{ operationId: string }>().operationId;
    const operationPath = `/admin/integration/catalog/v1/operations/${operationId}`;
    const operation = await app.inject({
      method: 'GET',
      url: operationPath,
      headers: signedRequest('GET', operationPath).headers,
    });
    expect(operation.statusCode).toBe(201);
    expect(operation.json()).toEqual(first.json());

    const second = await createCategory(app, {
      name: { ru: 'Трансферы' },
      slug: 'protocol-transfers',
      parentId: null,
      image: null,
      sortOrder: 20,
      isActive: true,
    });
    const pagePath = '/admin/integration/catalog/v1/categories?limit=1';
    const page = await app.inject({
      method: 'GET',
      url: pagePath,
      headers: signedRequest('GET', pagePath).headers,
    });

    expect(page.statusCode).toBe(200);
    expect(page.json()).toMatchObject({
      items: [expect.objectContaining({ slug: 'protocol-excursions' })],
      nextCursor: expect.any(String),
    });
    expect(second.resource.slug).toBe('protocol-transfers');

    const id = first.json<{ resource: { id: string } }>().resource.id;
    const patchBody = JSON.stringify({ name: { ru: 'Экскурсии Турции' } });
    const patchPath = `/admin/integration/catalog/v1/categories/${id}`;
    const updated = await app.inject({
      method: 'PATCH',
      url: patchPath,
      headers: {
        ...signedRequest('PATCH', patchPath, patchBody).headers,
        'if-match': '"1"',
      },
      payload: patchBody,
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.json()).toMatchObject({
      resource: { revision: '2', name: { ru: 'Экскурсии Турции' } },
    });

    const staleBody = JSON.stringify({ isActive: false });
    const stale = await app.inject({
      method: 'PATCH',
      url: patchPath,
      headers: {
        ...signedRequest('PATCH', patchPath, staleBody).headers,
        'if-match': '"1"',
      },
      payload: staleBody,
    });

    expect(stale.statusCode).toBe(412);
    expect(stale.headers['content-type']).toContain('application/problem+json');
    expect(stale.json()).toMatchObject({
      type: 'catalog/revision-conflict',
      status: 412,
    });
  });

  it('rejects a third category level with a safe problem response', async () => {
    app = await createApp(appModule);
    const root = await createCategory(app, categoryInput('protocol-root'));
    const child = await createCategory(
      app,
      categoryInput('protocol-child', root.resource.id),
    );
    const body = JSON.stringify(
      categoryInput('protocol-grandchild', child.resource.id),
    );
    const path = '/admin/integration/catalog/v1/categories';

    const response = await app.inject({
      method: 'POST',
      url: path,
      headers: signedRequest('POST', path, body).headers,
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json()).toMatchObject({
      type: 'catalog/invalid-request',
      status: 400,
    });
    expect(JSON.stringify(response.json())).not.toMatch(
      /postgres|relation|constraint|select|insert/i,
    );
  });

  it('maps a product to one default offer and updates offer fields with the product revision', async () => {
    app = await createApp(appModule);
    const category = await createCategory(
      app,
      categoryInput('protocol-products'),
    );
    const product = await createProduct(app, {
      categoryId: category.resource.id,
      title: { ru: 'Цифровой гид' },
      slug: 'protocol-yacht-booking',
      description: { ru: 'Автоматическая доставка после оплаты.' },
      media: [],
      sortOrder: 10,
      isActive: false,
      attributes: { type: 'auto_delivery' },
    });
    const offerPath = `/admin/integration/catalog/v1/offers?productId=${product.resource.id}`;
    const offers = await app.inject({
      method: 'GET',
      url: offerPath,
      headers: signedRequest('GET', offerPath).headers,
    });

    expect(offers.statusCode).toBe(200);
    expect(offers.json()).toEqual({
      items: [
        {
          id: product.resource.id,
          revision: '1',
          productId: product.resource.id,
          sellerId: null,
          price: null,
          availability: null,
          minimumQuantity: null,
          packageQuantity: null,
          delivery: null,
          isActive: false,
          attributes: { type: 'auto_delivery' },
        },
      ],
      nextCursor: null,
    });

    const patchPath = `/admin/integration/catalog/v1/offers/${product.resource.id}`;
    const patchBody = JSON.stringify({
      price: { amountMinor: 25_000, currency: 'RUB', scale: 100 },
      isActive: true,
      attributes: { type: 'auto_delivery' },
    });
    const updated = await app.inject({
      method: 'PATCH',
      url: patchPath,
      headers: {
        ...signedRequest('PATCH', patchPath, patchBody).headers,
        'if-match': '"1"',
      },
      payload: patchBody,
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.json()).toMatchObject({
      resource: {
        revision: '2',
        price: { amountMinor: 25_000, currency: 'RUB', scale: 100 },
        attributes: { type: 'auto_delivery' },
      },
    });

    const missingPrecondition = await app.inject({
      method: 'DELETE',
      url: patchPath,
      headers: signedRequest('DELETE', patchPath).headers,
    });
    expect(missingPrecondition.statusCode).toBe(428);
    expect(missingPrecondition.json()).toMatchObject({
      type: 'catalog/precondition-required',
      status: 428,
    });

    const staleDelete = await app.inject({
      method: 'DELETE',
      url: patchPath,
      headers: {
        ...signedRequest('DELETE', patchPath).headers,
        'if-match': '"1"',
      },
    });
    expect(staleDelete.statusCode).toBe(412);
    expect(staleDelete.json()).toMatchObject({
      type: 'catalog/revision-conflict',
      status: 412,
    });

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: patchPath,
      headers: {
        ...signedRequest('DELETE', patchPath).headers,
        'if-match': '"2"',
      },
    });

    expect(deleteResponse.statusCode).toBe(409);
    expect(deleteResponse.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(deleteResponse.json()).toMatchObject({
      type: 'catalog/conflict',
      status: 409,
      operationId: expect.any(String),
    });
  });

  it('creates destinations, manages ordered membership, and dry-runs deletion without mutating', async () => {
    app = await createApp(appModule);
    const category = await createCategory(
      app,
      categoryInput('protocol-destination-products'),
    );
    const product = await createProduct(app, {
      categoryId: category.resource.id,
      title: { ru: 'Прогулка' },
      slug: 'protocol-destination-product',
      description: { ru: 'Описание прогулки.' },
      media: [],
      sortOrder: 0,
      isActive: true,
      attributes: { type: 'booking' },
    });
    const destination = await createDestination(app, {
      name: { ru: 'Стамбул' },
      slug: 'protocol-istanbul',
      description: { ru: 'Город на Босфоре.' },
      image: null,
      sortOrder: 10,
      isActive: true,
      attributes: { region: 'Мраморноморский регион' },
    });
    const membershipPath = `/admin/integration/catalog/v1/destinations/${destination.resource.id}/products/${product.resource.id}`;
    const membershipBody = JSON.stringify({ sortOrder: 7 });
    const membership = await app.inject({
      method: 'PUT',
      url: membershipPath,
      headers: signedRequest('PUT', membershipPath, membershipBody).headers,
      payload: membershipBody,
    });

    expect(membership.statusCode).toBe(200);
    expect(membership.json()).toMatchObject({
      resource: {
        destinationId: destination.resource.id,
        productId: product.resource.id,
        sortOrder: 7,
      },
    });

    const deletePath = `/admin/integration/catalog/v1/destinations/${destination.resource.id}?dryRun=true`;
    const dryRun = await app.inject({
      method: 'DELETE',
      url: deletePath,
      headers: {
        ...signedRequest('DELETE', deletePath).headers,
        'if-match': '"1"',
      },
    });

    expect(dryRun.statusCode, dryRun.body).toBe(200);
    expect(dryRun.json()).toMatchObject({
      resource: {
        result: {
          resourceId: destination.resource.id,
          resourceType: 'destination',
          dryRun: true,
          permitted: false,
          blockingReferences: { destinationProducts: 1 },
        },
      },
    });
    const persisted = await pool.query(
      'select id from destinations where id = $1',
      [destination.resource.id],
    );
    expect(persisted.rowCount).toBe(1);
  });

  it('rejects a confirmed deletion when blocking references remain', async () => {
    app = await createApp(appModule);
    const category = await createCategory(
      app,
      categoryInput('protocol-blocked-delete-products'),
    );
    const product = await createProduct(app, {
      categoryId: category.resource.id,
      title: { ru: 'Заблокированный товар' },
      slug: 'protocol-blocked-delete-product',
      description: { ru: 'Товар связан с направлением.' },
      media: [],
      sortOrder: 0,
      isActive: true,
      attributes: { type: 'booking' },
    });
    const destination = await createDestination(app, {
      name: { ru: 'Анталья' },
      slug: 'protocol-blocked-delete-destination',
      description: { ru: 'Направление с товаром.' },
      image: null,
      sortOrder: 0,
      isActive: true,
      attributes: { region: 'Средиземноморский регион' },
    });
    const membershipPath = `/admin/integration/catalog/v1/destinations/${destination.resource.id}/products/${product.resource.id}`;
    const membershipBody = JSON.stringify({ sortOrder: 0 });
    await app.inject({
      method: 'PUT',
      url: membershipPath,
      headers: signedRequest('PUT', membershipPath, membershipBody).headers,
      payload: membershipBody,
    });
    const deletePath = `/admin/integration/catalog/v1/products/${product.resource.id}`;

    const response = await app.inject({
      method: 'DELETE',
      url: deletePath,
      headers: {
        ...signedRequest('DELETE', deletePath).headers,
        'if-match': '"1"',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json()).toMatchObject({
      type: 'catalog/conflict',
      status: 409,
      operationId: expect.any(String),
    });
    expect(
      (
        await pool.query('select id from products where id = $1', [
          product.resource.id,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it('uploads and consumes managed media without accepting a forged managed reference', async () => {
    app = await createApp(appModule);
    const putWebp = vi
      .spyOn(MinioProductMediaStorage.prototype, 'putWebp')
      .mockResolvedValue(undefined);
    const photo = await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: '#0a7f4f',
      },
    })
      .png()
      .toBuffer();
    const uploadPath = '/admin/integration/catalog/v1/media';
    const multipart = multipartPhoto(photo);
    const upload = await app.inject({
      method: 'POST',
      url: uploadPath,
      headers: {
        ...signedRequest('POST', uploadPath, multipart).headers,
        'content-type': `multipart/form-data; boundary=${multipartBoundary}`,
      },
      payload: multipart,
    });

    expect(upload.statusCode).toBe(201);
    expect(upload.json()).toMatchObject({
      resource: {
        id: expect.any(String),
        url: expect.stringContaining('/products/uploads/'),
        alt: null,
      },
    });
    expect(putWebp).toHaveBeenCalledOnce();

    const category = await createCategory(
      app,
      categoryInput('protocol-media-products'),
    );
    const media = upload.json<{ resource: { id: string; url: string } }>()
      .resource;
    const product = await createProduct(app, {
      categoryId: category.resource.id,
      title: { ru: 'Товар с фото' },
      slug: 'protocol-product-with-photo',
      description: { ru: 'Описание товара с фото.' },
      media: [{ ...media, alt: { ru: 'Фото товара' } }],
      sortOrder: 0,
      isActive: true,
      attributes: { type: 'booking' },
    });

    expect(product.resource.media).toEqual([
      expect.objectContaining({ id: media.id, url: media.url }),
    ]);
    expect(
      (
        await pool.query<{ consumed_at: Date | null }>(
          'select consumed_at from catalog_protocol_uploads where id = $1',
          [media.id],
        )
      ).rows[0]?.consumed_at,
    ).toBeInstanceOf(Date);

    const forged = await createProductResponse(app, {
      categoryId: category.resource.id,
      title: { ru: 'Поддельное фото' },
      slug: 'protocol-forged-photo',
      description: { ru: 'Поддельная ссылка загрузки.' },
      media: [
        {
          id: randomUUID(),
          url: `${process.env.MEDIA_PUBLIC_BASE_URL}/products/uploads/${randomUUID()}.webp`,
          alt: null,
        },
      ],
      sortOrder: 0,
      isActive: true,
      attributes: { type: 'booking' },
    });

    expect(forged.statusCode).toBe(400);
    expect(forged.headers['content-type']).toContain(
      'application/problem+json',
    );
  });
});

type ProtocolResource<T> = Readonly<{
  operationId: string;
  resource: T;
}>;

function categoryInput(slug: string, parentId: string | null = null) {
  return {
    name: { ru: slug },
    slug,
    parentId,
    image: null,
    sortOrder: 0,
    isActive: true,
  };
}

async function createCategory(
  app: NestFastifyApplication,
  input: Record<string, unknown>,
): Promise<ProtocolResource<{ id: string; slug: string }>> {
  const body = JSON.stringify(input);
  const path = '/admin/integration/catalog/v1/categories';
  const response = await app.inject({
    method: 'POST',
    url: path,
    headers: signedRequest('POST', path, body).headers,
    payload: body,
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createProduct(
  app: NestFastifyApplication,
  input: Record<string, unknown>,
): Promise<ProtocolResource<Record<string, unknown> & { id: string }>> {
  const response = await createProductResponse(app, input);
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createProductResponse(
  app: NestFastifyApplication,
  input: Record<string, unknown>,
) {
  const body = JSON.stringify(input);
  const path = '/admin/integration/catalog/v1/products';
  return app.inject({
    method: 'POST',
    url: path,
    headers: signedRequest('POST', path, body).headers,
    payload: body,
  });
}

async function createDestination(
  app: NestFastifyApplication,
  input: Record<string, unknown>,
): Promise<ProtocolResource<{ id: string }>> {
  const body = JSON.stringify(input);
  const path = '/admin/integration/catalog/v1/destinations';
  const response = await app.inject({
    method: 'POST',
    url: path,
    headers: signedRequest('POST', path, body).headers,
    payload: body,
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

function signedRequest(
  method: string,
  path: string,
  body: string | Buffer = '',
) {
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const canonical = `v1.${timestamp}.${requestId}.${method}.${path}.${digest}`;
  const signature = createHmac(
    'sha256',
    process.env.VV_ADMIN_INTEGRATION_SECRET!,
  )
    .update(canonical)
    .digest('hex');

  return {
    headers: {
      ...(bytes.length > 0 ? { 'content-type': 'application/json' } : {}),
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
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const multipartBoundary = 'catalog-protocol-upload-boundary';

function multipartPhoto(photo: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${multipartBoundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    photo,
    Buffer.from(`\r\n--${multipartBoundary}--\r\n`),
  ]);
}
