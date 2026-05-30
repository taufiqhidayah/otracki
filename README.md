# Otracki — StackSleuth Triage

StackSleuth helps QA and engineers route bugs to the right owner (Frontend, Backend, or Infra) in minutes instead of hours. It pulls evidence from Sentry logs and network breadcrumbs, then returns a structured triage result ready to paste into a ticket.

## Problem

When QA finds a UI bug (e.g. checkout button error), the issue often bounces between teams:

1. QA asks Backend → Backend says the API returned 200
2. QA goes back to Frontend → Frontend finds a nullish/handler error
3. 2–3 hours lost in back-and-forth, with context lost along the way

StackSleuth reduces this by correlating FE logs, BE logs, and network signals automatically.

## What’s in this repo

| Package | Path | Description |
|---------|------|-------------|
| **StackSleuth SDK** | `packages/stacksleuth-sdk` | Node.js + TypeScript REST API (Express). Fetches Sentry data, runs triage analysis. |
| **StackSleuth App** | `apps/stacksleuth-app` | Next.js 14 web app for QA — input issue, preview events, analyze, copy result. |

This is an **npm workspaces** monorepo.

## Quick start

### Prerequisites

- Node.js ≥ 18.18
- npm 10+
- Sentry auth token with access to your org/project

### Install

```bash
npm install
```

### Environment variables

**SDK** — create `packages/stacksleuth-sdk/.env`:

```env
SENTRY_AUTH_TOKEN=your_sentry_token
SENTRY_ORG_SLUG=otracki
SENTRY_PROJECT_SLUG=javascript-nextjs
SENTRY_BASE_URL=https://sentry.io
STACKSLEUTH_SDK_PORT=4000
```

**App** — create `apps/stacksleuth-app/.env.local`:

```env
STACKSLEUTH_SDK_URL=http://localhost:4000
```

### Run locally

Start both SDK and app together:

```bash
npm run dev
```

- Web app: http://localhost:3000
- SDK API: http://localhost:4000

Or run them separately:

```bash
npm run dev -w packages/stacksleuth-sdk
npm run dev -w apps/stacksleuth-app
```

### Build & production

```bash
npm run build
npm run start
```

## QA workflow

1. **Describe** the bug — include HTTP status, timeout, CORS, or API name if known
2. **Set Sentry filters** — route (`/payment`, `/checkout`), service (fe/be), level, time window
3. **Preview** (optional) — browse candidate Sentry events and pick the right one
4. **Analyze** — get owner (FE/BE/INFRA), confidence, evidence, and next steps
5. **Copy** — paste the formatted result into your ticket

### Context anchors (recommended)

Plain text like “checkout error” is usually not enough. Provide at least:

| Field | Example | Purpose |
|-------|---------|---------|
| `route` | `/checkout` | Filters Sentry by `page.route` tag |
| `timeWindowMinutes` | `120` | How far back to search |
| `debugId` | Sentry event ID | Most precise — pin to one event |
| `service` | `fe` / `be` | Filter by `service` tag |
| `level` | `error` | Filter by log level |

## Architecture

```
┌─────────────────────┐     POST /api/triage      ┌─────────────────────┐
│  Next.js Web App    │ ────────────────────────► │  StackSleuth SDK    │
│  (port 3000)        │     POST /api/preview     │  (port 4000)        │
└─────────────────────┘                           └──────────┬──────────┘
                                                             │
                                                             ▼
                                                  ┌─────────────────────┐
                                                  │  Sentry API         │
                                                  │  (events & details) │
                                                  └─────────────────────┘
```

The app proxies requests to the SDK. The SDK uses `SentryDataProvider` to fetch events, `TriageAnalyzer` to decide ownership, and returns structured evidence.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for details.

## API overview

| Layer | Endpoint | Purpose |
|-------|----------|---------|
| App | `POST /api/triage` | Proxy to SDK triage |
| App | `POST /api/preview` | Proxy to SDK preview |
| SDK | `GET /health` | Health check |
| SDK | `POST /triage` | Run full triage analysis |
| SDK | `POST /preview` | List candidate Sentry events |

See [docs/API.md](./docs/API.md) for request/response schemas.

## Triage logic (summary)

The analyzer routes based on combined signals:

| Signal | Typical owner |
|--------|---------------|
| Network 200 + FE exception | **FE** (high confidence) |
| Network status 0 / gateway error | **INFRA** |
| Network 5xx + BE error logs | **BE** |
| Network 4xx | **FE** (payload/contract issue) |
| FE error, no network record | **FE** (medium) |
| BE error logs only | **BE** |
| Insufficient evidence | **UNKNOWN** |

Input quality (`poor` / `ok` / `good`) affects confidence. Add route, debug ID, or time window to improve results.

## Sentry tags

StackSleuth relies on these Sentry tags:

- `service: fe | be` — separates frontend vs backend events
- `page.route: "/..."` — page/route where the issue occurred
- `level: debug | info | warn | error` — log severity
- `request_id` / `requestId` — backend correlation (optional)
- `http.status`, `request.path` — network evidence from tags

Network evidence also comes from fetch/xhr/http breadcrumbs when instrumented.

## Deployment

Both services can run on Railway using the included `railway.toml` configs. The monorepo `npm run start` runs SDK and app together via `concurrently`.

**App environment:**

```env
STACKSLEUTH_SDK_URL=https://your-sdk-domain.railway.app
```

**SDK environment:**

```env
SENTRY_AUTH_TOKEN=...
SENTRY_ORG_SLUG=otracki
SENTRY_PROJECT_SLUG=javascript-nextjs
SENTRY_BASE_URL=https://sentry.io
STACKSLEUTH_SDK_PORT=4000
```

See [docs/SETUP.md](./docs/SETUP.md) for full setup instructions.

## Project structure

```
otracki/
├── apps/
│   └── stacksleuth-app/       # Next.js QA web app
│       ├── app/
│       │   ├── page.tsx         # Triage UI
│       │   └── api/             # Proxy routes
│       └── components/
│           └── ResultCard.tsx   # Result display + copy
├── packages/
│   └── stacksleuth-sdk/       # Triage engine
│       ├── TriageServer.ts      # Express REST API
│       ├── TriageAnalyzer.ts    # Owner decision logic
│       ├── SentryDataProvider.ts
│       ├── BeLogCollector.ts
│       ├── NetworkCollector.ts
│       └── types.ts
├── docs/                      # Documentation
├── package.json               # Workspace root
└── railway.toml
```

## Roadmap

- Return top-N candidate events for FE and BE in evidence
- Richer network parsing (status grouping, endpoint analysis)
- Triage presets by product area
- Notion/Jira integration for auto-ticket creation

## License

Private — internal use.
