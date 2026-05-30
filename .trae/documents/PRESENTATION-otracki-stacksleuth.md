---
title: "Otracki — StackSleuth Triage"
audience: "Hackathon / Internal QA-Eng"
format: "Markdown slides"
---

# Otracki — StackSleuth Triage

- Tujuan: bantu QA nentuin owner issue (FE / BE / Infra) dalam menit, bukan jam
- Output: ringkasan bukti + langkah lanjut yang bisa langsung dicopy ke tiket

---

# Problem

- QA nemu issue UI (mis. checkout button error)
- QA tanya BE → BE bilang 200
- QA balik ke FE → FE baru ketemu nullish/handler error
- Waktu kebuang: 2–3 jam bolak-balik + konteks hilang di tengah

---

# What We Built

- Monorepo `otracki` (npm workspaces)
- `packages/stacksleuth-sdk`: Node.js + TypeScript, REST API (Express)
- `apps/stacksleuth-app`: Next.js 14 App Router + Tailwind, UI khusus QA

---

# Core Idea: Context Anchors

Teks “checkout error” doang biasanya kurang.

Kita dorong QA isi konteks minimal:
- `page.route` (contoh: `/checkout`, `/hotels`)
- `time window` (menit terakhir)
- `debugId / eventId` (paling presisi)
- `userHint` (identifier test user)

---

# UX Flow (QA)

1) QA isi deskripsi + route + time window
2) (Opsional) klik Preview → lihat event kandidat dari Sentry
3) Klik event → auto isi Debug ID
4) Analyze → dapat routing + evidence + next steps

---

# Evidence Model

Output berisi evidence terstruktur:
- `FE_LOG`: event/error FE dari Sentry (tag `service=fe`)
- `BE_LOG`: event/error BE dari Sentry (tag `service=be`)
- `NETWORK`: breadcrumb/tag network jika tersedia (fetch/xhr/http)

---

# Sentry as Source of Truth

Kenapa Sentry:
- Sudah ada data real dari FE & BE
- Bisa query berdasarkan tags untuk triage cepat

Tag kunci yang dipakai:
- `service: fe|be`
- `page.route: "/..."` (contoh: `/hotels`)
- `level: info|warn|error`

---

# How We Differentiate FE vs BE

Kita pakai tag ini untuk filter:
- `service:fe` → FE_LOG
- `service:be` → BE_LOG

Dan menampilkan metadata penting di summary:
- `route=/hotels`
- `level=info|warn|error`
- `sentryEventId=<eventId>`

---

# Architecture

- Next.js UI (QA App)
  - `/api/triage` proxy ke SDK
  - `/api/preview` proxy ke SDK
- SDK (Express)
  - `POST /preview` → ambil kandidat event dari Sentry
  - `POST /triage` → ambil FE_LOG, BE_LOG, NETWORK → analyze → return result
- Sentry API (events & event detail)

---

# Key Endpoints

- SDK
  - `GET /health`
  - `POST /preview`
  - `POST /triage`
- App
  - `POST /api/preview`
  - `POST /api/triage`

---

# Deployment (Simple Setup)

- SDK: Railway (public URL)
- App: Vercel

Env var di App (Vercel):
- `STACKSLEUTH_SDK_URL=https://<railway-sdk-domain>`

Env var di SDK (Railway):
- `SENTRY_AUTH_TOKEN=...`
- `SENTRY_ORG_SLUG=otracki`
- `SENTRY_PROJECT_SLUG=javascript-nextjs`
- `SENTRY_BASE_URL=https://sentry.io`

---

# Demo Script (2 menit)

1) Buka UI QA
2) Isi:
   - route: `/hotels`
   - time window: `120m` (atau sesuai kejadian)
3) Klik Preview → pilih event yang cocok
4) Klik Analyze → lihat:
   - Owner (FE/BE/INFRA)
   - Confidence
   - Evidence (FE_LOG / BE_LOG / NETWORK)
5) Klik Copy → paste ke tiket

---

# What “Good” Looks Like

Ticket yang rapi dari QA:
- Summary issue + route
- Event ID / Debug ID
- FE/BE evidence singkat
- Network status (kalau ada)
- Next action jelas: “ping FE / ping BE / ping Infra”

---

# Constraints & Notes

- Kalau hanya `info` event tracking, triage bisa “FE medium” (karena belum tentu error)
- Network evidence tergantung breadcrumb instrumentation (fetch/xhr)
- Rate limit Sentry bisa ketat → kita serialisasi akses & retry untuk 429

---

# Roadmap (Next)

- Ambil lebih dari 1 event kandidat untuk FE/BE (top-N) dan tampilkan di evidence
- Network parsing lebih kaya (status_code, endpoint grouping, error types)
- “Triage presets” berdasarkan product area (tanpa hardcode issue text)
- Notion/Jira integration untuk auto-create ticket dari hasil triage

---

# Q&A

- Apa konteks minimal yang paling sering tersedia?
- Apakah BE punya request_id yang bisa disimpan sebagai tag?
- Breadcrumb network sudah enabled di FE?

