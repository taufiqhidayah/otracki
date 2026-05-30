# API Reference

StackSleuth exposes two layers: the **SDK REST API** (Express) and **Next.js proxy routes** that forward to the SDK.

## SDK API (port 4000)

Base URL: `http://localhost:4000` (or `STACKSLEUTH_SDK_URL` in production)

---

### `GET /health`

Health check.

**Response `200`:**

```json
{ "ok": true }
```

---

### `POST /triage`

Run full triage analysis — fetch FE/BE logs and network records from Sentry, then determine owner.

**Request body:**

```json
{
  "issue": "Clicked Pay Now, toast error appeared. Get Quote returned 404.",
  "environment": "staging",
  "timestamp": "2026-05-30T10:00:00.000Z",
  "context": {
    "route": "/payment",
    "debugId": "abc123...",
    "userHint": "test-user-42",
    "timeWindowMinutes": 120,
    "service": "fe",
    "level": "error"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issue` | `string` | **Yes** | Bug description from QA |
| `environment` | `"local" \| "dev" \| "staging" \| "prod"` | No | Target environment |
| `timestamp` | `string` (ISO) | No | When the issue occurred |
| `context.route` | `string` | No | Page route — maps to Sentry `page.route` tag |
| `context.debugId` | `string` | No | Sentry event ID (32-char hex) |
| `context.userHint` | `string` | No | Test user identifier for tag matching |
| `context.timeWindowMinutes` | `number` | No | Search window in minutes (1–720, default 5) |
| `context.service` | `"fe" \| "be" \| "any"` | No | Filter by `service` tag |
| `context.level` | `"debug" \| "info" \| "warn" \| "error" \| "any"` | No | Filter by `level` tag |

**Response `200`:**

```json
{
  "owner": "FE",
  "confidence": "high",
  "headline": "FE issue — runtime/validation error on submit. BE returned 200.",
  "evidence": [
    {
      "source": "FE_LOG",
      "summary": "TypeError: Cannot read properties of null route=/checkout level=error service=fe (sentryEventId=...)",
      "detail": "at handleSubmit (checkout.tsx:42:10)\n..."
    },
    {
      "source": "NETWORK",
      "summary": "POST /api/quote -> 200",
      "detail": "request={...}\nresponse={...}"
    }
  ],
  "nextStep": "Escalate to the FE team. Include the error headline and relevant payload (redact PII).",
  "meta": {
    "requestId": "uuid",
    "analyzedAt": "2026-05-30T10:05:00.000Z",
    "inputQuality": "good",
    "input": {
      "route": "/payment",
      "timeWindowMinutes": 120,
      "level": "error"
    }
  }
}
```

**Owner values:** `"FE"` | `"BE"` | `"INFRA"` | `"UNKNOWN"`

**Confidence values:** `"low"` | `"medium"` | `"high"`

**Evidence sources:** `"FE_LOG"` | `"BE_LOG"` | `"NETWORK"`

**Input quality:** `"poor"` | `"ok"` | `"good"` — affects confidence downgrade

**Error responses:**

| Status | Body |
|--------|------|
| `400` | `{ "error": "Field 'issue' is required and must be a string." }` |
| `500` | `{ "error": "SENTRY_AUTH_TOKEN is not set..." }` or Sentry API error message |

**Headers:** `x-request-id` on all responses

---

### `POST /preview`

List candidate Sentry events before running full triage. Used by the UI to let QA pick a specific event.

**Request body:**

```json
{
  "issue": "Get Quote returned 404 on the payment page",
  "context": {
    "route": "/payment",
    "timeWindowMinutes": 120,
    "service": "fe",
    "level": "error"
  },
  "limit": 8
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issue` | `string` | No | Defaults to `"preview"` if empty |
| `context` | `TriageContextInput` | No | Same as triage |
| `limit` | `number` | No | Max events to return (default 8) |

**Response `200`:**

```json
{
  "events": [
    {
      "eventId": "abc123...",
      "title": "TypeError: Cannot read properties of null",
      "dateCreated": "2026-05-30T09:55:00.000Z",
      "tags": {
        "route": "/payment",
        "level": "error",
        "service": "fe"
      }
    }
  ]
}
```

Events are ranked by relevance to the issue text, route, and user hint.

---

## Next.js proxy routes (port 3000)

These routes forward requests to the SDK. They mirror the SDK schemas with minor differences (no `environment`/`timestamp` in the app UI currently).

### `POST /api/triage`

Proxies to `POST {STACKSLEUTH_SDK_URL}/triage`.

**Request body:**

```json
{
  "issue": "Bug description",
  "context": {
    "route": "/payment",
    "debugId": "...",
    "timeWindowMinutes": 120,
    "service": "fe",
    "level": "error"
  }
}
```

**Responses:** same as SDK, plus `502` if SDK is unreachable.

---

### `POST /api/preview`

Proxies to `POST {STACKSLEUTH_SDK_URL}/preview`.

**Request body:**

```json
{
  "issue": "Bug description",
  "context": { "route": "/payment", "timeWindowMinutes": 120 },
  "limit": 8
}
```

**Responses:** same as SDK preview endpoint.

---

## TypeScript types

Shared types live in `packages/stacksleuth-sdk/types.ts`:

```typescript
export type TriageOwner = "FE" | "BE" | "INFRA" | "UNKNOWN";
export type EnvironmentName = "local" | "dev" | "staging" | "prod";
export type InputQuality = "poor" | "ok" | "good";

export interface TriageContextInput {
  route?: string;
  debugId?: string;
  userHint?: string;
  timeWindowMinutes?: number;
  service?: "fe" | "be" | "any";
  level?: "debug" | "info" | "warn" | "error" | "any";
}

export interface TriageRequest {
  issue: string;
  environment?: EnvironmentName;
  timestamp?: string;
  context?: TriageContextInput;
}

export interface EvidenceItem {
  source: "FE_LOG" | "BE_LOG" | "NETWORK";
  summary: string;
  detail?: string;
}

export interface TriageResult {
  owner: TriageOwner;
  confidence: "low" | "medium" | "high";
  headline: string;
  evidence: EvidenceItem[];
  nextStep: string;
  meta: {
    requestId: string;
    analyzedAt: string;
    inputQuality: InputQuality;
    input: TriageContextInput;
  };
}
```

Import from the SDK package:

```typescript
import type { TriageResult, TriageRequest } from "@otracki/stacksleuth-sdk";
```
