# Production runbook

## Purpose and boundary

This runbook launches the repository's four runtime roles through
`compose.prod.yml`: PostgreSQL, Nest API, Nest outbox worker and Next.js
storefront. The one-shot `migrate` service runs before API and worker. It does
not authorize a production deploy, real payment/refund, or notification to a
real user by itself.

The production server must put an HTTPS reverse proxy in front of the two
loopback-bound ports. Publish the storefront origin and the Arc webhook URL,
not PostgreSQL or the raw container ports.

Current production routing is:

- storefront: `https://turkeyplanners.com`;
- API: `https://turkeyplanners.com/api`;
- Arc webhook: `https://turkeyplanners.com/api/v1/webhooks/arc`.

Product photos are served only through the public HTTPS `/media/` path. Keep
MinIO and its Console private to the Compose network; the host reverse proxy
owns this one narrow bucket read route:

```nginx
location ^~ /media/ {
  proxy_pass http://minio:9000/turkiye-catalog-media/;
  proxy_set_header Host $host;
  proxy_hide_header x-amz-request-id;
}
```

## Operator-only environment

Keep the environment file outside the repository with restrictive filesystem
permissions. Never paste its contents into a ticket, log, commit or frontend
environment file.

| Variable | Role | Requirement |
| --- | --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | PostgreSQL bootstrap | unique production values |
| `DATABASE_URL` | API, worker, migrate | `postgresql://...@postgres:5432/...`; host must be `postgres` inside Compose |
| `ADMIN_API_KEY` | trusted external admin | long random server-to-server secret; admin sends it only in `X-Admin-Api-Key` |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | MinIO bootstrap/init only | unique root credentials; never passed to API or worker |
| `MINIO_BUCKET` | MinIO/API/worker | optional; defaults to `turkiye-catalog-media` |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | API and worker | dedicated non-root user limited to the bucket's `products/` objects |
| `MEDIA_PUBLIC_BASE_URL` | API and worker | public HTTPS media origin, for example `https://turkeyplanners.com/media` |
| `ARC_SECRET_API_KEY`, `ARC_WEBHOOK_SECRET` | Arc Pay | production keys only after Arc account and webhook URL are configured |
| `RESEND_API_KEY`, `RESEND_FROM` | email | least-privilege key and verified sender domain |
| `SLACK_WEBHOOK_URL` | operations | private incoming webhook; never frontend-visible |
| `WEB_APP_ORIGIN` | browser CORS/CSRF and Arc return URL | exact public HTTPS storefront origin, no trailing path |
| `NEXT_PUBLIC_API_BASE_URL` | built storefront | public HTTPS API base URL; contains no secret |
| `NEXT_PUBLIC_BASE_PATH` | built storefront | empty for a root domain; set only for an intentional subpath |
| `API_BIND_PORT`, `FRONTEND_BIND_PORT` | host loopback ports | optional; defaults 3001/3000 |
| `WORKER_POLL_INTERVAL_MS` | worker | optional, 250–300000; defaults 5000 |

`NEXT_PUBLIC_*` values are compiled into frontend output. They must not contain
keys, Slack URLs, database URLs or credentials.

## Preflight

1. Run `npm run verify` in `backend` and frontend lint/typecheck/build from the
   exact commit being deployed.
2. Confirm `WEB_APP_ORIGIN`, `NEXT_PUBLIC_API_BASE_URL`, reverse-proxy routes
   and Arc configured return/webhook URLs use the intended HTTPS domains.
3. Confirm Resend sender domain has SPF/DKIM verified and the chosen sender is
   authorized.
4. Confirm the external admin uses exactly `X-Admin-Api-Key` and
   `X-Admin-Actor-Id`; do not introduce browser JWT/Bearer access to Admin API.
5. Back up the database before applying a new migration. Inspect the migration
   SQL and planned downtime/lock risk.
6. Confirm the `/media/` reverse-proxy block targets only
   `turkiye-catalog-media/`; do not publish a MinIO port or Console route.

## Launch and observe

```sh
docker compose --env-file /secure/path/turkiye.env -f compose.prod.yml config
docker compose --env-file /secure/path/turkiye.env -f compose.prod.yml up -d --build
docker compose --env-file /secure/path/turkiye.env -f compose.prod.yml ps
docker compose --env-file /secure/path/turkiye.env -f compose.prod.yml logs --tail=100 api worker migrate
```

Expected state: `migrate` exited with code 0; PostgreSQL, API, worker and
frontend are running; API and frontend healthchecks are healthy. Check the
public HTTPS storefront and API health through the reverse proxy. Do not call
Arc refund, send a real purchase, or register a real email address merely to
test deployment.

## Continuous deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`. The workflow has no
provider credentials: it connects with a dedicated SSH key whose server-side
entry is restricted to `/opt/turkiye/scripts/deploy.sh`. The script uses the
server's read-only GitHub deploy key, performs `git pull --ff-only origin main`,
validates Compose and rebuilds the stack with `/etc/turkiye/turkiye.env`.

GitHub repository secrets required for this workflow are
`TURKIYE_DEPLOY_HOST`, `TURKIYE_DEPLOY_KNOWN_HOSTS` and
`TURKIYE_DEPLOY_SSH_KEY`. They are deployment transport credentials only;
Arc, Resend, Slack, database and admin secrets must never be GitHub Actions
secrets or workflow environment variables.

## Post-launch controls

- Monitor undelivered/retried outbox events and failed refunds; worker restart
  must not duplicate a delivered event.
- Rotate `ADMIN_API_KEY`, Arc, Resend and Slack secrets through the secret
  store; restart affected services after rotation.
- Apply database migrations only through the explicit `migrate` role, never by
  API or worker startup.
- If an Arc webhook signature fails, retain only safe correlation metadata in
  logs and investigate configuration; never disable signature validation.

## Rollback

Stop application services first, keep the PostgreSQL volume intact, and deploy
the last known-good image/configuration. Do not delete the volume or roll back
schema migrations blindly. A migration rollback requires a reviewed recovery
procedure and a verified backup.
