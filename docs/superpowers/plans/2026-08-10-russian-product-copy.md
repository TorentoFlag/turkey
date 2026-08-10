# Russian Product Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification after every task.

**Goal:** Translate the two remaining English customer-facing Turkey product titles into approved Russian titles through the audited Admin API, preserving every other catalog field.

**Architecture:** A standalone, versioned Node.js content-migration script owns a fixed manifest and communicates only with the protected Turkey Admin API. It verifies the complete manifest against a fresh catalog read before any mutation, defaults to dry-run, and updates each record serially with a JSON body containing only `title`.

**Tech Stack:** Node.js ESM, native `fetch`, existing NestJS Admin API, Node test runner, Docker Compose production runtime.

## Global Constraints

- Do not write to PostgreSQL or MinIO directly and do not edit catalog content in the browser.
- Do not modify slugs, prices, categories, types, images, descriptions, sort order, activity state, orders, or test product `cat`.
- Keep the translation manifest limited to the approved two slugs in the design specification.
- Mutations require `--apply`; a missing, duplicated, or drifted source record must fail before the first PATCH.
- Use actor `catalog-copy-translation-2026-08-10` so standard `product.updated` audit entries are created.

## Task 1: Create and test the safe migration module

**Files:**
- Create: `scripts/catalog-import/translate-product-copy.mjs`
- Create: `scripts/catalog-import/translate-product-copy.test.mjs`

1. Write focused tests for the immutable two-row manifest, default dry-run, preflight failure on missing/duplicate/drifted titles, serial exact-title PATCH payloads, and response invariant checking.
2. Run the test file and confirm it fails because the migration module does not exist yet.
3. Implement a testable module with a transport abstraction:
   - list every product through `GET /v1/admin/products`;
   - check each manifest slug has exactly one source product and its title exactly matches the expected English title;
   - build the full update plan before issuing a request;
   - report dry-run counts/slugs without mutating;
   - in apply mode, PATCH each product in manifest order with exactly `{ title }` and validate returned immutable fields.
4. Add a narrow CLI entry point that reads `ADMIN_API_KEY`, `CATALOG_IMPORT_API_BASE_URL`, and optional actor ID from the environment, with `--apply` as the sole mutation flag.
5. Re-run the test file and inspect the diff for payload or logging of unrelated product data.

## Task 2: Document the operator runbook

**Files:**
- Modify: `docs/development/production-runbook.md`

1. Add a short catalog-copy migration procedure after the catalog import section.
2. Specify the internal Docker-network dry-run and explicit apply invocations, required environment variables, fixed actor, and required post-apply re-read.
3. State that it is one-shot and never rerun after a successful apply because the expected English precondition will intentionally fail.
4. Run `git diff --check` and search the changed plan/runbook/script paths for unresolved `TODO` or `TBD` markers.

## Task 3: Verify, release, and perform the authorized production migration

**Files:**
- No additional source files expected.

1. From `backend/`, run `npm run test:integration -- admin-catalog.integration.spec.ts`; run the new Node migration tests; then run the relevant backend typecheck/build commands available in `package.json`.
2. Commit only the migration script, its tests, plan, and runbook. Push `main` and wait for the Turkey deployment workflow to complete.
3. On `188.116.20.163`, inventory the active API container/image and take a scoped pre-migration PostgreSQL backup before changing data.
4. Run the migration dry-run within the active Docker network against `http://api:3001`; require exactly two planned updates and zero mutations.
5. Run the same command once with `--apply`. Re-read through the Admin API and compare each updated record against its pre-migration immutable snapshot.
6. Open both live product pages/cards in a browser, confirm the Russian titles are visible, and confirm `https://turkeyplanners.com/api/health` stays healthy.
7. Review `git status`, deployed image/commit, audit records for the two `product.updated` events, and report the exact proof plus any residual risk.

