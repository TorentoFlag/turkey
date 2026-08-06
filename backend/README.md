# Backend

NestJS/Fastify API and отдельный outbox worker туристического маркетплейса.
API владеет auth, каталогом, заказами, Arc Pay, Admin API и вебхуком; worker
доставляет только разрешённые уведомления через Resend и Slack. Карточные
данные никогда не проходят через это приложение.

## Prerequisites

- Node.js 24 (`>=24 <25`; see the repository `.nvmrc`)
- Docker Desktop or another running Docker daemon
- Docker access for Testcontainers. Integration tests start disposable
  `postgres:17-alpine` containers and do not use the local development database.

The development PostgreSQL instance is published only on
`127.0.0.1:5433`; port `5432` is deliberately not used. The checked-in
`.env.example` contains local development defaults only. Do not commit provider
credentials or production values in `.env`.

`ADMIN_API_KEY` is a required server secret for the external admin. Generate a
long random value for each environment; the admin sends it only as
`X-Admin-Api-Key`. The API also requires `X-Admin-Actor-Id` on every protected
admin request for audit attribution. There is no JWT or Bearer-token contract.

## Run the API locally

From the repository root, run:

```sh
cd backend
cp .env.example .env
docker compose -f ../compose.dev.yml up -d postgres
npm install
npm run db:migrate
npm run dev
```

In a second terminal, verify readiness:

```sh
curl -i http://127.0.0.1:3001/health
```

The expected response is HTTP `200` with body `{"status":"ok"}`. The health
endpoint returns `503` with `{"status":"unavailable"}` when PostgreSQL cannot
be reached.

## Migrations and worker

Migrations are an explicit operator action:

```sh
cd backend
npm run db:migrate
```

Neither the API nor the worker applies migrations during startup. Run the
migration command before starting either process. In `compose.prod.yml` this is
the separate one-shot `migrate` service; `api` and `worker` wait for its
successful completion.

In production the worker polls pending outbox events every
`WORKER_POLL_INTERVAL_MS` (default: 5000) and stops cleanly on SIGTERM. It uses
Resend for the two permitted email types and Slack for accepted orders/bookings.
Tests retain a one-pass worker mode and mock all provider HTTP calls. For local
development, run:

```sh
cd backend
npm run dev:worker
```

## Container runtime

`../compose.prod.yml` creates four persistent roles plus one migration job:
PostgreSQL, `migrate`, API, worker and frontend. PostgreSQL and the two HTTP
ports are not exposed publicly: they bind to `127.0.0.1`; a separate HTTPS
reverse proxy terminates TLS and routes the public storefront/API URLs.

Before first launch, create an operator-only environment file outside Git. It
must include `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, a
Docker-network `DATABASE_URL` using host `postgres`, `ADMIN_API_KEY`, both Arc
keys, `RESEND_API_KEY`, `RESEND_FROM`, `SLACK_WEBHOOK_URL`, `WEB_APP_ORIGIN`
and `NEXT_PUBLIC_API_BASE_URL`. The public origin must be HTTPS and exactly
match the browser origin; neither it nor any `NEXT_PUBLIC_*` value may contain a
secret. See [`../docs/development/production-runbook.md`](../docs/development/production-runbook.md)
for the complete checklist.

Build and start only after the checklist is complete:

```sh
docker compose --env-file /secure/path/turkiye.env -f compose.prod.yml up -d --build
docker compose --env-file /secure/path/turkiye.env -f compose.prod.yml ps
```

Do not use a provider's real payment/refund or end-user notification as a smoke
test. Verify health, migrations and test outbox events in a controlled
environment first.

## Verification

After Docker is available, run the complete backend check:

```sh
cd backend
npm ci
npm run verify
```

`verify` runs lint, formatting, type checking, the Drizzle migration check,
unit tests, Testcontainers integration tests, and the production build.

To stop the local development database after testing without deleting its named
volume:

```sh
docker compose -f ../compose.dev.yml down
```
