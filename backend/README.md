# Backend foundation

This package is the NestJS/Fastify backend foundation for the marketplace. It
currently provides validated server configuration, PostgreSQL/Drizzle migration
infrastructure, readiness at `GET /health`, request IDs, and persisted outbox
claiming. Product endpoints and provider integrations are intentionally not
part of this foundation.

## Prerequisites

- Node.js 24 (`>=24 <25`; see the repository `.nvmrc`)
- Docker Desktop or another running Docker daemon
- Docker access for Testcontainers. Integration tests start disposable
  `postgres:17-alpine` containers and do not use the local development database.

The development PostgreSQL instance is published only on
`127.0.0.1:5433`; port `5432` is deliberately not used. The checked-in
`.env.example` contains local development credentials only. Do not put provider
credentials or production values in `.env`.

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
migration command before starting either process.

The current worker performs one outbox claim pass and exits; it has no Arc Pay,
Resend, Slack, or other provider client. For local development, run:

```sh
cd backend
npm run dev:worker
```

## Verification

After Docker is available, run the complete repository package check:

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
