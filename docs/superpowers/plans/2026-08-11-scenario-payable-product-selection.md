# Scenario payable product selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the VV Admin checkout scenario chooses a payable product rather than a booking record.

**Architecture:** Keep selection inside `OrdersService.createScenarioOrder`. The query filters the existing `products` table by the same checkout eligibility rules before inserting the technical scenario order; the controller and VV Admin contract stay unchanged.

**Tech Stack:** NestJS, Drizzle ORM, PostgreSQL, Vitest integration tests.

## Global Constraints

- `booking` never receives an Arc checkout.
- Use a real database integration test, not a mocked order-selection query.
- Do not alter customer-facing order or payment behavior.

---

### Task 1: Filter scenario product selection

**Files:**

- Modify: `backend/test/admin-catalog.integration.spec.ts`
- Modify: `backend/src/modules/orders/orders.service.ts`

**Interfaces:**

- Consumes: `POST /v1/admin/scenario-orders` and the `products` table.
- Produces: a checkout URL and a scenario order whose `product_type` is `auto_delivery` or `physical` when such an active product exists.

- [ ] **Step 1: Write the failing integration test**

Create an active `booking` and then an active priced `auto_delivery` product.
Stub the two Arc requests, call the scenario endpoint with trusted admin headers,
and assert HTTP 201 plus a database order whose `product_type` is not `booking`.

- [ ] **Step 2: Verify the focused test is red**

Run: `npm run test:integration -- --run backend/test/admin-catalog.integration.spec.ts -t "selects a payable product"`

Expected: HTTP 400 because the current code selects the earlier booking product.

- [ ] **Step 3: Apply the minimal database filter**

Use one `where(and(...))` query that requires `isActive`, excludes `booking`,
requires non-null `priceMinor` and `currency`, and limits currency to Arc's
supported `RUB`, `KZT`, or `UZS` values. Retain the current 400 error for an
empty result.

- [ ] **Step 4: Verify the focused test and backend gate**

Run: `npm run test:integration -- --run backend/test/admin-catalog.integration.spec.ts -t "selects a payable product"`

Then run: `npm run lint && npm run typecheck && npm run test:integration && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit the scoped change**

```bash
git add backend/src/modules/orders/orders.service.ts backend/test/admin-catalog.integration.spec.ts docs/superpowers/specs/2026-08-11-scenario-payable-product-selection-design.md docs/superpowers/plans/2026-08-11-scenario-payable-product-selection.md
git commit -m "fix(orders): select payable scenario products"
```
