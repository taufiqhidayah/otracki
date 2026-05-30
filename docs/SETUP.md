# Setup Guide

This guide covers local development and deployment configuration for otracki.

## Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.18.0 |
| npm | 10+ |
| Sentry account | Org + project with instrumented FE/BE |

## Local development

### 1. Clone and install

```bash
git clone <repo-url>
cd otracki
npm install
```

### 2. Configure the SDK

Create `packages/stacksleuth-sdk/.env`:

```env
SENTRY_AUTH_TOKEN=sntrys_...
SENTRY_ORG_SLUG=otracki
SENTRY_PROJECT_SLUG=javascript-nextjs
SENTRY_BASE_URL=https://sentry.io
STACKSLEUTH_SDK_PORT=4000
```

The SDK loads `.env` from these locations (first match wins):

1. `<cwd>/.env`
2. `<cwd>/packages/stacksleuth-sdk/.env`
3. Next to compiled SDK files
4. Parent of SDK package

**Sentry token scopes:** the token needs read access to organization events and project event details.

### 3. Configure the web app

Create `apps/stacksleuth-app/.env.local`:

```env
STACKSLEUTH_SDK_URL=http://localhost:4000
```

### 4. Start development servers

From the repo root:

```bash
npm run dev
```

This runs:

- SDK with hot reload (`tsx watch`) on port **4000**
- Next.js dev server on port **3000**

Verify the SDK is up:

```bash
curl http://localhost:4000/health
# {"ok":true}
```

### 5. Build for production

```bash
npm run build
```

Build order: SDK (`tsc`) first, then Next.js app.

### 6. Run production locally

```bash
npm run start
```

Starts both SDK and app via `concurrently`.

## Environment variables reference

### SDK (`packages/stacksleuth-sdk`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_AUTH_TOKEN` | **Yes** | — | Sentry API bearer token |
| `SENTRY_ORG_SLUG` | No | `otracki` | Sentry organization slug |
| `SENTRY_PROJECT_SLUG` | No | `javascript-nextjs` | Sentry project slug |
| `SENTRY_BASE_URL` | No | `https://sentry.io` | Sentry API base URL (use for self-hosted) |
| `STACKSLEUTH_SDK_PORT` | No | `4000` | HTTP port for the SDK server (do not use Railway `PORT` here) |
| `PORT` | No | — | Used by Next.js only; SDK ignores this |

Without `SENTRY_AUTH_TOKEN`, `/triage` and `/preview` return HTTP 500.

### Web app (`apps/stacksleuth-app`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STACKSLEUTH_SDK_URL` | No | `http://localhost:4000` | Base URL of the SDK API |
| `PORT` | No | `3000` | Next.js server port |

## Deployment

### Railway (monorepo)

The root `railway.toml` and `apps/stacksleuth-app/railway.toml` configure:

- **Build:** `npm run build` (from monorepo root)
- **Start:** `npm run start` (runs SDK + app together)

Set environment variables in the Railway dashboard:

**Required on SDK service:**

```
SENTRY_AUTH_TOKEN=...
SENTRY_ORG_SLUG=otracki
SENTRY_PROJECT_SLUG=javascript-nextjs
```

**Required on app (if deployed separately):**

```
STACKSLEUTH_SDK_URL=https://<sdk-service>.railway.app
```

When both run in one Railway service via `npm run start`, `STACKSLEUTH_SDK_URL=http://localhost:4000` works because they share the same container.

### Split deployment (recommended for production)

| Service | Platform | Port |
|---------|----------|------|
| SDK | Railway / Render / Fly.io | 4000 |
| App | Vercel / Railway | 3000 |

Point the app’s `STACKSLEUTH_SDK_URL` at the public SDK URL.

## Sentry instrumentation checklist

For best triage results, ensure your apps send:

1. **`service` tag** — `fe` or `be` on every event
2. **`page.route` tag** — current route/path on FE events
3. **`level` tag** — `error` for failures
4. **Network breadcrumbs** — fetch/xhr instrumentation enabled on FE
5. **`request_id`** — on BE events for correlation (optional but helpful)

## Troubleshooting

| Issue | Likely cause | Fix |
|-------|--------------|-----|
| `SENTRY_AUTH_TOKEN is not set` | Missing SDK env | Add token to `.env` |
| `502` from `/api/triage` or homepage | App not listening on `0.0.0.0:$PORT` or SDK not running | Redeploy with latest `scripts/start-railway.sh`; set `SENTRY_*` env vars |
| `Sentry API error: 429` | Rate limit | SDK auto-retries once; reduce preview frequency |
| Owner is `UNKNOWN` | Weak input / no matching events | Add route, widen time window, or pick event from preview |
| No network evidence | Missing breadcrumbs | Enable fetch/xhr breadcrumbs in Sentry SDK config |
| FE/BE events empty | Wrong tags or time window | Verify `service`, `page.route`, `level` tags in Sentry |
