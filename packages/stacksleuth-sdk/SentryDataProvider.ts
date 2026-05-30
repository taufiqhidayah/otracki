import type {
  BeLogEntry,
  DataProvider,
  EnvironmentName,
  FeLogEntry,
  NetworkRecord,
  TriageContextInput
} from "./types.js";

type SentryEventListItem = {
  eventID?: string;
  id?: string;
  dateCreated?: string;
  message?: string;
  title?: string;
  culprit?: string;
  platform?: string;
  tags?: Array<{ key: string; value: string }>;
};

type SentryEventDetails = SentryEventListItem & {
  entries?: Array<{
    type: string;
    data: unknown;
  }>;
  metadata?: unknown;
};

const isHexEventId = (value: string) => /^[a-f0-9]{32}$/i.test(value);

const safeString = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value : undefined);

const pickTimeWindow = (context?: TriageContextInput) => {
  const minutes = typeof context?.timeWindowMinutes === "number" && Number.isFinite(context.timeWindowMinutes) ? context.timeWindowMinutes : 5;
  const clamped = Math.max(1, Math.min(120, Math.floor(minutes)));
  return `${clamped}m`;
};

const scoreEvent = (event: SentryEventListItem, input: { issue: string; context?: TriageContextInput }) => {
  const issue = input.issue.toLowerCase();
  const route = input.context?.route?.toLowerCase();
  const userHint = input.context?.userHint?.toLowerCase();

  let score = 0;

  const hay = [event.title, event.message, event.culprit]
    .filter((v): v is string => typeof v === "string")
    .join("\n")
    .toLowerCase();

  for (const token of issue.split(/\s+/).filter(Boolean)) {
    if (token.length < 3) continue;
    if (hay.includes(token)) score += 1;
  }

  if (route && hay.includes(route)) score += 5;

  if (userHint) {
    const tags = event.tags?.map((t) => `${t.key}:${t.value}`.toLowerCase()).join("\n") ?? "";
    if (tags.includes(userHint)) score += 3;
  }

  return score;
};

const findBreadcrumbsEntry = (event: SentryEventDetails) => event.entries?.find((e) => e.type === "breadcrumbs");

const findExceptionEntry = (event: SentryEventDetails) => event.entries?.find((e) => e.type === "exception");

const parseExceptionStack = (entryData: unknown) => {
  const data = entryData as any;
  const values = Array.isArray(data?.values) ? data.values : [];
  const first = values[0];
  const value = safeString(first?.value) ?? safeString(first?.type);
  const frames = Array.isArray(first?.stacktrace?.frames) ? first.stacktrace.frames : [];
  const top = frames.slice(-8).reverse();
  const stack = top
    .map((f: any) => {
      const fn = safeString(f.function) ?? "anonymous";
      const filename = safeString(f.filename) ?? safeString(f.absPath) ?? "unknown";
      const line = typeof f.lineNo === "number" ? f.lineNo : undefined;
      const col = typeof f.colNo === "number" ? f.colNo : undefined;
      const loc = [filename, line, col].filter((v) => v !== undefined).join(":");
      return `at ${fn} (${loc})`;
    })
    .join("\n");
  return { value, stack: stack || undefined };
};

const parseNetworkFromBreadcrumbs = (entryData: unknown): NetworkRecord | null => {
  const data = entryData as any;
  const values = Array.isArray(data?.values) ? data.values : [];

  const candidates = values
    .map((b: any) => {
      const category = safeString(b?.category)?.toLowerCase() ?? "";
      const breadcrumbData = b?.data ?? {};
      const url =
        safeString(breadcrumbData?.url) ??
        safeString(breadcrumbData?.to) ??
        safeString(breadcrumbData?.from) ??
        safeString(breadcrumbData?.path);
      const method = safeString(breadcrumbData?.method) ?? safeString(breadcrumbData?.["http.method"]);
      const status =
        typeof breadcrumbData?.status_code === "number"
          ? breadcrumbData.status_code
          : typeof breadcrumbData?.status === "number"
            ? breadcrumbData.status
            : typeof breadcrumbData?.status === "string"
              ? Number(breadcrumbData.status)
              : undefined;
      const timestamp = safeString(b?.timestamp);
      const isHttpish =
        category.includes("fetch") ||
        category.includes("xhr") ||
        category.includes("http") ||
        category.includes("request") ||
        Boolean(url && method);

      return {
        isHttpish,
        url,
        method,
        status,
        timestamp
      };
    })
    .filter((c: any) => c.isHttpish)
    .reverse();

  const best = candidates.find((c: any) => c.url && c.method && typeof c.status === "number") ?? candidates[0];
  if (!best || !best.url || !best.method) return null;

  const upperMethod = best.method.toUpperCase();
  const normalizedMethod =
    upperMethod === "GET" || upperMethod === "POST" || upperMethod === "PUT" || upperMethod === "PATCH" || upperMethod === "DELETE"
      ? upperMethod
      : "GET";

  const statusNum = typeof best.status === "number" && Number.isFinite(best.status) ? best.status : 0;

  return {
    timestamp: best.timestamp ?? new Date().toISOString(),
    method: normalizedMethod,
    url: best.url,
    status: statusNum
  };
};

export class SentryDataProvider implements DataProvider {
  private readonly bestEventCache = new Map<string, Promise<SentryEventDetails | null>>();

  constructor(
    private readonly config: {
      baseUrl: string;
      orgSlug: string;
      projectSlug: string;
      authToken: string;
    }
  ) {}

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private async sentryFetchJson(path: string, params?: Record<string, string>) {
    const url = new URL(path, this.config.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const doFetch = async () =>
      fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.config.authToken}`,
          "content-type": "application/json"
        }
      });

    let resp = await doFetch();
    if (resp.status === 429) {
      await this.sleep(1200);
      resp = await doFetch();
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Sentry API error: ${resp.status} ${resp.statusText}${text ? ` - ${text}` : ""}`);
    }

    return resp.json();
  }

  private async listProjectEvents(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }) {
    const statsPeriod = pickTimeWindow(input.context);
    const path = `/api/0/projects/${encodeURIComponent(this.config.orgSlug)}/${encodeURIComponent(this.config.projectSlug)}/events/`;
    const json = (await this.sentryFetchJson(path, {
      statsPeriod,
      full: "1"
    })) as unknown;
    return Array.isArray(json) ? (json as SentryEventDetails[]) : [];
  }

  private async getProjectEvent(eventId: string) {
    const path = `/api/0/projects/${encodeURIComponent(this.config.orgSlug)}/${encodeURIComponent(this.config.projectSlug)}/events/${encodeURIComponent(eventId)}/`;
    return (await this.sentryFetchJson(path)) as SentryEventDetails;
  }

  private async pickBestEvent(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }) {
    const cacheKey = JSON.stringify({
      issue: input.issue,
      environment: input.environment ?? null,
      route: input.context?.route ?? null,
      debugId: input.context?.debugId ?? null,
      userHint: input.context?.userHint ?? null,
      timeWindowMinutes: input.context?.timeWindowMinutes ?? null
    });

    const existing = this.bestEventCache.get(cacheKey);
    if (existing) return existing;

    const task = (async () => {
      const debugId = safeString(input.context?.debugId);
      if (debugId && isHexEventId(debugId)) {
        return this.getProjectEvent(debugId);
      }

      const events = await this.listProjectEvents(input);
      if (events.length === 0) return null;

      const ranked = events
        .map((e) => ({ e, score: scoreEvent(e, input) }))
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.e ?? null;
      return best;
    })();

    this.bestEventCache.set(cacheKey, task);
    if (this.bestEventCache.size > 50) {
      const firstKey = this.bestEventCache.keys().next().value as string | undefined;
      if (firstKey) this.bestEventCache.delete(firstKey);
    }

    return task;
  }

  async getFeLogs(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<FeLogEntry[]> {
    const best = await this.pickBestEvent(input);
    if (!best) {
      return [
        {
          timestamp: new Date().toISOString(),
          level: "warn",
          message: "Tidak menemukan event di Sentry untuk time window yang dipilih. Coba perkecil time window atau isi Debug ID."
        }
      ];
    }

    const exception = findExceptionEntry(best);
    const { value, stack } = exception ? parseExceptionStack(exception.data) : { value: undefined, stack: undefined };

    const msg =
      value ??
      safeString(best.title) ??
      safeString(best.message) ??
      "Event ditemukan di Sentry, tapi tidak ada detail exception yang bisa diparse.";

    const eventId = safeString(best.eventID) ?? safeString(best.id);

    return [
      {
        timestamp: safeString(best.dateCreated) ?? new Date().toISOString(),
        level: "error",
        message: eventId ? `${msg} (sentryEventId=${eventId})` : msg,
        ...(stack ? { stack } : {})
      }
    ];
  }

  async getBeLogs(_input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<BeLogEntry[]> {
    return [];
  }

  async getNetworkRecord(input: {
    issue: string;
    environment?: EnvironmentName;
    context?: TriageContextInput;
  }): Promise<NetworkRecord | null> {
    const best = await this.pickBestEvent(input);
    if (!best) return null;

    const breadcrumbs = findBreadcrumbsEntry(best);
    if (!breadcrumbs) return null;

    return parseNetworkFromBreadcrumbs(breadcrumbs.data);
  }
}
