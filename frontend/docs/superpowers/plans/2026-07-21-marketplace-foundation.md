# Marketplace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independent marketplace iteration beside the frozen homepage: centralized demo data, a reusable marketplace shell, catalog/search/filter flows, and destination pages.

**Architecture:** Add a dedicated marketplace component/data layer without importing or modifying homepage components, `src/app/page.tsx`, or `src/app/globals.css`. Catalog filtering is a pure typed function over local demo data; URL query parameters are the source of truth for shareable catalog/search state. App Router pages use static route params generated from centralized data.

**Tech Stack:** Next.js App Router 16, React 19, TypeScript 5, CSS Modules, Node test scripts, static export with GitHub Pages base path.

## Global Constraints

- Do not modify homepage files, DOM, text, images, CSS, header/footer, responsive behavior, animations, hover, transitions, parallax, or motion timing.
- Do not modify `src/app/globals.css`.
- Do not import homepage header or homepage-specific CSS into marketplace pages.
- Demo prices are centralized, shown in RUB, include a price unit, and display a visible “Демо-цена” label.
- Do not invent ratings, reviews, providers, licenses, guarantees, payment methods, availability promises, or legal details.
- All new images require meaningful `alt` text and must use existing local assets only.
- New interactive elements require keyboard focus styles and reduced-motion-safe transitions.
- Every task ends with `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.

---

### Task 1: Establish marketplace types, demo data, and pure catalog querying

**Files:**
- Create: `src/types/marketplace.ts`
- Create: `src/data/marketplace.ts`
- Create: `src/lib/marketplace/catalog.ts`
- Create: `scripts/marketplaceCatalog.test.mjs`
- Modify: `src/types/travel.ts` only if a compatibility alias is required by existing imports; preserve existing homepage behavior.

**Interfaces:**
- `MarketplaceDestination`, `MarketplaceCategory`, `MarketplaceService`, `ServiceVariant`, `CatalogFilters`, `CatalogSort`, `CatalogResult` from `src/types/marketplace.ts`.
- `marketplaceDestinations`, `marketplaceCategories`, `marketplaceServices`, `marketplaceServiceVariants`, `marketplaceNavigation` from `src/data/marketplace.ts`.
- `filterMarketplaceServices(filters: CatalogFilters, sort: CatalogSort): CatalogResult` from `src/lib/marketplace/catalog.ts`.

- [ ] **Step 1: Write the failing catalog data test**

Create a Node test that imports the compiled-independent data module through a small TypeScript-compatible fixture or validates the source contract with `node:test`: assert there are at least 15 destinations, all required categories exist, every service has a slug/id/price/currency/priceUnit/status/isMockData, and every price is at least 50 RUB.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test scripts/marketplaceCatalog.test.mjs`

Expected: FAIL because the marketplace data module and contract do not yet exist.

- [ ] **Step 3: Implement the typed entities and dataset**

Use explicit unions for service type, status, currency, sort key, and filter fields. Seed coherent demo services for the required destinations and categories, including low-price digital products. Each service must have a local image path, meaningful Russian copy, `isMockData: true`, and a price unit such as `за человека`, `за автомобиль`, `за маршрут` or `за товар`.

- [ ] **Step 4: Implement pure filtering and sorting**

`filterMarketplaceServices` must apply text, category, destination, min/max price, duration, language, transfer, children, digital and order-today filters; then sort by relevance, price ascending, price descending, or duration. Return `{ items, total, hasNextPage }` with a deterministic page size of 12. Unknown filter values must be ignored rather than throwing.

- [ ] **Step 5: Run the test and quality checks**

Run: `node --test scripts/marketplaceCatalog.test.mjs`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

Expected: PASS, with the homepage route and existing homepage verification unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/types/marketplace.ts src/data/marketplace.ts src/lib/marketplace/catalog.ts scripts/marketplaceCatalog.test.mjs
git commit -m "feat: add marketplace catalog data foundation"
```

### Task 2: Build the independent marketplace shell and reusable primitives

**Files:**
- Create: `src/components/marketplace/MarketplaceShell.tsx`
- Create: `src/components/marketplace/MarketplaceHeader.tsx`
- Create: `src/components/marketplace/MarketplaceFooter.tsx`
- Create: `src/components/marketplace/MarketplaceBreadcrumbs.tsx`
- Create: `src/components/marketplace/ServiceCard.tsx`
- Create: `src/components/marketplace/FilterPanel.tsx`
- Create: `src/components/marketplace/marketplace.module.css`
- Create: `src/app/catalog/layout.tsx`
- Create: `src/app/search/layout.tsx`
- Create: `src/app/destinations/layout.tsx`
- Create: `src/app/marketplace-error.tsx`

**Interfaces:**
- `MarketplaceShell({ children, title, description })` wraps all first-iteration pages.
- `ServiceCard({ service })` renders a link to `/services/${service.slug}` without requiring a service page to exist in this task.
- `FilterPanel({ value, onChange, options })` emits a serializable `CatalogFilters` object.
- `MarketplaceHeader` uses `marketplaceNavigation` and links only to real or planned marketplace routes.

- [ ] **Step 1: Add the reusable components with accessible markup**

Use semantic `header`, `nav`, `main`, `footer`, `article`, labels, `aria-current`, and visible focus styles. The shell must have its own class scope and must not import `globals.css` or homepage components.

- [ ] **Step 2: Add responsive CSS Modules**

Use a warm neutral background, dark text, Faro logo, editorial spacing, asymmetric media support, and a single-column mobile layout. Keep all widths within the viewport and include `@media (prefers-reduced-motion: reduce)` to disable nonessential transitions.

- [ ] **Step 3: Add route layouts and error boundary**

Route layouts should wrap children in `MarketplaceShell`; the error boundary should provide retry navigation and a link to `/catalog` without exposing fake support claims.

- [ ] **Step 4: Add a focused shell smoke test**

Extend `scripts/marketplaceCatalog.test.mjs` with assertions that every navigation href begins with `/`, every service slug is unique, and all image paths point to known files under `public/images`.

- [ ] **Step 5: Run quality checks**

Run: `node --test scripts/marketplaceCatalog.test.mjs`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

- [ ] **Step 6: Commit**

```bash
git add src/components/marketplace src/app/catalog/layout.tsx src/app/search/layout.tsx src/app/destinations/layout.tsx src/app/marketplace-error.tsx scripts/marketplaceCatalog.test.mjs
git commit -m "feat: add marketplace shell primitives"
```

### Task 3: Implement `/catalog` with URL-synchronized search, filters, sorting, and states

**Files:**
- Create: `src/app/catalog/page.tsx`
- Create: `src/components/marketplace/CatalogBrowser.tsx`
- Create: `src/components/marketplace/catalog.module.css`
- Create: `src/lib/marketplace/query-state.ts`
- Create: `scripts/marketplaceRoutes.test.mjs`

**Interfaces:**
- `parseCatalogQuery(searchParams: Record<string, string | string[] | undefined>): CatalogFilters`.
- `serializeCatalogQuery(filters: CatalogFilters): string`.
- `CatalogBrowser({ initialFilters })` owns client-side controls while rendering filtered results.

- [ ] **Step 1: Write URL-state tests**

Test that `parseCatalogQuery({ q: "Каппадокия", digital: "1", maxPrice: "1000" })` produces the expected typed filters, invalid numeric values are ignored, and serialization round-trips the supported fields without adding empty parameters.

- [ ] **Step 2: Implement URL parsing and serialization**

Use stable short keys (`q`, `category`, `destination`, `minPrice`, `maxPrice`, `date`, `duration`, `language`, `transfer`, `kids`, `digital`, `today`, `sort`, `page`). Never put user-visible fake booking state in the URL.

- [ ] **Step 3: Implement the catalog page and browser**

Render page title, quick filters, search input, filter controls, sort control, result count, service grid/list, and pagination or “Показать ещё”. Controls update the URL with `router.replace` and preserve the current route. The result area must expose loading, empty and error states.

- [ ] **Step 4: Add mobile and keyboard behavior**

On narrow screens filters collapse into a labeled disclosure; cards remain readable; the page has no horizontal overflow. Inputs and buttons must be reachable in logical tab order.

- [ ] **Step 5: Add route smoke checks**

The route test should start from a running server and verify `/catalog`, `/catalog?q=Каппадокия`, `/catalog?digital=1`, and `/catalog?maxPrice=1000` return 200 and contain the expected state labels.

- [ ] **Step 6: Run quality checks**

Run: `node --test scripts/marketplaceCatalog.test.mjs scripts/marketplaceRoutes.test.mjs`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

- [ ] **Step 7: Commit**

```bash
git add src/app/catalog/page.tsx src/components/marketplace/CatalogBrowser.tsx src/components/marketplace/catalog.module.css src/lib/marketplace/query-state.ts scripts/marketplaceRoutes.test.mjs
git commit -m "feat: add filtered marketplace catalog"
```

### Task 4: Add `/search` as a shareable catalog entry point

**Files:**
- Create: `src/app/search/page.tsx`
- Modify: `src/components/marketplace/MarketplaceHeader.tsx` only to point its search action to `/search`.
- Modify: `scripts/marketplaceRoutes.test.mjs`.

**Interfaces:**
- `/search?q=...` reuses `CatalogBrowser` and `parseCatalogQuery` from Task 3.

- [ ] **Step 1: Add the search page**

Read `searchParams`, render a search-specific heading, and pass the parsed filters to `CatalogBrowser`. An empty query must render the catalog with the empty-search state rather than redirecting.

- [ ] **Step 2: Verify search links and states**

Confirm the header search link, quick filter links, and “Начать путешествие” link point to real routes. Verify no new link uses a hash-only target.

- [ ] **Step 3: Run quality checks and commit**

Run: `node --test scripts/marketplaceCatalog.test.mjs scripts/marketplaceRoutes.test.mjs`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

```bash
git add src/app/search/page.tsx src/components/marketplace/MarketplaceHeader.tsx scripts/marketplaceRoutes.test.mjs
git commit -m "feat: add shareable marketplace search"
```

### Task 5: Implement `/destinations` and `/destinations/[slug]`

**Files:**
- Create: `src/app/destinations/page.tsx`
- Create: `src/app/destinations/[slug]/page.tsx`
- Create: `src/components/marketplace/DestinationCard.tsx`
- Create: `src/components/marketplace/destination.module.css`
- Modify: `scripts/marketplaceRoutes.test.mjs`.

**Interfaces:**
- `generateStaticParams()` returns every destination slug from `marketplaceDestinations`.
- Unknown slugs call `notFound()` and render the project 404 route.

- [ ] **Step 1: Build the destination index**

Render all required destinations, grouped into a readable editorial grid, with image alt text, short factual/demo-safe descriptions, and links to `/destinations/[slug]`.

- [ ] **Step 2: Build the destination detail page**

Render breadcrumb, title, description, destination image, service count derived from local data, and a filtered service list linked to `/catalog?destination=[slug]`. Do not invent visitor counts, official claims, ratings or availability.

- [ ] **Step 3: Add static route and 404 tests**

Verify at least five known slugs return 200, an unknown slug returns the Next not-found response, and destination links do not contain hash-only hrefs.

- [ ] **Step 4: Run quality checks and commit**

Run: `node --test scripts/marketplaceCatalog.test.mjs scripts/marketplaceRoutes.test.mjs`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

```bash
git add src/app/destinations src/components/marketplace/DestinationCard.tsx src/components/marketplace/destination.module.css scripts/marketplaceRoutes.test.mjs
git commit -m "feat: add marketplace destination pages"
```

### Task 6: Freeze verification and first-iteration acceptance QA

**Files:**
- Create: `scripts/verify-marketplace-foundation.mjs`
- Modify: `package.json` to add `verify:marketplace` without changing existing scripts.
- Do not modify: `src/app/page.tsx`, `src/app/globals.css`, `src/components/home/**`, `src/data/home.ts`.

- [ ] **Step 1: Add homepage immutability checks**

Record and compare the homepage file list and `git diff` path allowlist. The script must fail if any homepage file changes in the marketplace commits.

- [ ] **Step 2: Add marketplace browser checks**

With `BASE_URL` configurable, verify desktop and 390px mobile routes, no horizontal overflow, no console/page errors, visible labels for demo prices, working catalog query states, and correct not-found behavior.

- [ ] **Step 3: Run the complete first-iteration checks**

Run: `npm run verify:home`; `npm run verify:marketplace`; `npm run lint`; `npm run typecheck`; `npm run build`; `git diff --check`.

- [ ] **Step 4: Commit QA tooling**

```bash
git add scripts/verify-marketplace-foundation.mjs package.json
git commit -m "test: verify marketplace foundation and homepage freeze"
```

## Acceptance criteria

- `/catalog`, `/search`, `/destinations`, and all generated destination detail routes render through the new shell.
- Search, quick filters, advanced filters, sorting, empty state, loading state, error boundary and URL synchronization work.
- Service cards show coherent demo-safe data and link to planned service routes.
- Destination pages derive their service lists from centralized data.
- The homepage file list and content remain unchanged throughout the implementation.
- Lint, typecheck, build, homepage verification, marketplace checks and mobile smoke checks pass.
