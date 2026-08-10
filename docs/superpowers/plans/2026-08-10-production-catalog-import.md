# Production Catalog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import the 93 products published by the approved Turkiye design into the production catalog through the protected Admin API, with a single MinIO-backed photo per product.

**Architecture:** A versioned Node ESM import tool reads the checked-in design source at runtime through a deliberately narrow parser, maps design taxonomy to the approved production taxonomy, and calls the existing Admin API over the internal Docker network. It validates the entire import set before writing, runs serially to fit the 2 GiB VPS, and treats existing matching slugs as resume-safe while rejecting divergent collisions.

**Tech Stack:** Node.js 24 ESM, `node:test`, native `fetch`/`FormData`, current Turkiye API, MinIO product media adapter, Sharp already present in the production API image.

## Global Constraints

- Import exactly the 93 `sourceProducts` from `frontend/src/data/marketplace-sources.ts`, whose SHA-256 matches the GitHub Pages source.
- Create 10 active root categories and exactly 3 active child categories; leave unrelated existing production records unchanged.
- Category depth stays at two levels.
- Map `connectivity`, `tickets`, `digital`, `guides` to `auto_delivery`; `shopping` to `physical`; all other design types to `booking`.
- Store each displayed design price as positive `priceMinor` in `RUB`, including booking items; catalog cards and product pages display this booking price, while checkout still never creates payment for booking.
- Upload exactly one local image per product using multipart `photo`; no external source URLs enter the catalog.
- Enforce the 5 MiB input limit and allowed source formats before writing. Convert only `bursa-koza-han-market.jpg` (oversize) and `cappadocia-cave-hotel.avif` (unsupported AVIF) in memory to WebP; do not alter the licensed design assets.
- Use Admin API only; no direct writes to PostgreSQL or MinIO.
- The import is dry-run by default and mutates production only with `--apply`.
- Never print API credentials, database URLs, cookies, or complete product payloads in logs.

---

### Task 1: Design-source reader and taxonomy mapper

**Files:**

- Create: `scripts/catalog-import/design-catalog-source.mjs`
- Create: `scripts/catalog-import/design-catalog-source.test.mjs`

**Interfaces:**

- Consumes: `frontend/src/data/marketplace-sources.ts` as a UTF-8 file.
- Produces: `readDesignProducts({ sourcePath }): readonly DesignProduct[]` and `buildCatalogPlan(products): CatalogPlan`.
- `CatalogPlan` contains `categories`, `products`, and `assetPaths`; each product has `slug`, `title`, `description`, `categorySlug`, `type`, `priceMinor`, `currency`, and `assetPath`.

- [ ] **Step 1: Write the failing mapper tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogPlan, readDesignProducts } from "./design-catalog-source.mjs";

test("maps all approved design records to the production taxonomy", () => {
  const sourceProducts = readDesignProducts({ sourcePath: designSourcePath });
  const plan = buildCatalogPlan(sourceProducts);

  assert.equal(plan.products.length, 93);
  assert.deepEqual(plan.categories.roots.map(({ slug }) => slug), [
    "excursions", "tickets", "activities", "restaurants", "spa",
    "connectivity", "transfers", "digital", "shopping", "vip-transport",
  ]);
  assert.deepEqual(plan.categories.children.map(({ slug }) => slug), [
    "shopping-fur", "shopping-jewelry", "vip-transport-helicopters",
  ]);
  assert.equal(plan.products.find(({ slug }) => slug === "blue-mosque-self-guided").categorySlug, "activities");
  assert.equal(plan.products.find(({ slug }) => slug === "trasst-esim-1gb").type, "auto_delivery");
  assert.equal(plan.products.find(({ slug }) => slug === "turkishopping-black-mink-coat").type, "physical");
  assert.equal(plan.products.find(({ slug }) => slug === "istanbul-shuttle-aksaray").type, "booking");
});
```

- [ ] **Step 2: Run the mapper test and verify it fails**

Run: `node --test scripts/catalog-import/design-catalog-source.test.mjs`

Expected: failure because `design-catalog-source.mjs` does not exist.

- [ ] **Step 3: Implement a constrained source reader and mapping**

```js
export function readDesignProducts({ sourcePath }) {
  // Strip only the type-only import, type declaration, function declaration,
  // `export` prefixes, and `as const`; evaluate the controlled local data file
  // in a fresh vm context and validate every extracted record.
}

export function buildCatalogPlan(sourceProducts) {
  // Reject a count other than 93, duplicate product IDs, missing images,
  // non-positive displayed prices, and unknown type/subcategory combinations.
  // Return roots, children, and product commands in source order.
}
```

Map `fur` and `jewelry` to the two `shopping-*` children, `helicopters` to `vip-transport-helicopters`, and every other product to its root. Map `guides` to root `activities`. Compute `priceMinor` as `Math.round(sourcePrice * eurToRub) * 100` and set `currency: "RUB"`.

- [ ] **Step 4: Run the mapper tests and static checks**

Run: `node --test scripts/catalog-import/design-catalog-source.test.mjs && git diff --check`

Expected: PASS; all expected roots, children, types and 93 products are asserted.

- [ ] **Step 5: Commit the mapper**

```bash
git add scripts/catalog-import/design-catalog-source.mjs scripts/catalog-import/design-catalog-source.test.mjs
git commit -m "feat(turkiye): map approved design catalog for import"
```

### Task 2: Safe multipart Admin API import runner

**Files:**

- Create: `scripts/catalog-import/import-design-catalog.mjs`
- Create: `scripts/catalog-import/import-design-catalog.test.mjs`

**Interfaces:**

- Consumes: `CatalogPlan`, `ADMIN_API_KEY`, `CATALOG_IMPORT_API_BASE_URL`, `CATALOG_IMPORT_ACTOR_ID`, local image root, and optional `--apply`.
- Produces: `runImport({ plan, client, imageRoot, apply, logger }): ImportSummary`.
- `ImportSummary` contains numeric `createdCategories`, `existingCategories`, `createdProducts`, `existingProducts`, `conflicts`, and `failedUploads`.

- [ ] **Step 1: Write failing runner tests**

```js
test("is dry-run by default and does not issue mutation requests", async () => {
  const client = new FakeCatalogClient();
  const result = await runImport({ plan: fixturePlan, client, imageRoot, apply: false, logger: silent });
  assert.equal(client.mutations.length, 0);
  assert.equal(result.createdProducts, 0);
});

test("rejects a divergent existing slug before any mutation", async () => {
  const client = new FakeCatalogClient({ products: [differentProductWithExpectedSlug] });
  await assert.rejects(() => runImport({ plan: fixturePlan, client, imageRoot, apply: true, logger: silent }), /conflicting product slug/);
  assert.equal(client.mutations.length, 0);
});

test("uploads one photo and creates only missing records in source order", async () => {
  const client = new FakeCatalogClient({ categories: matchingRoots });
  await runImport({ plan: fixturePlan, client, imageRoot, apply: true, logger: silent });
  assert.deepEqual(client.mutations.map(({ method, path }) => [method, path]), expectedRequests);
});
```

- [ ] **Step 2: Run runner tests and verify they fail**

Run: `node --test scripts/catalog-import/import-design-catalog.test.mjs`

Expected: failure because runner module does not exist.

- [ ] **Step 3: Implement preflight, client and serial writes**

```js
export async function runImport({ plan, client, imageRoot, apply, logger }) {
  await validateAllAssets(plan, imageRoot);
  const current = await client.readCurrent();
  const comparison = compareCurrentCatalog(plan, current);
  if (comparison.conflicts.length) throw new Error(`conflicting product slug: ${comparison.conflicts[0]}`);
  if (!apply) return comparison.summary;
  for (const category of comparison.missingCategories) await client.createCategory(category);
  for (const product of comparison.missingProducts) await client.createProduct(product, await readPhoto(product, imageRoot));
  return comparison.summaryWithCreated();
}
```

Use `x-admin-api-key` and `x-admin-actor-id` headers only in process memory. Send category JSON and product multipart bodies (`product` JSON + `photo`). Compare existing objects by slug, hierarchy/name, title, description, type, price/currency and a managed `/media/products/` image URL; skip only matching imported records. Stop on the first HTTP error; a subsequent run resumes from matching records.

`validateAllAssets` must check all files before any mutation. Reject unsupported MIME types and assets above 5 MiB except the explicit in-memory conversion allowlist: `catalog-generated/bursa-koza-han-market.jpg` and `home-sources/cappadocia-cave-hotel.avif`. For only those exact paths, use Sharp in memory (`rotate`, max 2560px, WebP quality 82) and require the transformed buffer to be at most 5 MiB.

- [ ] **Step 4: Run runner tests and lint-like syntax checks**

Run: `node --test scripts/catalog-import/import-design-catalog.test.mjs && node --check scripts/catalog-import/import-design-catalog.mjs && git diff --check`

Expected: PASS; dry run, collision rejection, ordered resumable writes and image constraints are covered.

- [ ] **Step 5: Commit the runner**

```bash
git add scripts/catalog-import/import-design-catalog.mjs scripts/catalog-import/import-design-catalog.test.mjs
git commit -m "feat(turkiye): add resumable design catalog importer"
```

### Task 3: Operator runbook and local proof

**Files:**

- Modify: `docs/development/production-runbook.md`
- Modify: `scripts/catalog-import/import-design-catalog.test.mjs`

**Interfaces:**

- Consumes: Task 1 mapper and Task 2 runner.
- Produces: a documented, exact production invocation that mounts `/opt/turkiye` read-only into the running `turkiye-api` image and uses the internal `api:3001` endpoint.

- [ ] **Step 1: Add failing command-level tests for the exceptional source assets**

```js
test("converts the oversized Bursa image before multipart upload", async () => {
  const photo = await readPhoto(bursaProduct, localImageRoot);
  assert.equal(photo.contentType, "image/webp");
  assert.ok(photo.bytes.length <= 5_242_880);
});

test("converts the sole AVIF design image before multipart upload", async () => {
  const photo = await readPhoto(istanbulFastDayPass, localImageRoot);
  assert.equal(photo.contentType, "image/webp");
  assert.ok(photo.bytes.length <= 5_242_880);
});
```

- [ ] **Step 2: Run it and verify it fails before the image transform exists**

Run: `node --test scripts/catalog-import/import-design-catalog.test.mjs --test-name-pattern='Bursa|AVIF'`

Expected: FAIL because `readPhoto` has not yet converted the exceptional inputs.

- [ ] **Step 3: Document exact production execution and implement the test support**

Add this runbook sequence, without displaying `/etc/turkiye/turkiye.env`:

```bash
cd /opt/turkiye
docker run --rm --network turkiye_default \
  --env-file /etc/turkiye/turkiye.env \
  -e CATALOG_IMPORT_API_BASE_URL=http://api:3001 \
  -e CATALOG_IMPORT_ACTOR_ID=catalog-import-2026-08-10 \
  -v /opt/turkiye:/workspace:ro \
  turkiye-api node /workspace/scripts/catalog-import/import-design-catalog.mjs

# Review the dry-run summary, then rerun with the final argument:
docker run --rm --network turkiye_default \
  --env-file /etc/turkiye/turkiye.env \
  -e CATALOG_IMPORT_API_BASE_URL=http://api:3001 \
  -e CATALOG_IMPORT_ACTOR_ID=catalog-import-2026-08-10 \
  -v /opt/turkiye:/workspace:ro \
  turkiye-api node /workspace/scripts/catalog-import/import-design-catalog.mjs --apply
```

The runner must obtain Sharp from the `turkiye-api` image with `createRequire('/app/package.json')('sharp')`; it must never install a package on production.

- [ ] **Step 4: Run complete importer checks**

Run: `node --test scripts/catalog-import/*.test.mjs && npm --prefix backend run lint && npm --prefix backend run typecheck`

Expected: PASS. If pre-existing unrelated formatting failures occur, report their exact paths separately and do not modify them.

- [ ] **Step 5: Commit runbook and proof**

```bash
git add docs/development/production-runbook.md scripts/catalog-import/import-design-catalog.test.mjs
git commit -m "docs(turkiye): document catalog import operation"
```

### Task 4: Controlled production import and runtime evidence

**Files:**

- No repository source changes expected.
- Create on server: timestamped SQL backup under `/opt/turkiye/backups/` with mode `0600`.
- Read-only evidence: timestamped JSON summaries under `/opt/turkiye/backups/` with mode `0600`.

**Interfaces:**

- Consumes: pushed commit from Tasks 1–3 and Docker image tagged by the Turkey deployment.
- Produces: production categories/products, MinIO media objects and audit log entries attributed to `catalog-import-2026-08-10`.

- [ ] **Step 1: Deploy the committed importer without altering application schema**

Run on Turkey:

```bash
/opt/turkiye/scripts/deploy.sh
docker compose --env-file /etc/turkiye/turkiye.env -f /opt/turkiye/compose.prod.yml ps
```

Expected: migration exits `0`; API, frontend and MinIO are healthy.

- [ ] **Step 2: Capture rollback evidence and run dry-run**

```bash
install -d -m 700 /opt/turkiye/backups
docker compose --env-file /etc/turkiye/turkiye.env -f /opt/turkiye/compose.prod.yml \
  exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > /opt/turkiye/backups/pre-design-catalog-$(date -u +%Y%m%dT%H%M%SZ).sql
chmod 600 /opt/turkiye/backups/pre-design-catalog-*.sql
```

Execute the runbook dry-run command. Expected summary: 10 missing root categories, 3 missing child categories, 93 missing products, 0 conflicts and 0 invalid assets.

- [ ] **Step 3: Execute the explicit apply command**

Run the documented `--apply` command once. Expected summary: 13 categories and 93 products created, 0 conflicts, 0 failed uploads. If any request fails, stop; retain the summary and rerun only after the cause is diagnosed.

- [ ] **Step 4: Verify database-backed API and public media**

Read the Admin API with a non-secret actor header and assert every expected slug exists. Assert each expected image URL starts with `https://turkeyplanners.com/media/products/` and returns `200`. Read `GET /v1/public/products` and assert it contains all 93 expected slugs; account for the pre-existing test item rather than asserting the global total equals 93.

- [ ] **Step 5: Browser runtime check and final state**

Open `https://turkeyplanners.com`, navigate to the catalog, and verify one representative product of each type: `trasst-esim-1gb`, `turkishopping-black-mink-coat`, and `istanbul-shuttle-aksaray`. Confirm title, RUB price, image response and the type-appropriate checkout/request UI. Re-run `docker compose ps`, public health checks and `git status --short`; preserve the database backup and do not prune rollback images during this task.
