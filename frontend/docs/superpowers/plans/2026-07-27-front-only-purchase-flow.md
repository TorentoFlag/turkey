# FARO Front-only Purchase Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести FARO от каталога до локально работающей корзины, демонстрационной оплаты и личного кабинета без бэкенда.

**Architecture:** Клиентский `localStorage` store с нормализованными типами корзины и заказа. Checkout — пошаговый client component; account читает завершённые заказы из того же store. Реальные платёжные данные не сохраняются и наружу не отправляются.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS Modules, Node test runner.

## Global Constraints

- Не изменять homepage `/`.
- Не подключать backend, API, авторизацию или реальный эквайринг.
- Не хранить полный номер карты или CVV.
- Сохранять текущую визуальную систему FARO.
- Сохранять зеркало проекта нетронутым.

### Task 1: Define local cart and order contracts

**Files:**
- Modify: `src/types/marketplace.ts`
- Create: `src/lib/marketplace/local-store.ts`
- Test: `scripts/marketplaceCatalog.test.mjs`

- [ ] Add `MarketplaceCartItem`, `MarketplaceDeliveryChannel`, `MarketplaceOrderStatus`, `MarketplaceOrderItem`, and `MarketplaceOrder` types.
- [ ] Add safe JSON parsing and helpers `readCart`, `writeCart`, `readOrders`, `writeOrders`, `createOrderId`.
- [ ] Normalize legacy string cart entries into `{ serviceId, quantity: 1 }`.
- [ ] Add tests for empty storage, legacy cart normalization, quantity updates, and generated order shape.
- [ ] Run `node --test scripts/marketplaceCatalog.test.mjs`.
- [ ] Commit `feat: add local cart and order store`.

### Task 2: Implement cart and payment checkout flow

**Files:**
- Modify: `src/components/marketplace/ProductActions.tsx`
- Modify: `src/components/marketplace/CheckoutForm.tsx`
- Modify: `src/app/checkout/page.tsx`
- Modify: `src/app/checkout/checkout.module.css`
- Modify: `src/components/marketplace/MarketplaceHeader.tsx`

- [ ] Make cart entries quantity-aware and dispatch a browser `faro-cart-updated` event after mutations.
- [ ] Replace the single request form with steps `cart`, `details`, and `payment` controlled by `step` query state.
- [ ] Render quantity controls, delete actions, subtotal, service fee label, and total in the cart step.
- [ ] Require name, email, phone, delivery channel and delivery address before payment.
- [ ] Render a demo card form that validates cardholder, 16-digit card number, expiry, and CVC without storing card data.
- [ ] On payment submit, create a `paid` local order, clear the cart, and render a success state with order number and item details.
- [ ] Handle empty cart and invalid item IDs with an explanatory state and catalog link.
- [ ] Add accessible labels, focus-visible states, mobile layout, and a clear demo-payment disclaimer.
- [ ] Run lint and build.
- [ ] Commit `feat: complete local checkout and demo payment`.

### Task 3: Add account order history

**Files:**
- Create: `src/app/account/page.tsx`
- Create: `src/app/account/account.module.css`
- Create: `src/components/marketplace/AccountOrders.tsx`
- Modify: `src/components/marketplace/MarketplaceHeader.tsx`
- Modify: `src/components/marketplace/MarketplaceFooter.tsx`

- [ ] Add `/account` navigation entry with a user-facing label.
- [ ] Render empty account state with catalog link.
- [ ] Render order cards with order number, date, status, total, delivery channel and item list.
- [ ] Read orders on mount and respond to `faro-orders-updated` so the account updates in the same tab.
- [ ] Add an order detail expansion and a link back to catalog.
- [ ] Run lint and build.
- [ ] Commit `feat: add local account order history`.

### Task 4: Verify end-to-end behavior

**Files:**
- Modify: `scripts/marketplaceCatalog.test.mjs` only if a regression assertion is missing.

- [ ] Run catalog tests, lint, build, and `git diff --check`.
- [ ] Manually verify catalog → add two products → cart quantity/remove → details → demo payment → success → account after refresh.
- [ ] Confirm homepage files are unchanged and mirror path is untouched.
- [ ] Commit any final regression fix.
