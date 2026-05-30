import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BeLogCollector } from "./BeLogCollector.js";
import { NetworkCollector } from "./NetworkCollector.js";
import { SentryDataProvider } from "./SentryDataProvider.js";
import { TriageAnalyzer } from "./TriageAnalyzer.js";
import type { TriageContextInput, TriageRequest, TriageResult } from "./types.js";

const loadEnv = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "packages", "stacksleuth-sdk", ".env"),
    path.resolve(here, ".env"),
    path.resolve(here, "..", ".env")
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      break;
    }
  }
};

loadEnv();

export const createTriageServer = () => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "256kb" }));

  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const provider = authToken
    ? new SentryDataProvider({
        baseUrl: process.env.SENTRY_BASE_URL ?? "https://sentry.io",
        orgSlug: process.env.SENTRY_ORG_SLUG ?? "otracki",
        projectSlug: process.env.SENTRY_PROJECT_SLUG ?? "javascript-nextjs",
        authToken
      })
    : null;
  const beCollector = provider ? new BeLogCollector(provider) : null;
  const networkCollector = provider ? new NetworkCollector(provider) : null;
  const analyzer = provider ? new TriageAnalyzer(provider) : null;

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/triage", async (req, res) => {
    const requestId = randomUUID();

    if (!provider || !beCollector || !networkCollector || !analyzer) {
      res.setHeader("x-request-id", requestId);
      res.status(500).json({
        error: "SENTRY_AUTH_TOKEN belum diset. Set env var ini untuk memakai Sentry (tanpa mock)."
      });
      return;
    }

    const body = req.body as Partial<TriageRequest> | undefined;
    if (!body || typeof body.issue !== "string" || body.issue.trim().length === 0) {
      res.status(400).json({
        error: "Field 'issue' wajib diisi dan harus berupa string."
      });
      return;
    }

    try {
      const collectInput = {
        issue: body.issue,
        ...(body.environment ? { environment: body.environment } : {})
      };

      const contextFromBody = body.context && typeof body.context === "object" ? (body.context as TriageContextInput) : {};
      const context: TriageContextInput = {
        ...(contextFromBody.route ? { route: contextFromBody.route } : {}),
        ...(contextFromBody.debugId ? { debugId: contextFromBody.debugId } : {}),
        ...(contextFromBody.userHint ? { userHint: contextFromBody.userHint } : {}),
        ...(typeof contextFromBody.timeWindowMinutes === "number"
          ? { timeWindowMinutes: contextFromBody.timeWindowMinutes }
          : {})
      };
      const hasContext =
        Boolean(context.route) ||
        Boolean(context.debugId) ||
        Boolean(context.userHint) ||
        typeof context.timeWindowMinutes === "number";

      const collectInputWithContext = {
        ...collectInput,
        ...(hasContext ? { context } : {})
      };

      await Promise.all([
        beCollector.collect(collectInputWithContext),
        networkCollector.collect(collectInputWithContext)
      ]);

      const result: TriageResult = await analyzer.analyze(
        {
          issue: body.issue,
          ...(body.environment ? { environment: body.environment } : {}),
          ...(body.timestamp ? { timestamp: body.timestamp } : {}),
          ...(hasContext ? { context } : {})
        },
        { requestId }
      );

      res.setHeader("x-request-id", requestId);
      res.status(200).json(result);
    } catch (err) {
      res.setHeader("x-request-id", requestId);
      res.status(500).json({
        error: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });

  return app;
};

export const startServer = (options?: { port?: number }) => {
  const port = options?.port ?? 4000;
  const app = createTriageServer();

  app.listen(port, () => {
    process.stdout.write(`StackSleuth SDK listening on http://localhost:${port}\n`);
  });
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
