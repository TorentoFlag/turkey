# Task 3 report — filtered marketplace catalog

## Commit

`081de47282726509c13b265cfc546b80a29e4d46` — `feat: add filtered marketplace catalog`

## Changed files

- `src/app/catalog/page.tsx`
- `src/components/marketplace/CatalogBrowser.tsx`
- `src/components/marketplace/catalog.module.css`
- `src/lib/marketplace/query-state.ts`
- `src/lib/marketplace/catalog.ts` (non-breaking optional page argument required for functional URL-backed pagination)
- `scripts/marketplaceRoutes.test.mjs`

Homepage files, components, styles, data, and assets were not modified.

## Verification

- `npx eslint src/app/catalog/page.tsx src/components/marketplace/CatalogBrowser.tsx src/lib/marketplace/catalog.ts src/lib/marketplace/query-state.ts scripts/marketplaceRoutes.test.mjs` — passed.
- `node --test scripts/marketplaceCatalog.test.mjs scripts/marketplaceRoutes.test.mjs` — passed: 8 tests.
- `npm run typecheck` — passed.
- `npm run build` — passed; `/catalog` statically generated.
- `git diff --check` — passed.
- Full `npm run lint` was run but remains blocked by pre-existing lint errors in generated `.worktrees/floema-home/.next/**` files and existing homepage source warnings/errors outside Task 3. The targeted Task 3 lint is clean.

## Concerns

- The catalog route is statically exported. Query-dependent controls render after the client Suspense loading state, so the HTTP smoke test validates the static loading label for each requested query URL; the client browser then parses and synchronizes the query state.

## Task 3 review fixes — 2026-07-21

### Findings resolved

1. **Date filter is wired end-to-end.** `CatalogFilters` now carries a typed ISO demo date, query parsing and serialization support `date`, and the filter panel exposes **«Дата (демо)»**. The catalog only matches explicit `demoDates` metadata. The sole seeded date is labeled as interface-only, and the control explicitly says it does not represent factual availability.
2. **«Показать ещё» now appends.** The browser renders all matching pages from page 1 through the current URL-backed `page`, preserving initial items on every load. Filters and sort still reset the page to 1; repeated loads continue until `hasNextPage` is false.
3. **Route smoke test is self-contained.** `scripts/marketplaceRoutes.test.mjs` creates a temporary project copy, builds its static export with Webpack, asserts the exported catalog HTML, and removes the temporary directory. It uses neither a port nor an externally running server, so it is unaffected by an existing dev session.

### Regression coverage

- Date parsing, invalid-date rejection, stable serialization, and pure demo-date filtering.
- Cumulative pagination preserves page 1, appends page 2, and stops at exhaustion.
- Static catalog route export including `date` query compatibility.

### Verification

- `node --test scripts/marketplaceCatalog.test.mjs scripts/marketplaceRoutes.test.mjs` — passed: 10 tests.
- Targeted ESLint across the changed marketplace code and tests — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed; `/catalog` is statically generated.
- `git diff --check` — passed.

### Scope

No homepage files, components, styles, homepage data, or assets were modified. The only data change is explicit interface-only demo-date metadata in `src/data/marketplace.ts`.

## Task 3 review fix — HTTP route smoke test

### Finding resolved

`scripts/marketplaceRoutes.test.mjs` now builds its isolated static export, starts a temporary localhost static server, and requests each required endpoint: `/catalog`, the `Каппадокия` search query, `digital=1`, `maxPrice=1000`, and `date=2026-08-15`. Every request must return HTTP 200, preserve its exact request target in the server response header, and return the catalog shell and client query-state loading markers. The test closes the server and removes the temporary build directory through one cleanup hook, including on assertion failures.

### Verification

- `node --test scripts/marketplaceCatalog.test.mjs scripts/marketplaceRoutes.test.mjs` — passed: 10 tests.
- `npx eslint scripts/marketplaceRoutes.test.mjs` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed; `/catalog` is statically generated.
- `git diff --check` — passed.

### Scope

Only `scripts/marketplaceRoutes.test.mjs` and this Task 3 report were changed. No homepage files were modified.
