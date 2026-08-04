# Real Travel Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seeded marketplace catalog with a dated, source-backed snapshot of real Turkey travel offers while preserving the existing `turkiye` visual design and local purchase flow.

**Architecture:** Keep the current marketplace components and routes. Replace the catalog data layer with a normalized source-backed dataset grouped into eight user-facing sections, add provenance fields to the existing product type, and expose source/date/availability metadata through the existing card and detail views. Keep checkout local and explicit about provider confirmation.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing CSS Modules, Node verification scripts, Playwright smoke testing.

## Global Constraints

- Work only in `/private/tmp/faro-turkiye`, the isolated clone of `avvolkova13/turkiye`.
- Preserve the existing homepage composition, header, typography, palette, card grid, filters, breadcrumb, detail pages, and checkout styling.
- Use Istanbul.com for tours, tickets, experiences, restaurants, wellness, and passes; use Trasst for eSIM and transport/transfers.
- Store a fixed price snapshot in RUB together with the original amount, source currency, source URL, provider, and capture date.
- Rewrite descriptions in original Russian wording; do not copy long source passages.
- Do not alter copyrighted images to evade rights. Use permitted source URLs, licensed assets, or original neutral covers and record `imageSource`.
- Do not claim live inventory, live availability, or live payment confirmation.
- Every item must be in exactly one of: tours, museum tickets, experiences, restaurants, wellness, esim, transfers, passes.

## Files and responsibilities

- Modify `src/types/marketplace.ts`: add source-backed product fields and eight-section taxonomy.
- Modify `src/data/marketplace.ts`: replace seeded services with the curated snapshot and source metadata.
- Modify `src/lib/marketplace/catalog.ts`: filter and label the new taxonomy without changing pagination behavior.
- Modify `src/components/marketplace/ServiceCard.tsx`: show provider, snapshot status, and source-safe image treatment.
- Modify `src/components/marketplace/CatalogBrowser.tsx` and `src/components/marketplace/MarketplaceShell.tsx`: expose the eight sections and preserve existing layout.
- Modify `src/components/marketplace/ProductActions.tsx` and `src/components/marketplace/CheckoutForm.tsx`: keep local cart/order behavior and communicate provider confirmation.
- Modify `src/data/marketplace.ts` or a focused `src/data/marketplace-sources.ts`: keep source URLs and capture metadata separate from presentation copy.
- Add `scripts/marketplaceCatalog.test.mjs` assertions for category coverage, provenance, price validity, and no mock flags.
- Add `scripts/marketplacePurchase.test.mjs` for cart and checkout state transitions if the current test harness supports direct module testing.

---

### Task 1: Normalize the marketplace product contract

**Files:**
- Modify: `src/types/marketplace.ts`
- Modify: `src/lib/marketplace/catalog.ts`
- Test: `scripts/marketplaceCatalog.test.mjs`

**Interfaces:**
- `MarketplaceService` gains `catalogSection`, `provider`, `sourceUrl`, `sourceName`, `capturedAt`, `sourcePrice`, `sourceCurrency`, `imageSource`, `availability`, and `providerStatus`.
- `MarketplaceServiceType` remains the internal filter type; `catalogSection` is the exact user-facing eight-section taxonomy.

- [ ] **Step 1: Write failing assertions** for eight unique sections, positive RUB prices, non-empty provenance, ISO capture date, and absence of `isMockData: true`.
- [ ] **Step 2: Run `node scripts/marketplaceCatalog.test.mjs`** and verify it fails against the seeded dataset.
- [ ] **Step 3: Add the fields and literal unions** in `src/types/marketplace.ts`, using `availability: "snapshot"` and `providerStatus: "awaiting_provider"`.
- [ ] **Step 4: Update catalog filtering** so section and legacy scenario filters both resolve through one typed mapping.
- [ ] **Step 5: Run `npm run typecheck`** and the catalog test; both must pass before continuing.
- [ ] **Step 6: Commit** with `git add src/types/marketplace.ts src/lib/marketplace/catalog.ts scripts/marketplaceCatalog.test.mjs && git commit -m "feat: add source-backed marketplace contract"`.

### Task 2: Replace demo data with the source-backed snapshot

**Files:**
- Modify: `src/data/marketplace.ts`
- Create: `src/data/marketplace-sources.ts` if separating raw source records keeps the main dataset readable
- Test: `scripts/marketplaceCatalog.test.mjs`

**Interfaces:**
- Export `marketplaceServices: MarketplaceService[]` with 5–8 records per section, at least 40 records total.
- Export `marketplaceCategories` with exactly the eight labels: Туры, Билеты, Впечатления, Рестораны, Красота и wellness, eSIM, Трансферы, Проездные.

- [ ] **Step 1: Record the researched snapshot** from Istanbul.com and Trasst with source URL, source price/currency, provider, and `capturedAt: "2026-07-27"`.
- [ ] **Step 2: Add original Russian titles/descriptions** and map every item to one section, city, duration, delivery method, included items, exclusions, and cancellation note.
- [ ] **Step 3: Convert each source amount to RUB** using one documented snapshot conversion constant in `src/data/marketplace-sources.ts`; retain original amounts unchanged.
- [ ] **Step 4: Assign image sources** only to permitted/owned URLs or neutral local covers; do not duplicate one image across unrelated cards unless explicitly marked as a generic cover.
- [ ] **Step 5: Remove seeded `mock` flags and demo dates** from production-facing records; use `availability: "snapshot"` instead.
- [ ] **Step 6: Run catalog tests, `npm run typecheck`, and `npm run lint`**; fix all failures before UI changes.
- [ ] **Step 7: Commit** with `git add src/data/marketplace.ts src/data/marketplace-sources.ts scripts/marketplaceCatalog.test.mjs && git commit -m "feat: seed marketplace with real Turkey offers"`.

### Task 3: Surface provenance without changing the visual system

**Files:**
- Modify: `src/components/marketplace/ServiceCard.tsx`
- Modify: `src/components/marketplace/CatalogBrowser.tsx`
- Modify: `src/components/marketplace/MarketplaceShell.tsx`
- Modify: `src/components/marketplace/catalog.module.css`
- Test: `scripts/verify-marketplace-foundation.mjs`

**Interfaces:**
- Cards continue to accept `MarketplaceService`; the new fields are rendered as compact metadata, not a new card layout.
- Section navigation uses the current navigation and query-state patterns.

- [ ] **Step 1: Add a failing browser-level assertion** that a catalog card contains a provider/source label and snapshot availability marker.
- [ ] **Step 2: Add the eight sections to the existing catalog controls** while retaining current responsive grid, filters, sort, and pagination.
- [ ] **Step 3: Render source/date/status in the existing card metadata region** and link the provider name to `sourceUrl` with safe external-link attributes.
- [ ] **Step 4: Keep source imagery visually consistent** by using existing aspect ratios, object positioning, overlays, and fallback cover behavior.
- [ ] **Step 5: Run `npm run verify:marketplace`** and the browser smoke test at `/catalog`, `/catalog?section=esim`, and `/catalog?section=transfers`.
- [ ] **Step 6: Commit** with `git add src/components/marketplace scripts/verify-marketplace-foundation.mjs && git commit -m "feat: show catalog provenance in existing UI"`.

### Task 4: Preserve and clarify purchase flow

**Files:**
- Modify: `src/components/marketplace/ProductActions.tsx`
- Modify: `src/components/marketplace/CheckoutForm.tsx`
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/types/marketplace.ts` only if the order type needs the source snapshot
- Test: `scripts/marketplacePurchase.test.mjs`

**Interfaces:**
- Existing add-to-cart and checkout actions remain compatible with current local storage/cart state.
- Orders persist the selected product snapshot and end in `awaiting_provider`.

- [ ] **Step 1: Write a failing purchase-flow test** covering add-to-cart, quantity, checkout submission, and persisted provider-pending status.
- [ ] **Step 2: Ensure a product added from each section carries its source snapshot** into the cart/order payload.
- [ ] **Step 3: Update checkout copy** to distinguish order creation from payment/provider confirmation without changing the page layout.
- [ ] **Step 4: Keep validation for contact details, selected date/variant, and quantity** and provide a visible retry/edit path on invalid submission.
- [ ] **Step 5: Run the purchase test and Playwright flow**: catalog → detail → add to cart → checkout → confirmation/order state.
- [ ] **Step 6: Commit** with `git add src/app/checkout src/components/marketplace scripts/marketplacePurchase.test.mjs && git commit -m "feat: preserve provider-aware purchase flow"`.

### Task 5: Full verification and handoff

**Files:**
- Modify: only files required by failing verification
- Test: `scripts/marketplaceCatalog.test.mjs`, `scripts/marketplacePurchase.test.mjs`, `scripts/verify-marketplace-foundation.mjs`

- [ ] **Step 1: Run `npm run lint`.** Expected: no ESLint errors.
- [ ] **Step 2: Run `npm run typecheck`.** Expected: no TypeScript errors.
- [ ] **Step 3: Run `npm run build`.** Expected: production build succeeds without route or asset errors.
- [ ] **Step 4: Run both marketplace verification scripts.** Expected: all eight sections have products, all products have provenance, and no demo/mock flags remain.
- [ ] **Step 5: Run a Playwright smoke test** at desktop and mobile widths covering homepage unchanged, all eight catalog sections, one detail page, cart, checkout, and order confirmation.
- [ ] **Step 6: Inspect `git diff --stat` and verify homepage component files were not changed** beyond approved shared metadata needed by the marketplace.
- [ ] **Step 7: Commit the final verified implementation** with `git add . && git commit -m "feat: launch source-backed Turkey travel catalog"`.
