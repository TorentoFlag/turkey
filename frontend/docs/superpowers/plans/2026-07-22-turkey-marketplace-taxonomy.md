# Turkey Marketplace Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Faro’s marketplace nomenclature with the proven Online Pattaya service taxonomy, adapted to real Turkey services and destinations, without changing the existing visual language.

**Architecture:** Keep the existing Next.js data-driven marketplace. Centralize the sidebar/top navigation labels and category metadata in the existing marketplace data, then derive catalog filter labels and links from those values. Add Turkey-specific transfer destinations as service data and preserve existing route/query behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, existing marketplace data/query helpers.

## Global Constraints

- Preserve the current Faro visual design and layout.
- Change nomenclature, category metadata, navigation labels, and valid links only.
- Use Russian customer-facing copy; do not expose demo/test wording.
- Keep all work local; do not commit or push.

### Task 1: Replace marketplace taxonomy and navigation

**Files:**
- Modify: `src/data/marketplace.ts`
- Modify: `src/components/marketplace/MarketplaceHeader.tsx`
- Modify: `src/components/marketplace/MarketplaceFooter.tsx`

**Interfaces:**
- Produce the single source of truth `marketplaceNavigation` and `marketplaceCategories` for the Turkish service taxonomy.

- [ ] Replace the abstract navigation with: `Каталог`, `Направления`, `Туры и активности`, `Трансферы`, `Такси`, `Визовые услуги`, `Аренда авто`, `Яхты и лодки`, `Билеты`, `Шопинг`, `SPA`, `Авиабилеты`, `Поддержка в поездке`.
- [ ] Map category ids to existing or added marketplace categories: `excursions`, `transfers`, `taxi`, `visa`, `rental`, `yachts`, `tickets`, `shopping`, `spa`, `airline-tickets`, `services`.
- [ ] Give each category a truthful Russian description and a valid catalog URL; use `/catalog?category=<id>` for catalog-backed sections.
- [ ] Keep `/catalog`, `/destinations`, `/search`, and `/` links intact where they already represent the destination.

### Task 2: Add Turkish transfer nomenclature

**Files:**
- Modify: `src/data/marketplace.ts`
- Modify: `src/lib/marketplace/catalog.ts`
- Modify: `src/types/marketplace.ts` only if a new category id requires a type update

**Interfaces:**
- Transfer services remain `MarketplaceService` records with `categoryId: "transfers"` and destination-aware query links.

- [ ] Ensure transfer inventory includes airport-to-city, hotel-to-airport, intercity, and resort routes for Istanbul, Antalya, Cappadocia, Izmir, Bodrum, Marmaris, Fethiye, Pamukkale, and nearby destinations already present in the data.
- [ ] Use concrete titles such as `Трансфер из аэропорта Стамбула`, `Трансфер из аэропорта Антальи`, `Трансфер в Каппадокию`, and `Трансфер в Памуккале`; do not use generic placeholders.
- [ ] Keep transfer product pages linked to `/services/[slug]` and catalog filtering linked to `/catalog?category=transfers`.

### Task 3: Wire catalog filters to the taxonomy

**Files:**
- Modify: `src/components/marketplace/CatalogBrowser.tsx`
- Modify: `src/components/marketplace/FilterPanel.tsx`

**Interfaces:**
- `filterOptions.categories` consumes `marketplaceCategories` and emits the existing `CatalogFilters.categoryId` query field.

- [ ] Remove labels that no longer exist in the taxonomy and expose the new category names in the existing filter controls.
- [ ] Keep destination, duration, language, price, and boolean filters unchanged.
- [ ] Verify each category filter returns either real services or a deliberate empty state; no dead category links.

### Task 4: Verify navigation and data integrity

**Files:**
- Test: `scripts/marketplaceRoutes.test.mjs`
- Test: `scripts/verify-marketplace-foundation.mjs`

- [ ] Run `git diff --check`.
- [ ] Run `npx tsc --noEmit --tsBuildInfoFile /tmp/turkiye-tsconfig.tsbuildinfo`.
- [ ] Run the existing marketplace route/foundation checks and inspect failures for stale assertions caused by renamed categories.
- [ ] Confirm no customer-facing `Журнал`, `demo`, or placeholder taxonomy labels remain in the changed marketplace surfaces.
