# Tourism Marketplace UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить Faro Turkey из плоского e-commerce-каталога в туристический marketplace с контекстным поиском, отдельным flow трансфера, понятными карточками, готовыми решениями и локальным подтверждением заказа.

**Architecture:** Сохраняем Next.js App Router и текущие страницы, но вводим слой сценариев каталога поверх существующих данных. Каталог получает контекст `experience | transfer | self-service | support`, а компоненты фильтров и карточек рендерят только поля, относящиеся к выбранному сценарию. Локальная корзина и заявки остаются client-side без внешнего backend и не имитируют live-доступность.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, существующие `next/image`, URL query state и Node-based verification scripts. Новые UI-библиотеки и внешние booking dependencies не добавляются.

## Global Constraints

- «Сначала задача путешественника, потом товар».
- «Каждый тип услуги получает собственный набор вопросов и CTA».
- Цена всегда сопровождается единицей расчёта: за человека, автомобиль, маршрут или товар.
- Нельзя показывать неподтверждённые обещания живой доступности, рейтингов или мгновенного бронирования.
- Все действия должны быть рабочими локально: фильтрация, переходы, форма заявки, корзина и подтверждение состояния.
- Не использовать слово «demo» в пользовательском тексте.
- Не добавлять белую плашку вокруг всего каталога.
- Все интерактивные элементы имеют hover, focus-visible и touch target не менее 44px.
- Уважать `prefers-reduced-motion`.
- Не коммитить и не пушить изменения без отдельной команды пользователя.

---

## File Map

**Modify:**

- `src/types/marketplace.ts` — типы сценариев каталога, параметров заказа и карточечных facts.
- `src/data/marketplace.ts` — категории, услуги, variants и данные для направлений без пользовательского `demo`-copy.
- `src/lib/marketplace/catalog.ts` — сценарная фильтрация и сортировка.
- `src/lib/marketplace/query-state.ts` — URL-параметры сценария, маршрута и базовых фильтров.
- `src/components/marketplace/CatalogBrowser.tsx` — orchestration каталога и переключение сценариев.
- `src/components/marketplace/FilterPanel.tsx` — контекстные поля.
- `src/components/marketplace/ServiceCard.tsx` — туристическая карточка и CTA.
- `src/components/marketplace/marketplace.module.css` — общие header, card, controls и responsive primitives.
- `src/components/marketplace/catalog.module.css` — layout каталога, filter bar, result states.
- `src/app/catalog/page.tsx` — сценарный вход и тексты каталога.
- `src/app/services/[slug]/page.tsx` — service detail с контекстным booking summary.
- `src/app/services/[slug]/product.module.css` — detail layout без лишних внешних полей.
- `src/components/marketplace/ProductActions.tsx` — локальная корзина и order intent.
- `src/components/marketplace/MarketplaceHeader.tsx` — чистая туристическая навигация.
- `src/app/destinations/[slug]/page.tsx` — связи destination → relevant scenarios/services.

**Create:**

- `src/components/marketplace/ScenarioPicker.tsx` — вход в intent-first каталог.
- `src/components/marketplace/TransferSearchForm.tsx` — форма маршрута трансфера.
- `src/components/marketplace/ExperienceSearchForm.tsx` — контекстная форма впечатлений.
- `src/components/marketplace/BookingSummary.tsx` — выбранная дата, option, guests/vehicle и сумма.
- `src/components/marketplace/CartDrawer.tsx` — локальное содержимое корзины и состояние заявки.
- `src/components/marketplace/marketplace-content.ts` — UI labels и copy, чтобы не смешивать тексты с data.
- `src/app/solutions/[slug]/page.tsx` — бесплатные готовые решения направлений.
- `src/app/solutions/solutions.module.css` — layout готовых решений.
- `scripts/marketplaceUx.test.mjs` — статические проверки новых сценарных контрактов.

---

### Task 1: Add scenario and booking contracts

**Files:**
- Modify: `src/types/marketplace.ts`
- Modify: `src/data/marketplace.ts`
- Create: `src/components/marketplace/marketplace-content.ts`
- Test: `scripts/marketplaceUx.test.mjs`

**Interfaces:**
- Produce `MarketplaceScenario = "experience" | "transfer" | "self-service" | "support"`.
- Produce `TransferSearchState` with `from`, `to`, `date`, `time`, `passengers`, `luggage`, `childSeat`, `flightNumber`, `returnTrip`.
- Produce `BookingIntent` with `serviceId`, optional `variantId`, `date`, `quantity`, `scenario`, `status`.
- Produce `getServiceScenario(service: MarketplaceService): MarketplaceScenario`.

- [ ] **Step 1: Write failing contract checks**

Add assertions to `scripts/marketplaceUx.test.mjs` that read the TypeScript/data files and fail when:

```js
assert.match(types, /MarketplaceScenario/);
assert.match(types, /TransferSearchState/);
assert.match(types, /BookingIntent/);
assert.match(data, /categoryId: "transfers"/);
assert.doesNotMatch(data, /status: "demo"/);
```

- [ ] **Step 2: Run the focused checks**

Run `node scripts/marketplaceUx.test.mjs`.
Expected: FAIL because the new contracts and user-facing status cleanup are not present.

- [ ] **Step 3: Implement the contracts and content labels**

Add the scenario unions and booking state with explicit nullable fields. Keep current service records compatible by making new fields optional until the card/detail migration is complete. Move user-facing labels such as scenario names, CTA names, duration labels and unit labels into `marketplace-content.ts`.

- [ ] **Step 4: Run type and focused checks**

Run `npm run typecheck` and `node scripts/marketplaceUx.test.mjs`.
Expected: PASS.

---

### Task 2: Make catalog filtering scenario-aware

**Files:**
- Modify: `src/lib/marketplace/catalog.ts`
- Modify: `src/lib/marketplace/query-state.ts`
- Modify: `src/types/marketplace.ts`
- Test: `scripts/marketplaceCatalog.test.mjs`
- Test: `scripts/marketplaceUx.test.mjs`

**Interfaces:**
- `getVisibleMarketplaceServices(filters, sort, page)` remains backward compatible.
- Add `scenario?: MarketplaceScenario` to `CatalogFilters`.
- Add `getScenarioFilters(scenario): CatalogFilterDefinition[]`.
- Add transfer params to query serialization without putting empty values in the URL.

- [ ] **Step 1: Add failing behavior assertions**

Extend `scripts/marketplaceCatalog.test.mjs` with cases for:

```js
assert.equal(filter({ scenario: "transfer" }).every((item) => item.type === "transfers"), true);
assert.equal(filter({ scenario: "experience" }).every((item) => ["excursions", "activities", "guides", "tickets", "yachts", "spa"].includes(item.type)), true);
assert.equal(serialize({ scenario: "transfer", from: "IST" }).scenario, "transfer");
```

- [ ] **Step 2: Run the focused catalog test**

Run `node scripts/marketplaceCatalog.test.mjs`.
Expected: FAIL because scenario and route fields are not supported.

- [ ] **Step 3: Implement scenario filtering and query state**

Apply scenario before ordinary filters. Define category groups in one typed map, keep date/price/duration behavior intact, and parse/serialize only valid scenario and transfer fields. Preserve existing query URLs such as `/catalog?category=transfers` by mapping them to the transfer scenario.

- [ ] **Step 4: Run regression checks**

Run `node scripts/marketplaceCatalog.test.mjs`, `node scripts/marketplaceRoutes.test.mjs`, and `npm run typecheck`.
Expected: PASS.

---

### Task 3: Build the intent-first catalog shell

**Files:**
- Create: `src/components/marketplace/ScenarioPicker.tsx`
- Modify: `src/components/marketplace/CatalogBrowser.tsx`
- Modify: `src/app/catalog/page.tsx`
- Modify: `src/components/marketplace/catalog.module.css`
- Modify: `src/components/marketplace/marketplace.module.css`

**Interfaces:**
- `ScenarioPicker({ value, onChange })` emits `MarketplaceScenario`.
- `CatalogBrowser` reads `scenario` from URL and calls `updateUrl` without losing existing filters.

- [ ] **Step 1: Add the scenario picker component**

Render four compact intent buttons with labels from `marketplace-content.ts`. Each button must be a real `<button>`, expose `aria-pressed`, have a 44px minimum target, and not use decorative-only cards.

- [ ] **Step 2: Add the scenario entry to the catalog**

Place the picker before filters. When no scenario is selected, show the four scenario choices and a small “Все предложения” fallback; when a scenario is selected, show its title, contextual search form slot, active filter chips and results.

- [ ] **Step 3: Replace the flat filter opening pattern**

Remove the always-open giant form on desktop. Keep only the primary context row visible, with secondary filters behind a clearly labelled “Фильтры” control. Ensure reset uses `router.replace(pathname)` and clears every query key.

- [ ] **Step 4: Verify keyboard and responsive structure**

Run `npm run typecheck`. Inspect at 375px, 768px and 1440px using the local browser. Expected: no horizontal overflow, no white outer panel, all controls reachable by keyboard.

---

### Task 4: Implement contextual search forms

**Files:**
- Create: `src/components/marketplace/TransferSearchForm.tsx`
- Create: `src/components/marketplace/ExperienceSearchForm.tsx`
- Modify: `src/components/marketplace/CatalogBrowser.tsx`
- Modify: `src/components/marketplace/catalog.module.css`
- Modify: `src/components/marketplace/marketplace.module.css`

**Interfaces:**
- `TransferSearchForm({ value, onChange, onSubmit })` emits `TransferSearchState`.
- `ExperienceSearchForm({ value, onChange, onSubmit })` emits date, destination, guests and experience-specific filters.

- [ ] **Step 1: Add form behavior tests**

Add DOM-independent assertions to `scripts/marketplaceUx.test.mjs` for required transfer labels: “Откуда”, “Куда”, “Дата”, “Время”, “Пассажиры”, “Багаж”, “Номер рейса”.

- [ ] **Step 2: Implement the transfer form**

Use controlled inputs, explicit labels and validation for required route/date/time fields. Keep optional flight number and child seat fields available without forcing them into the default view. Submitting sets `scenario=transfer` and writes route context into the URL.

- [ ] **Step 3: Implement the experience form**

Expose destination/date/guests first. Keep language, duration, pickup and children as secondary controls. Submitting updates the URL and filters the list.

- [ ] **Step 4: Add empty and invalid states**

When route is incomplete, show a short instruction beside the form. When no results exist, show the route/context summary and a single reset action. Do not claim that availability is live.

- [ ] **Step 5: Run focused checks**

Run `npm run typecheck` and `node scripts/marketplaceUx.test.mjs`.
Expected: PASS.

---

### Task 5: Rebuild cards around travel decisions

**Files:**
- Modify: `src/components/marketplace/ServiceCard.tsx`
- Modify: `src/components/marketplace/marketplace.module.css`
- Modify: `src/components/marketplace/catalog.module.css`
- Modify: `src/data/marketplace.ts`

**Interfaces:**
- `ServiceCard({ service, scenario })` renders a scenario-specific card.
- `getServiceCardFacts(service, scenario)` returns typed facts with label/value pairs.

- [ ] **Step 1: Add card contract assertions**

Assert that transfer cards expose route/vehicle/price-per-car wording, experience cards expose duration/language/price-per-person wording, and digital cards expose delivery/validity wording.

- [ ] **Step 2: Implement scenario-specific facts and CTA**

Use the following CTA mapping:

```ts
transfer: "Заказать трансфер"
experience: "Выбрать дату"
self-service: "Настроить услугу"
support: "Получить помощь"
```

Keep the entire card link for accessibility, but stop making the image and title the only discoverable interaction. Use a real button/link affordance with one action.

- [ ] **Step 3: Add truthful metadata**

Use existing fields such as `meetingPoint`, `deliveryMethod`, `included`, `cancellation`, `languages` and `priceUnit`. Do not invent ratings or availability. Add missing static fields only where they are present in the local data.

- [ ] **Step 4: Add image gallery hover/focus**

Use `service.images` when more than one image exists; cycle through the list with a bounded interval on hover/focus and stop/reset on leave. Respect reduced motion and avoid flashing a different image on initial render.

- [ ] **Step 5: Verify card layout**

Run `npm run typecheck` and inspect cards at 375px/768px/1440px. Expected: consistent aspect ratios, visible CTA, no clipped text, no store-like masonry distortion.

---

### Task 6: Create the transfer booking flow

**Files:**
- Modify: `src/app/services/[slug]/page.tsx`
- Create: `src/components/marketplace/BookingSummary.tsx`
- Modify: `src/components/marketplace/ProductActions.tsx`
- Create: `src/components/marketplace/CartDrawer.tsx`
- Modify: `src/app/services/[slug]/product.module.css`
- Modify: `src/components/marketplace/product-actions.module.css`

**Interfaces:**
- `BookingSummary({ service, scenario, transferState, selectedVariant, quantity, onChange })` renders the current order summary.
- `ProductActions({ serviceId, intent })` accepts `"cart" | "request" | "buy"` and exposes an accessible status message.
- `CartDrawer` reads/writes `faro-cart` and renders a local request summary.

- [ ] **Step 1: Add failing action checks**

Assert that transfer action copy contains “Заказать трансфер”, while digital goods retain “Добавить в корзину”.

- [ ] **Step 2: Implement local booking state**

Read route context from URL, allow selecting a service variant and quantity, calculate the visible total, and keep missing required transfer fields in an explicit validation state.

- [ ] **Step 3: Implement cart/request separation**

Transfers and bookable experiences create a request intent with route/date data. Digital items go to the cart. The drawer must show the actual selected title, price, unit and parameters.

- [ ] **Step 4: Add confirmation state**

After submit, show a local confirmation with request details and a clear message that a coordinator will confirm details. Do not show fake payment success or live inventory.

- [ ] **Step 5: Run route checks**

Run `node scripts/marketplaceRoutes.test.mjs`, `npm run typecheck`, and manually test a transfer request plus a digital product cart action.

---

### Task 7: Add ready-made solution pages

**Files:**
- Create: `src/app/solutions/[slug]/page.tsx`
- Create: `src/app/solutions/solutions.module.css`
- Modify: `src/data/guides.ts`
- Modify: `src/components/marketplace/MarketplaceHeader.tsx`
- Modify: `src/app/destinations/[slug]/page.tsx`

**Interfaces:**
- `generateStaticParams()` uses solution records for `istanbul`, `antalya`, `cappadocia`.
- Each solution record contains `steps`, `beforeTrip`, `onSite`, `relatedServiceSlugs`, and CTA destinations.

- [ ] **Step 1: Define truthful local solution content**

Write actionable Russian copy for each route: what to prepare, how to move, what can be booked, and what remains optional. Avoid “demo”, fabricated guarantees or invented availability.

- [ ] **Step 2: Build the solution page**

Render the plan as a readable sequence with related services linked to their exact service pages or scenario-filtered catalog URLs. Keep the page free and clearly separate advice from paid services.

- [ ] **Step 3: Connect destination pages and header**

Make destination CTAs open the relevant solution or scenario instead of a generic catalog. Keep the Faro logo link pointing to the real home page.

- [ ] **Step 4: Run route generation checks**

Run `npm run build` and `node scripts/marketplaceRoutes.test.mjs`.
Expected: `/solutions/istanbul`, `/solutions/antalya`, and `/solutions/cappadocia` are generated and linked.

---

### Task 8: Visual refinement and UX verification

**Files:**
- Modify: `src/components/marketplace/catalog.module.css`
- Modify: `src/components/marketplace/marketplace.module.css`
- Modify: `src/app/services/[slug]/product.module.css`
- Modify: `src/app/solutions/solutions.module.css`
- Create: `scripts/marketplaceUx.test.mjs`

- [ ] **Step 1: Remove legacy layout conflicts**

Delete the old asymmetric article span rules that make the catalog look like a masonry shop. Use a consistent content grid, clear section spacing, and a responsive two-column desktop list that collapses to one column.

- [ ] **Step 2: Refine controls and states**

Use one visual treatment for primary CTA, one for secondary actions, visible focus rings, active filter chips, hover transitions between 150–300ms, and no unnecessary white wrapper around the catalog.

- [ ] **Step 3: Verify user journeys**

Manually test:

1. Home → Catalog → “Нужен трансфер” → route form → transfer options → transfer detail → local request confirmation.
2. Catalog → “Найти впечатление” → date/destination filters → experience detail → choose date.
3. Catalog → digital service → detail → add to cart → cart summary.
4. Destination → ready-made solution → related service.
5. Any filtered catalog → reset → clean catalog.

- [ ] **Step 4: Run final checks**

Run:

```bash
npm run typecheck
npm run build
node scripts/marketplaceCatalog.test.mjs
node scripts/marketplaceRoutes.test.mjs
node scripts/marketplaceUx.test.mjs
git diff --check
```

Expected: typecheck, build, focused tests and whitespace checks pass. Existing unrelated lint failures must be reported separately and not hidden.

- [ ] **Step 5: Inspect responsive states**

Use the local browser at 375px, 768px and 1440px. Confirm no horizontal overflow, no clipped CTA, no inaccessible filter controls and no motion flashes on first render.

## Self-review against the approved spec

- Intent-first architecture: Tasks 1–4.
- Separate transfer route form and CTA: Tasks 4 and 6.
- Scenario-specific cards and filters: Tasks 2 and 5.
- Local cart/request behavior without false live claims: Tasks 1 and 6.
- Ready-made destination solutions: Task 7.
- Editorial visual treatment and responsive accessibility: Tasks 3, 5 and 8.
- URL state, reset behavior and generated routes: Tasks 2, 3, 6 and 7.
- No external booking/payment backend is introduced: Global Constraints and Task 6.
