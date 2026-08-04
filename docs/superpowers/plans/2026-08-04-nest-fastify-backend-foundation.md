# NestJS backend foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Создать проверяемую основу backend: NestJS API на Fastify, PostgreSQL/Drizzle migrations, health/readiness, безопасную config validation и отдельный worker с outbox persistence — без продуктовых endpoint-ов и внешних side effects.

**Architecture:** backend/ — самостоятельный TypeScript package, не workspace и не изменение frontend lockfile. API bootstrap создаёт NestFastifyApplication с rawBody: true; worker создаёт Nest application context без HTTP-порта. PostgreSQL доступен через pg Pool и Drizzle; только отдельная db:migrate команда применяет reviewed SQL migrations. Интеграционные тесты используют одноразовый PostgreSQL Testcontainers, API проверяется через Fastify inject().

**Tech Stack:** Node 24 (>=24 <25), TypeScript 5.9.3, NestJS 11.1.28, Nest Fastify adapter 11.1.28, Nest config 4.0.4, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, pg 8.22.0, Zod 4.4.3, Vitest 4.1.10, Testcontainers, Docker Compose/PostgreSQL 17.

## Global Constraints

- Соблюдать AGENTS.md, product/business-rules.md, architecture/overview.md и утверждённый design 2026-08-04-nest-fastify-backend-foundation-design.md.
- Не изменять frontend и не переносить localStorage/mock checkout в этом срезе.
- Не добавлять Arc/Resend/Slack SDK, HTTP-клиент, Redis, queue, cookies/auth, Swagger или provider endpoint.
- Реальный HTTP listener не запускается в tests; Fastify тестируется с app.inject() после ready().
- API/worker не применяют миграции на старте; это делает только npm run db:migrate.
- Registration, catalog, money, orders, payment, webhook и email остаются вне scope.
- Никаких секретов в коде. Локальный dev PostgreSQL использует 127.0.0.1:5433, поскольку 5432 занят другим проектом.
- Testcontainers/Docker failure должен завершать integration suite явно; запрещены SQLite, PGlite, fallback на local dev DB и skip test.

---

## Предварительная карта файлов

~~~
.gitignore
.nvmrc
compose.dev.yml
backend/
  .env.example
  package.json / package-lock.json
  tsconfig.json / tsconfig.build.json
  eslint.config.mjs / prettier.config.mjs
  drizzle.config.ts
  src/
    main.ts
    worker.ts
    app.module.ts
    config/env.ts
    config/config.module.ts
    database/database.module.ts
    database/database.service.ts
    database/migrate.ts
    database/schema/index.ts
    database/schema/outbox-events.ts
    common/app-factory.ts
    common/request-context.ts
    common/health/health.controller.ts
    common/health/health.module.ts
    common/health/health.service.ts
    modules/{auth,catalog,orders,payments,audit}/*.module.ts
    modules/notifications/{notifications.module.ts,outbox.repository.ts,outbox.worker.ts}
  drizzle/0000_initial_outbox.sql
  test/
    config.spec.ts
    support/postgres.ts
    database.integration.spec.ts
    health.integration.spec.ts
    worker.integration.spec.ts
    vitest.unit.config.ts / vitest.integration.config.ts
  README.md
~~~

## Contracts created by this plan

~~~
type AppEnv = Readonly<{
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}>;

function parseEnv(input: NodeJS.ProcessEnv): AppEnv;
function createApiApp(module: Type<unknown>): Promise<NestFastifyApplication>;

class DatabaseService {
  readonly db: NodePgDatabase<typeof schema>;
  ping(): Promise<void>;
}

type NewOutboxEvent = Readonly<{
  type: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
}>;

class OutboxRepository {
  enqueue(event: NewOutboxEvent): Promise<void>;
  claimPending(limit: number): Promise<ReadonlyArray<OutboxEvent>>;
  markDelivered(id: string): Promise<void>;
}
~~~

### Task 1: Import the supplied Git remote and create the local runtime contract

**Files:**
- Create: .gitignore, .nvmrc, compose.dev.yml, backend/.env.example
- Modify: none
- Test: clean Git staging plus PostgreSQL compose healthcheck

**Consumes:** existing frontend prototype, root docs, remote https://github.com/TorentoFlag/turkey.git.

**Produces:** a Git main baseline, server-only local env template and isolated local PostgreSQL configuration.

- [ ] **Step 1: Confirm the remote/current checkout state**

Run:

~~~
git ls-remote --symref https://github.com/TorentoFlag/turkey.git
git rev-parse --is-inside-work-tree
~~~

Expected: remote is reachable (it may be empty); current root is either not yet a Git checkout or is the clean preflight checkout created solely to initialise the agent ledger.

- [ ] **Step 2: Add only safe root infrastructure**

Create .gitignore:

~~~
**/node_modules/
**/dist/
**/coverage/
**/.env
**/.env.*
!**/.env.example
.DS_Store
.worktrees/
~~~

Create .nvmrc containing 24. Create backend/.env.example:

~~~
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://turkiye:turkiye@127.0.0.1:5433/turkiye
LOG_LEVEL=info
~~~

Create compose.dev.yml with one postgres:17-alpine service. It uses user/database/password turkiye, named volume turkiye-postgres-data, healthcheck pg_isready -U turkiye -d turkiye, and maps 127.0.0.1:5433:5432.

- [ ] **Step 3: Initialize and publish only after exact staged-tree review**

Run:

~~~
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || git init -b main
git remote get-url origin >/dev/null 2>&1 || git remote add origin https://github.com/TorentoFlag/turkey.git
test "$(git remote get-url origin)" = "https://github.com/TorentoFlag/turkey.git"
git add AGENTS.md .codex docs frontend .gitignore .nvmrc compose.dev.yml backend/.env.example
git diff --cached --check
git status --short
git commit -m "chore: import project baseline"
git push -u origin main
git check-ignore -q .worktrees
git worktree add .worktrees/backend-foundation -b feat/backend-foundation
~~~

Expected: the baseline has docs/prototype only; no .env, node_modules, generated output or credentials. If diff --cached --check finds pre-existing whitespace in a required historical file, normalize only that whitespace, preserve content, rerun the check and record the path in the task report. All remaining tasks execute from .worktrees/backend-foundation. Stop on authentication failure or a conflicting remote branch; never force-push.

### Task 2: Scaffold backend package and prove configuration validation via TDD

**Files:**
- Create: backend/package.json, backend/tsconfig.json, backend/tsconfig.build.json, backend/eslint.config.mjs, backend/prettier.config.mjs
- Create: backend/src/config/env.ts, backend/src/config/config.module.ts
- Create: backend/test/config.spec.ts, backend/test/vitest.unit.config.ts
- Test: backend/test/config.spec.ts

**Consumes:** .nvmrc and backend/.env.example.

**Produces:** parseEnv() and repeatable test/lint/typecheck/build scripts for all later modules.

- [ ] **Step 1: Write the failing configuration test**

Create backend/test/config.spec.ts:

~~~
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

const valid = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/turkiye_test',
  LOG_LEVEL: 'warn',
};

describe('parseEnv', () => {
  it('returns typed configuration for a valid environment', () => {
    expect(parseEnv(valid)).toEqual({
      NODE_ENV: 'test',
      PORT: 3001,
      DATABASE_URL: valid.DATABASE_URL,
      LOG_LEVEL: 'warn',
    });
  });

  it.each([
    { ...valid, DATABASE_URL: undefined },
    { ...valid, DATABASE_URL: 'not-a-url' },
    { ...valid, PORT: '0' },
    { ...valid, NODE_ENV: 'preview' },
  ])('rejects invalid server configuration', (input) => {
    expect(() => parseEnv(input)).toThrow(/configuration/i);
  });
});
~~~

- [ ] **Step 2: Add package/tooling and verify red**

Create an independent package with engines >=24 <25 and exact scripts:

~~~
"dev": "tsx watch src/main.ts",
"dev:worker": "tsx watch src/worker.ts",
"build": "tsc -p tsconfig.build.json",
"start": "node dist/main.js",
"start:worker": "node dist/worker.js",
"lint": "eslint \"{src,test}/**/*.ts\"",
"format:check": "prettier --check .",
"typecheck": "tsc --noEmit",
"test": "vitest run --config test/vitest.unit.config.ts",
"test:integration": "vitest run --config test/vitest.integration.config.ts",
"db:generate": "drizzle-kit generate --config drizzle.config.ts",
"db:migrate": "tsx src/database/migrate.ts",
"db:check": "drizzle-kit check --config drizzle.config.ts",
"verify": "npm run lint && npm run format:check && npm run typecheck && npm run db:check && npm run test && npm run test:integration && npm run build"
~~~

Install exact runtime dependencies: @nestjs/common/core/platform-fastify/config 11.1.28/4.0.4, drizzle-orm 0.45.2, pg 8.22.0, zod 4.4.3. Install exact dev dependencies: TypeScript 5.9.3, tsx 4.23.5, drizzle-kit 0.31.10, Vitest 4.1.10, Testcontainers, @nestjs/testing, types and ESLint/Prettier tooling. Do not install fastify directly.

Run:

~~~
cd backend
npm test
~~~

Expected: RED because src/config/env.ts does not exist, not because Vitest cannot boot.

- [ ] **Step 3: Implement the minimum config module**

Implement parseEnv() with Zod: allow only development/test/production; coerce PORT to integer 1–65535; require valid postgresql URL; default LOG_LEVEL to info. Wrap validation error in Error beginning Invalid application configuration without outputting credentials. Configure ConfigModule.forRoot({ isGlobal: true, cache: true, validate: parseEnv }) and permit unrelated host env variables.

- [ ] **Step 4: Verify green**

Run:

~~~
cd backend
npm test
npm run typecheck
npm run lint
npm run format:check
~~~

Expected: test and static checks pass.

- [ ] **Step 5: Commit the configuration foundation**

~~~
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/tsconfig.build.json backend/eslint.config.mjs backend/prettier.config.mjs backend/src/config backend/test/config.spec.ts backend/test/vitest.unit.config.ts
git commit -m "feat(backend): add validated Nest configuration"
~~~

### Task 3: Add a reviewed Drizzle migration and database lifecycle

**Files:**
- Create: backend/drizzle.config.ts, backend/src/database/schema/index.ts, backend/src/database/schema/outbox-events.ts
- Create: backend/src/database/database.module.ts, backend/src/database/database.service.ts, backend/src/database/migrate.ts
- Create: backend/drizzle/0000_initial_outbox.sql, backend/drizzle/meta/_journal.json
- Create: backend/test/support/postgres.ts, backend/test/database.integration.spec.ts, backend/test/vitest.integration.config.ts
- Test: backend/test/database.integration.spec.ts

**Consumes:** AppEnv and config module.

**Produces:** DatabaseService.ping(), typed outboxEvents schema and explicit runMigrations(url).

- [ ] **Step 1: Write a failing clean-PostgreSQL integration test**

Use PostgreSqlContainer('postgres:17-alpine') in test/support/postgres.ts. The test creates a disposable container, sets DATABASE_URL to its mapped port, calls the same runMigrations(url) used by db:migrate, and asserts:

~~~
const result = await pool.query(
  "select table_name from information_schema.tables where table_schema = 'public' and table_name = 'outbox_events'",
);
expect(result.rows).toHaveLength(1);
~~~

Run npm run test:integration. Expected: RED because migration/database code is absent. The test must not read the local 5433 connection string.

- [ ] **Step 2: Define minimal outbox data and generate reviewed SQL**

The outbox_events schema contains UUID id, text type, UUID aggregate_id, unique idempotency_key, JSONB payload, integer attempts default 0, nullable next_attempt_at/delivered_at, and timestamptz created_at default now. Add pending-events index over delivered_at, next_attempt_at, created_at. Run db:generate, review SQL and commit the generated SQL/journal. Do not run drizzle-kit push.

- [ ] **Step 3: Implement migration and pool lifecycle**

runMigrations(url) creates short-lived pg Pool, calls Drizzle migrator with migrationsFolder ./drizzle, and closes the pool in finally. DatabaseService makes one application pool, exposes drizzle(pool, { schema }), pings with select 1, and closes in onApplicationShutdown. It must never call runMigrations().

- [ ] **Step 4: Verify database contract**

Run:

~~~
cd backend
npm run test:integration -- database.integration.spec.ts
npm test
npm run db:check
npm run typecheck
~~~

Expected: fresh Testcontainers PostgreSQL receives reviewed migration; no local dev DB is used.

- [ ] **Step 5: Commit migration/database lifecycle**

~~~
git add backend/drizzle.config.ts backend/drizzle backend/src/database backend/test/support/postgres.ts backend/test/database.integration.spec.ts backend/test/vitest.integration.config.ts
git commit -m "feat(backend): add Drizzle outbox migration"
~~~

### Task 4: Build Fastify API bootstrap, readiness health check and correlation ID

**Files:**
- Create: backend/src/app.module.ts, backend/src/main.ts
- Create: backend/src/common/app-factory.ts, backend/src/common/request-context.ts
- Create: backend/src/common/health/health.module.ts, backend/src/common/health/health.controller.ts, backend/src/common/health/health.service.ts
- Create: backend/test/health.integration.spec.ts
- Test: backend/test/health.integration.spec.ts

**Consumes:** ConfigModule, DatabaseModule and DatabaseService.ping().

**Produces:** createApiApp(AppModule), GET /health, x-request-id response header and controlled shutdown.

- [ ] **Step 1: Write failing Fastify inject tests**

Create real AppModule through TestingModule and FastifyAdapter. After app.init(), call app.getHttpAdapter().getInstance().ready(). Assert:

~~~
const response = await app.inject({
  method: 'GET',
  url: '/health',
  headers: { 'x-request-id': 'request-123' },
});
expect(response.statusCode).toBe(200);
expect(response.json()).toEqual({ status: 'ok' });
expect(response.headers['x-request-id']).toBe('request-123');
~~~

Replace DatabaseService.ping with rejection in a separate test and expect 503 and { status: 'unavailable' }. Close app in afterEach.

- [ ] **Step 2: Run health test to prove red**

~~~
cd backend
npm run test:integration -- health.integration.spec.ts
~~~

Expected: RED because app/health modules do not exist; no port conflict/external HTTP call.

- [ ] **Step 3: Implement minimum API**

createApiApp() calls:

~~~
NestFactory.create<NestFastifyApplication>(
  module,
  new FastifyAdapter({ logger: false }),
  { rawBody: true },
);
~~~

Register Fastify onRequest hook: preserve non-empty incoming x-request-id, otherwise crypto.randomUUID(); emit it in response header. HealthService only calls database.ping(). Controller returns { status: 'ok' } or throws ServiceUnavailableException({ status: 'unavailable' }) without DB error text. main.ts listens on validated port only when invoked as API entrypoint.

- [ ] **Step 4: Verify green through Fastify**

~~~
cd backend
npm run test:integration -- health.integration.spec.ts
npm test
npm run lint
npm run typecheck
~~~

Expected: 200/503 and request ID are demonstrated through inject(); tests bind no public listener.

- [ ] **Step 5: Commit API foundation**

~~~
git add backend/src/app.module.ts backend/src/main.ts backend/src/common backend/test/health.integration.spec.ts
git commit -m "feat(backend): add Fastify health readiness"
~~~

### Task 5: Add no-network worker and typed outbox persistence

**Files:**
- Create: backend/src/worker.ts
- Create: backend/src/modules/notifications/notifications.module.ts, outbox.repository.ts, outbox.worker.ts
- Create: module files in modules/auth, catalog, orders, payments, audit
- Create: backend/test/worker.integration.spec.ts
- Test: backend/test/worker.integration.spec.ts

**Consumes:** outboxEvents schema and DatabaseService.

**Produces:** worker application context, safe OutboxRepository and no-op foundation dispatch boundary.

- [ ] **Step 1: Write failing worker tests**

On clean Testcontainers DB after migration, enqueue:

~~~
await repository.enqueue({
  type: 'order.accepted',
  aggregateId: crypto.randomUUID(),
  idempotencyKey: 'order.accepted:test-order',
  payload: { orderId: 'test-order' },
});
~~~

Assert duplicate idempotency key is deterministically ignored/rejected, claimPending(10) returns once, markDelivered(id) removes it from next claim, and worker.runOnce() does not call a spy on globalThis.fetch. Close Nest context and pool.

- [ ] **Step 2: Run worker test to prove red**

~~~
cd backend
npm run test:integration -- worker.integration.spec.ts
~~~

Expected: RED because notifications/outbox module is absent.

- [ ] **Step 3: Implement transaction-ready persistence without dispatch**

enqueue() inserts with onConflictDoNothing for idempotency_key. claimPending(limit) uses PostgreSQL transaction with FOR UPDATE SKIP LOCKED, selects only undelivered/due events ordered by creation, increments attempts and returns claimed data. markDelivered() assigns delivered_at once. OutboxWorker.runOnce() claims and logs only safe ID/type, never fetches/sends. worker.ts uses NestFactory.createApplicationContext(AppModule) and closes on SIGINT/SIGTERM. Create empty module boundaries with no controllers or fake endpoints.

- [ ] **Step 4: Verify full foundation**

~~~
cd backend
npm run test:integration -- worker.integration.spec.ts
npm run verify
~~~

Expected: clean DB proves outbox idempotency/claim/delivery and zero network calls; lint, format, typecheck, migration check, all tests and build pass.

- [ ] **Step 5: Commit worker boundary**

~~~
git add backend/src/worker.ts backend/src/modules backend/test/worker.integration.spec.ts
git commit -m "feat(backend): add outbox worker foundation"
~~~

### Task 6: Add runbook and independent acceptance review

**Files:**
- Create: backend/README.md
- Modify: docs/architecture/overview.md only if implementation proves an approved factual correction
- Modify: docs/development/quality-gates.md only if command contract changes
- Test: complete verify plus clean local compose runtime check

**Consumes:** completed backend foundation.

**Produces:** reproducible non-secret local runbook and evidence-backed independent acceptance.

- [ ] **Step 1: Write runbook**

Document exact commands:

~~~
cd backend
cp .env.example .env
docker compose -f ../compose.dev.yml up -d postgres
npm install
npm run db:migrate
npm run dev
curl -i http://127.0.0.1:3001/health
~~~

Also document dev:worker, verify, Docker/Testcontainers prerequisite, host port 5433, and rule that API/worker never migrate on startup.

- [ ] **Step 2: Run clean verification**

Run API in a separate terminal/session, then:

~~~
cd backend
npm ci
cp .env.example .env
docker compose -f ../compose.dev.yml up -d postgres
npm run db:migrate
npm run verify
curl --fail --silent --show-error http://127.0.0.1:3001/health
~~~

Expected: 200 body { "status": "ok" }, no use of 5432, no provider network call. Terminate API/compose cleanly after evidence is gathered.

- [ ] **Step 3: Independent test-engineer/reviewer gate**

Give the final diff plus plan to independent test/review roles. They must prove: invalid config fails before listen; migrations explicit; local port is 5433; Testcontainers creates clean DB; Fastify ready + inject works; failed DB ping yields 503; outbox duplicate is idempotent; worker does not make HTTP calls; no secrets/Arc/Resend/Slack appear. Resolve blocker/required findings and rerun affected checks.

- [ ] **Step 4: Commit docs and publish after acceptance**

~~~
git add backend/README.md docs
git diff --cached --check
git commit -m "docs: add backend foundation runbook"
git push
~~~

Expected: remote receives only reviewed/tested foundation commits; no force push and no deployment.

## Plan self-review

- **Coverage:** tasks cover Git baseline, Nest/Fastify package, typed config, PostgreSQL/Drizzle migration, health/readiness, correlation, outbox persistence, worker, local runbook and independent review.
- **TDD:** every implementation slice begins with a named failing test, expected failure, minimal implementation and green command.
- **Compatibility:** Fastify comes only via Nest adapter; Node 24 requirement matches current machine; Testcontainers prevents 5432 collisions; migrations are not startup side effects.
- **Scope:** registration, catalog, payment, webhook, notification delivery and frontend remain deliberately excluded.
