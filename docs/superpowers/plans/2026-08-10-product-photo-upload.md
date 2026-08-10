# Product Photo Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let VV Admin attach one validated product photo that Turkiye stores in MinIO and serves from a stable public /media/ URL.

**Architecture:** The browser sends a selected file only to VV Admin. The existing typed connector forwards it with the current server-to-server credentials and actor header to Turkiye. Turkiye normalizes it to WebP and owns MinIO. The current products.image_url column stays the only product-media reference, so no catalog migration is needed.

**Tech Stack:** Node 24, NestJS 11 with Fastify and Express, Drizzle/PostgreSQL, fastify multipart, sharp, AWS SDK v3 S3 client, MinIO, Next.js 16, React 19, Vitest, Docker Compose.

## Global Constraints

- One optional photo per product. No gallery, category uploads, deletion UI, direct browser-to-MinIO upload, CDN, or generic file manager.
- Allow one JPEG, PNG, or WebP input at most 5,242,880 bytes. Server-decode it, limit its longest side to 2560 pixels, and emit WebP at quality 82.
- Preserve current JSON product mutation. Multipart has a product JSON field and optional photo field; reject a non-null imageUrl together with a photo.
- Do not trust a browser filename, MIME type, image URL, path, actor, connector, or secret.
- MinIO has no public host port or Console route. Only one bucket read path is proxied under /media/. API and worker use a non-root write/list/delete key.
- Work directly on main. Preserve VV Admin pre-existing dirty report files; stage only owned paths.
- No production deployment, secret update, real catalog write, payment, refund, email, or Slack delivery is authorized.

## File Structure

| Repository | Files | Responsibility |
| --- | --- | --- |
| Turkiye | backend/src/modules/media/* | Image validation/conversion, managed URL/key logic, MinIO adapter, cleanup. |
| Turkiye | backend/src/modules/catalog/* | JSON-or-multipart product boundary and object lifecycle. |
| Turkiye | compose.prod.yml, backend/.env.example, runbook | Private MinIO, init, public media proxy, deployment preflight. |
| VV Admin | packages/domain/src/catalog.ts, packages/contracts/src/index.ts | Photo capability and transport types. |
| VV Admin | apps/api/src/catalog/* | Browser multipart parsing and trusted connector forwarding. |
| VV Admin | apps/web/lib/catalog-api.ts, catalog-management components | FormData, one-file selection and preview. |

---

### Task 1: Add Turkiye media configuration and storage boundary

**Files:**
- Create: backend/src/modules/media/media.constants.ts
- Create: backend/src/modules/media/product-media.types.ts
- Create: backend/src/modules/media/product-media.service.ts
- Create: backend/src/modules/media/minio-product-media.storage.ts
- Create: backend/src/modules/media/media.module.ts
- Create: backend/test/product-media.service.spec.ts
- Modify: backend/src/config/env.ts
- Modify: backend/src/app.module.ts
- Modify: backend/package.json and backend/package-lock.json
- Modify: backend/test/config.spec.ts

**Interfaces:**
- Consumes: ConfigService<AppEnv, true>.
- Produces:

~~~ts
export const PRODUCT_PHOTO_MAX_BYTES = 5_242_880;
export type ProductPhotoUpload = Readonly<{ buffer: Buffer; byteLength: number }>;
export type StoredProductPhoto = Readonly<{ objectKey: string; imageUrl: string }>;
export interface ProductMediaStorage {
  putWebp(input: { objectKey: string; body: Buffer }): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
  listProductObjects(): Promise<ReadonlyArray<{ objectKey: string; lastModified: Date }>>;
}
export class ProductMediaService {
  store(productId: string, upload: ProductPhotoUpload): Promise<StoredProductPhoto>;
  isManagedImageUrl(value: string | null): boolean;
  objectKeyFromManagedImageUrl(value: string): string | null;
}
~~~

- [ ] **Step 1: Write failing tests**

Test a one-pixel PNG through fake storage: it must write decodable WebP at products/product-1/random.webp and return a URL under https://turkeyplanners.test/media/products/product-1/. Add failures for 5,242,881 bytes, SVG bytes and corrupt bytes. Extend config tests to reject an invalid MinIO endpoint and a non-HTTPS public-media URL.

Run: cd backend && npm run test -- product-media.service.spec.ts config.spec.ts

Expected: FAIL because media code and environment fields do not exist.

- [ ] **Step 2: Add dependencies and strict configuration**

Run:

~~~bash
cd backend
npm install @aws-sdk/client-s3 @fastify/multipart sharp
~~~

Add MINIO_ENDPOINT, MINIO_BUCKET, MINIO_ACCESS_KEY, MINIO_SECRET_KEY and MEDIA_PUBLIC_BASE_URL to env.ts. MINIO_ENDPOINT is a URL; MEDIA_PUBLIC_BASE_URL must be HTTPS and have no query or fragment. Update all config-test fixtures with non-secret test values.

- [ ] **Step 3: Implement normalization and MinIO adapter**

Use sharp with limitInputPixels 40,000,000. Allow metadata formats jpeg, png and webp only. Apply rotate, inside resize of 2560 by 2560 without enlargement, then WebP quality 82. Generate object keys only as products/product UUID/random UUID.webp.

Create the S3 client with endpoint MINIO_ENDPOINT, forcePathStyle true, region us-east-1, and non-root app credentials. Put with ContentType image/webp and no source filename metadata. Paginate ListObjectsV2 only over literal prefix products/. Build public URLs solely from MEDIA_PUBLIC_BASE_URL plus an encoded generated key.

- [ ] **Step 4: Verify and commit**

Run:

~~~bash
cd backend
npm run test -- product-media.service.spec.ts config.spec.ts
npm run typecheck
npm run lint
git add backend/package.json backend/package-lock.json backend/src/config/env.ts backend/src/app.module.ts backend/src/modules/media backend/test/product-media.service.spec.ts backend/test/config.spec.ts
git commit -m "feat(turkiye): add product media storage boundary"
~~~

Expected: all checks pass before commit.

### Task 2: Provision private MinIO and document the public media route

**Files:**
- Modify: compose.prod.yml
- Modify: compose.dev.yml
- Modify: backend/.env.example
- Modify: docs/development/production-runbook.md
- Create: backend/test/product-media-compose.spec.ts

**Interfaces:**
- Consumes: Task 1 media environment.
- Produces: minio, one-shot minio-init, named turkiye-minio-data volume, and literal /media/ proxy guidance.

- [ ] **Step 1: Write failing operational topology test**

Read production/dev Compose, the example environment, and the runbook. Assert production MinIO has no ports entry, persists only turkiye-minio-data, and init waits for MinIO health. Assert production API/worker wait for init success. Assert development Compose exposes MinIO only on loopback port 9000 and has the same named volume/init contract. Assert the runbook has location ^~ /media/ proxying only /turkiye-catalog-media/ to http://minio:9000 and no Console route.

Run: cd backend && npm run test -- product-media-compose.spec.ts

Expected: FAIL because storage topology is absent.

- [ ] **Step 2: Implement MinIO and idempotent bucket initialization**

Add a production MinIO service using command server /data --console-address :9001 and a healthcheck at /minio/health/live, without a host port. Add matching mc init service that creates bucket turkiye-catalog-media, enables anonymous download only for this bucket, creates/verifies the application user, and attaches policy limited to PutObject, GetObject, DeleteObject and ListBucket for this bucket/products prefix. Add the same MinIO/init pair to development Compose, publishing only 127.0.0.1:9000 for local API/browser proof.

Pass root credentials only to MinIO/init. Pass endpoint, bucket, public base URL and non-root application credentials to API/worker. Document variable names with placeholders only. Add this exact host-owner proxy contract:

~~~nginx
location ^~ /media/ {
  proxy_pass http://minio:9000/turkiye-catalog-media/;
  proxy_set_header Host $host;
  proxy_hide_header x-amz-request-id;
}
~~~

- [ ] **Step 3: Verify and commit**

Run:

~~~bash
docker compose --env-file .env.example -f compose.prod.yml config
docker compose --env-file backend/.env.example -f compose.dev.yml config
cd backend && npm run test -- product-media-compose.spec.ts
git add compose.prod.yml compose.dev.yml backend/.env.example docs/development/production-runbook.md backend/test/product-media-compose.spec.ts
git commit -m "feat(turkiye): provision private MinIO product media"
~~~

Expected: source test passes. If config reports only intentionally unset existing deployment secrets, record it; do not start production services.

### Task 3: Add safe multipart product create/update in Turkiye

**Files:**
- Create: backend/src/modules/catalog/product-multipart.input.ts
- Modify: backend/src/common/app-factory.ts
- Modify: backend/src/modules/catalog/catalog.module.ts
- Modify: backend/src/modules/catalog/admin-product.controller.ts
- Modify: backend/src/modules/catalog/catalog.service.ts
- Modify: backend/test/admin-catalog.integration.spec.ts

**Interfaces:**
- Consumes: ProductMediaService from Task 1.
- Produces:

~~~ts
type ProductMutationPayload = Readonly<{ input: unknown; photo: ProductPhotoUpload | null }>;
createProduct(actor: AuthenticatedAdmin, input: unknown, photo?: ProductPhotoUpload): Promise<Product>;
updateProduct(id: string, actor: AuthenticatedAdmin, input: unknown, photo?: ProductPhotoUpload): Promise<Product>;
~~~

- [ ] **Step 1: Write failing multipart integration tests**

Inject multipart product JSON and one PNG with current static API key and actor headers. Assert 201, a public image URL ending .webp, and audit metadata free of source filename. Add missing key, two photo parts, oversized body, SVG, malformed JSON, and photo plus non-null imageUrl cases; each must return safe 400 or 401 and write neither product nor object. Add PATCH replacement proof: delete a previous managed key only after the row changes, and never delete a legacy external URL.

Run: cd backend && npm run test:integration -- admin-catalog.integration.spec.ts

Expected: FAIL because Fastify currently handles JSON only.

- [ ] **Step 2: Parse multipart without breaking Arc raw webhook validation**

Register fastify multipart in createApiApp with files 1, fileSize PRODUCT_PHOTO_MAX_BYTES, fields 1, parts 2. Keep the raw JSON Buffer parser for /v1/webhooks/arc unchanged.

Implement readProductMutationPayload(request): JSON returns request.body/no photo; multipart requires exactly one product JSON field and optional photo. Reject repeat or unexpected parts, parse failures, parser limits, and photo paired with imageUrl using BadRequestException with a safe fixed message.

- [ ] **Step 3: Implement object/product lifecycle**

Validate product DTO before writing an object. Create a product UUID in CatalogService, store photo using that ID, include generated imageUrl and ID in existing insert, and delete new object on any transaction/insert failure. On update, store new object first, transactionally replace imageUrl, then delete only an old URL recognized as managed. If update fails, delete only new object. Extend existing audit payload with imageUploaded true, never a filename/key/bytes.

- [ ] **Step 4: Verify and commit**

Run:

~~~bash
cd backend
npm run test:integration -- admin-catalog.integration.spec.ts
npm run test
npm run typecheck
npm run lint
npm run build
git add backend/src/common/app-factory.ts backend/src/modules/catalog backend/test/admin-catalog.integration.spec.ts
git commit -m "feat(turkiye): accept validated product photo uploads"
~~~

Expected: all checks pass, including unsigned Arc webhook raw-body regression.

### Task 4: Clean unreferenced product objects in the existing worker

**Files:**
- Create: backend/src/modules/media/catalog-media-cleanup.service.ts
- Create: backend/test/catalog-media-cleanup.service.spec.ts
- Modify: backend/src/modules/media/media.module.ts
- Modify: backend/src/worker.ts
- Modify: backend/test/worker.integration.spec.ts

**Interfaces:**
- Consumes: ProductMediaStorage list/delete, managed URL lookup, and products.imageUrl.
- Produces: CatalogMediaCleanupService.runOnce(now = new Date()): Promise<number>.

- [ ] **Step 1: Write failing cleanup tests**

Fake referenced object, unreferenced object 25 hours old, unreferenced object 23 hours old, and non-product key. Seed one managed and one external product URL. Assert only the 25-hour products key is deleted and return count is 1. Extend worker test to expect a cleanup pass in test mode.

Run: cd backend && npm run test -- catalog-media-cleanup.service.spec.ts worker.integration.spec.ts

Expected: FAIL because cleanup does not exist.

- [ ] **Step 2: Implement bounded daily cleanup**

Select only products.imageUrl, derive keys only under configured public base, and compare with pagination over literal products prefix. Delete only missing references older than 24 hours. Invoke cleanup at worker startup then only after nextMediaCleanupAt; catch/log safe errors while continuing notification outbox polling. Do not write cleanup events to notification outbox.

- [ ] **Step 3: Verify and commit**

Run:

~~~bash
cd backend
npm run test -- catalog-media-cleanup.service.spec.ts worker.integration.spec.ts
npm run typecheck
git add backend/src/modules/media backend/src/worker.ts backend/test/catalog-media-cleanup.service.spec.ts backend/test/worker.integration.spec.ts
git commit -m "feat(turkiye): clean orphaned catalog media"
~~~

Expected: tests and typecheck pass before commit.

### Task 5: Extend VV Admin typed transport and Turkiye connector

**Files:**
- Modify: ../vv-admin/packages/domain/src/catalog.ts and catalog.test.ts
- Modify: ../vv-admin/packages/contracts/src/index.ts
- Modify: ../vv-admin/apps/api/package.json and ../vv-admin/pnpm-lock.yaml
- Modify: ../vv-admin/apps/api/src/catalog/catalog.ports.ts
- Modify: ../vv-admin/apps/api/src/catalog/catalog.service.ts and catalog.service.test.ts
- Modify: ../vv-admin/apps/api/src/catalog/catalog.controller.ts and catalog.controller.test.ts
- Modify: ../vv-admin/apps/api/src/catalog/turkiye-catalog.connector.ts and turkiye-catalog.connector.test.ts

**Interfaces:**
- Consumes: Task 3 multipart contract.
- Produces:

~~~ts
type CatalogProductPhotoUpload = Readonly<{ bytes: Buffer; contentType: string; filename: string }>;
type CatalogProductPhotoUploadCapability = Readonly<{
  maxBytes: 5_242_880;
  acceptedMimeTypes: readonly ["image/jpeg", "image/png", "image/webp"];
}> | null;
createProduct(input: CatalogProductCreateCommand, photo?: CatalogProductPhotoUpload): Promise<CatalogProduct>;
updateProduct(input: CatalogProductUpdateCommand, photo?: CatalogProductPhotoUpload): Promise<CatalogProduct>;
~~~

- [ ] **Step 1: Write failing domain, controller and connector tests**

Assert Turkiye capabilities expose exact limits. Controller must pass authenticated actor, parsed product input and only bytes/contentType/filename; reject invalid JSON, two files, invalid MIME, and photo plus URL before connector use. Connector test must assert FormData product JSON plus Blob photo, exact target/timeout/redirect/admin headers, and errors free of key/bytes. Reassert existing no-photo JSON behavior.

Run:

~~~bash
cd ../vv-admin
pnpm --filter @vv-admin/domain test -- catalog.test.ts
pnpm --filter @vv-admin/api test -- catalog.controller.test.ts catalog.service.test.ts turkiye-catalog.connector.test.ts
~~~

Expected: FAIL because photo transport is absent.

- [ ] **Step 2: Implement capability, controller and connector**

Add productPhotoUpload capability and DTO. Install multer and types in VV API; use memory-only FileInterceptor(photo) with one-file/5MiB limits. Parse body.product only in multipart and keep JSON fallback. Audit only photoUploaded Boolean(photo).

For photo calls, FormData must use this exact shape; do not set multipart content type manually:

~~~ts
formData.set("product", JSON.stringify(productBody));
formData.set("photo", new Blob([photo.bytes], { type: photo.contentType }), photo.filename);
~~~

Keep accept, timeout, redirect and current error mapping.

- [ ] **Step 3: Verify and commit**

Run:

~~~bash
cd ../vv-admin
pnpm --filter @vv-admin/domain test -- catalog.test.ts
pnpm --filter @vv-admin/api test -- catalog.controller.test.ts catalog.service.test.ts turkiye-catalog.connector.test.ts
pnpm --filter @vv-admin/api typecheck
pnpm --filter @vv-admin/api lint
pnpm --filter @vv-admin/api build
git add packages/domain/src/catalog.ts packages/domain/src/catalog.test.ts packages/contracts/src/index.ts apps/api/package.json pnpm-lock.yaml apps/api/src/catalog
git commit -m "feat(catalog): forward Turkiye product photo uploads"
~~~

Expected: checks pass; do not stage .superpowers/sdd reports.

### Task 6: Replace VV Admin manual image URL with an accessible file control

**Files:**
- Create: ../vv-admin/apps/web/components/catalog-management/product-photo-input.tsx
- Create: ../vv-admin/apps/web/components/catalog-management/product-photo-input.test.tsx
- Modify: ../vv-admin/apps/web/lib/catalog-api.ts and catalog-api.test.ts
- Modify: ../vv-admin/apps/web/components/catalog-management/catalog-management-page.tsx

**Interfaces:**
- Consumes: Task 5 capability/API.
- Produces:

~~~ts
createCatalogProduct(siteId: string, input: CatalogProductInputDto, photo?: File | null): Promise<CatalogProductDto>;
updateCatalogProduct(siteId: string, productId: string, input: CatalogProductInputDto, photo?: File | null): Promise<CatalogProductDto>;
~~~

- [ ] **Step 1: Write failing client/component tests**

Assert no-photo create remains JSON with credentials. Assert JPEG File makes FormData with product and photo but no explicit multipart content type. Render input and assert label Фотография товара, accepted formats, selected name, preview, clear action, local 5MiB-plus-one error, and file retained after a parent save failure.

Run:

~~~bash
cd ../vv-admin
pnpm --filter @vv-admin/web test -- catalog-api.test.ts product-photo-input.test.tsx
~~~

Expected: FAIL because UI has editable URL only.

- [ ] **Step 2: Implement client and component**

Use JSON when photo is null; otherwise use FormData, credentials include, and product JSON formed as { ...input, imageUrl: null } so a replacement does not collide with Turkiye's photo-plus-URL rejection. Create/revoke preview object URL in effect. Use accept image/jpeg,image/png,image/webp. Do not persist File, preview URL, product, users, orders, or payments to localStorage.

Replace the editable product image URL field; display an existing URL read-only as preview. Clearing unsaved replacement leaves existing image untouched. Preserve type/price normalization and all failed-save fields.

- [ ] **Step 3: Verify and commit**

Run:

~~~bash
cd ../vv-admin
pnpm --filter @vv-admin/web test -- catalog-api.test.ts product-photo-input.test.tsx catalog-price-model.test.ts
pnpm --filter @vv-admin/web typecheck
pnpm --filter @vv-admin/web lint
pnpm --filter @vv-admin/web build
git add apps/web/lib/catalog-api.ts apps/web/lib/catalog-api.test.ts apps/web/components/catalog-management/catalog-management-page.tsx apps/web/components/catalog-management/product-photo-input.tsx apps/web/components/catalog-management/product-photo-input.test.tsx
git commit -m "feat(catalog): add product photo selector"
~~~

Expected: checks pass before commit.

### Task 7: Prove local end-to-end behavior and perform final review

**Files:**
- Modify: docs/development/production-runbook.md only if local proof reveals a wrong media/proxy command.
- Modify: ../vv-admin/docs/catalog-management-runbook.md only if local proof requires a new operator instruction.

**Interfaces:**
- Consumes: completed Tasks 1 through 6.
- Produces: browser evidence for create, public display and replacement; no production effect.

- [ ] **Step 1: Start controlled local stack**

Create a throwaway local environment from examples with non-production MinIO credentials and local public media base. Start Turkiye Postgres, MinIO/init, API, worker, frontend and VV Admin API/web. Configure local Turkiye site with current test static key. Confirm bucket creation without printing credentials.

- [ ] **Step 2: Run browser proof**

With Chrome DevTools MCP, sign in locally, create category and product with fixture, refresh, and prove:

~~~text
GET /media/products/product-id/asset-id.webp -> 200 and image/webp
GET /v1/public/products/slug -> same imageUrl
catalog card and /services/slug -> visible photo, no console/network error
~~~

Replace photo once; URL must change and prior managed object must be absent. Capture screenshot and console evidence.

- [ ] **Step 3: Run final checks and secret scan**

Run:

~~~bash
cd backend && npm run verify
cd ../vv-admin && pnpm --filter @vv-admin/domain test && pnpm --filter @vv-admin/api test && pnpm --filter @vv-admin/web test && pnpm --filter @vv-admin/api build && pnpm --filter @vv-admin/web build
cd ../turkiye && git diff --check && rg -n -i "MINIO_(ROOT_PASSWORD|SECRET_KEY)=.+|AWS_SECRET|BEGIN PRIVATE KEY" --glob "!**/node_modules/**" --glob "!**/.git/**" . ../vv-admin
~~~

Expected: checks pass and scan finds only variable names/placeholders, never credentials. Report any local-only blocker rather than claiming production proof.

- [ ] **Step 4: Commit only evidence-driven documentation correction**

~~~bash
git add docs/development/production-runbook.md
git commit -m "docs(turkiye): clarify catalog media verification"
~~~

Skip this commit if no documentation changed.

## Plan Self-Review

- Tasks 1 through 4 cover Turkiye validation, MinIO, product lifecycle, cleanup, Compose and proxy. Tasks 5 and 6 cover VV Admin transport and UI. Task 7 supplies browser/runtime proof.
- No product migration is planned because products.image_url remains authoritative.
- Every consumer interface is declared before use. JSON compatibility is explicitly tested.
- No plan command mutates production or contains a real secret.

## Execution Status (2026-08-10)

- Tasks 1–6 are implemented and committed in the Turkiye and VV Admin `main`
  worktrees. The implemented path is browser → VV Admin API → Turkiye Admin API
  → private MinIO, with a single normalized WebP product photo.
- Automated evidence includes Turkiye unit/integration tests, API and web
  typechecks/builds, connector FormData tests, and a controlled local MinIO
  policy proof using the non-root app user.
- Task 7 browser proof is intentionally still open: no complete local VV Admin
  + Turkiye authenticated fixture stack was configured in this run. No
  production deploy, secret update, or real catalog mutation was performed.
