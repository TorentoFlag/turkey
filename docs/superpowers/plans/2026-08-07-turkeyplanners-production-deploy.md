# Turkey Planners production deployment plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the current `main` revision to `turkeyplanners.com` and make every later push to `main` deploy the same container stack automatically.

**Architecture:** Nginx terminates TLS and proxies `/` to the Next.js container and `/api/` to the Nest API container. Docker Compose owns PostgreSQL, explicit migrations, API, worker and storefront. GitHub Actions connects with a dedicated deploy key, runs a server-owned `git pull --ff-only`, and rebuilds Compose; provider credentials remain solely in `/etc/turkiye/turkiye.env`.

**Tech Stack:** Ubuntu, Docker Compose, Nginx, Let's Encrypt Certbot, GitHub Actions, GitHub read-only deploy key, SSH.

## Global constraints

- Target is `188.116.20.163` and `turkeyplanners.com` (its A record is verified).
- All code changes are direct to `main`; no feature branch/worktree.
- No real card data, production refund or end-user notification is created as deployment verification.
- Arc, Resend and Slack credentials are never committed, printed or placed in public frontend variables.
- Admin access remains static `X-Admin-Api-Key` plus `X-Admin-Actor-Id`, never JWT/Bearer.

### Task 1: Prepare secure runtime and HTTPS

**Files:**
- Create on server: `/etc/turkiye/turkiye.env`, `/etc/nginx/sites-available/turkeyplanners.com`
- Create on server: `/opt/turkiye`

- [x] Install Docker Compose, Nginx, Certbot and allow only SSH/HTTP/HTTPS through UFW.
- [x] Create root-only runtime environment containing generated database/admin secrets and supplied provider credentials.
- [x] Issue a Let's Encrypt certificate for `turkeyplanners.com`; proxy `/` and `/api/` to loopback container ports.
- [x] Verify HTTPS response and security headers without creating a customer/order.

### Task 2: Configure source access and initial deployment

**Files:**
- Create on server: `/root/.ssh/turkiye_github_deploy`, `/opt/turkiye/scripts/deploy.sh`

- [x] Add a read-only GitHub deploy key for this repository; clone current `main` into `/opt/turkiye`.
- [x] Create a server deploy script that checks out `origin/main` with fast-forward-only semantics and starts `compose.prod.yml` using the private environment file.
- [x] Run initial deployment and prove migrations complete, API/frontend healthchecks pass and HTTPS `/` plus `/api/health` return `200`.

### Task 3: Add GitHub Actions deployment trigger

**Files:**
- Create: `.github/workflows/deploy.yml`

- [x] Generate a distinct Action-to-server SSH key, install its public half on the server and store the private half plus pinned host key as GitHub repository secrets.
- [x] Add a concurrency-protected workflow for `push` to `main` and manual dispatch; it invokes only `/opt/turkiye/scripts/deploy.sh` over SSH.
- [x] Push the workflow, verify the triggered Actions run, and inspect server/runtime health after it completes.

### Task 4: Closeout

**Files:**
- Modify: `docs/development/production-runbook.md`
- Modify: this plan

- [x] Record actual public endpoints and secret rotation/deploy operation without storing credentials.
- [x] Run relevant repository verification, inspect the diff for credentials, commit and push all repository changes.
