"use client";

import {
  AlertCircle,
  ArrowRight,
  Clock,
  Eye,
  Loader2,
  MapPin,
  Search,
  Sparkles
} from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyResult, ResultCard, ResultSkeleton, type TriageResult } from "../components/ResultCard";

type InputQuality = "poor" | "ok" | "good";
type ServiceFilter = "any" | "fe" | "be";
type LevelFilter = "any" | "debug" | "info" | "warn" | "error";

type PreviewEvent = {
  eventId: string;
  title: string;
  dateCreated: string;
  tags: Partial<{ route: string; level: string; service: string }>;
};

const ROUTE_PRESETS = ["/payment", "/hotels", "/checkout", "/login"] as const;

const ISSUE_TEMPLATES = [
  {
    label: "Checkout error",
    issue: "Clicked checkout, got an error. What did the API return?",
    route: "/checkout",
    level: "error" as const
  },
  {
    label: "Payment 404",
    issue: "Get Quote returned 404 on the payment page",
    route: "/payment",
    level: "error" as const
  },
  {
    label: "Hotel search failed",
    issue: "Hotel search keeps loading / Failed to fetch",
    route: "/hotels",
    level: "error" as const
  }
];

const TIME_PRESETS = [15, 60, 120, 240] as const;

const inputQualityConfig: Record<InputQuality, { badge: string; label: string }> = {
  good: { badge: "bg-lime-400/15 text-lime-200 ring-lime-400/25", label: "Good" },
  ok: { badge: "bg-amber-400/15 text-amber-200 ring-amber-400/25", label: "OK" },
  poor: { badge: "bg-red-400/10 text-red-200 ring-red-400/20", label: "Low" }
};

const computeInputQuality = (input: { issue: string; route: string; timeWindow: number }) => {
  let score = 0;
  if (input.timeWindow > 0) score += 1;
  if (input.route.trim().length > 0) score += 1;

  if (score >= 2) return "good" as const;
  if (score === 1) return "ok" as const;

  const normalizedIssue = input.issue.toLowerCase();
  const hasStrongKeywords = ["500", "timeout", "cors", "401", "403", "404", "422"].some((k) =>
    normalizedIssue.includes(k)
  );

  return hasStrongKeywords ? ("ok" as const) : ("poor" as const);
};

const buildContext = (input: {
  route: string;
  timeWindowMinutes: number;
  service: ServiceFilter;
  level: LevelFilter;
  debugId?: string;
}) => ({
  ...(input.route.trim() ? { route: input.route.trim() } : {}),
  ...(input.debugId?.trim() ? { debugId: input.debugId.trim() } : {}),
  ...(input.timeWindowMinutes > 0 ? { timeWindowMinutes: input.timeWindowMinutes } : {}),
  ...(input.service !== "any" ? { service: input.service } : {}),
  ...(input.level !== "any" ? { level: input.level } : {})
});

const fieldClass =
  "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-ink-100 outline-none transition focus:border-lime-400/40 focus:ring-2 focus:ring-lime-400/20";

export default function Page() {
  const [issue, setIssue] = useState("");
  const [route, setRoute] = useState("/payment");
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(120);
  const [service, setService] = useState<ServiceFilter>("fe");
  const [level, setLevel] = useState<LevelFilter>("error");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const issueOk = issue.trim().length > 0;
  const canSubmit = issueOk && !loading;

  const inputQuality = useMemo(
    () => computeInputQuality({ issue, route, timeWindow: timeWindowMinutes }),
    [issue, route, timeWindowMinutes]
  );

  const qualityConfig = inputQualityConfig[inputQuality];

  const activeFilters = useMemo(() => {
    const chips: string[] = [];
    if (route.trim()) chips.push(`route ${route.trim()}`);
    if (service !== "any") chips.push(`service=${service}`);
    if (level !== "any") chips.push(`level=${level}`);
    chips.push(`${timeWindowMinutes}m`);
    return chips;
  }, [route, service, level, timeWindowMinutes]);

  const recommendation = useMemo(() => {
    if (route.trim() && level === "error") return "Route + error level — good fit for API/UI bugs.";
    if (route.trim()) return "Route is set. For API errors, use level error.";
    if (level === "debug") return "Debug level rarely matches error events. Try error instead.";
    return "Add a page route (e.g. /payment) to tighten Sentry filters.";
  }, [route, level]);

  const applyTemplate = (template: (typeof ISSUE_TEMPLATES)[number]) => {
    setIssue(template.issue);
    setRoute(template.route);
    setLevel(template.level);
    setPreviewEvents(null);
    setResult(null);
    setError(null);
  };

  const runTriage = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const resp = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issue,
          context: buildContext({ route, timeWindowMinutes, service, level })
        })
      });

      const data = (await resp.json().catch(() => null)) as unknown;

      if (!resp.ok) {
        const msg = typeof (data as { error?: string })?.error === "string" ? (data as { error: string }).error : "Triage failed.";
        setError(msg);
        setResult(null);
        return;
      }

      setResult(data as TriageResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runTriage();
  };

  const onPreview = async () => {
    if (!issueOk || previewLoading) return;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const resp = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issue,
          context: buildContext({ route, timeWindowMinutes, service, level }),
          limit: 8
        })
      });

      const data = (await resp.json().catch(() => null)) as { error?: string; events?: PreviewEvent[] };
      if (!resp.ok) {
        setPreviewError(typeof data?.error === "string" ? data.error : "Failed to fetch preview from Sentry.");
        setPreviewEvents(null);
        return;
      }

      setPreviewEvents(Array.isArray(data?.events) ? data.events : []);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Network error.");
      setPreviewEvents(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const analyzeWithEvent = async (eventId: string) => {
    setSelectedEventId(eventId);
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issue,
          context: buildContext({ route, timeWindowMinutes, service, level, debugId: eventId })
        })
      });

      const data = (await resp.json().catch(() => null)) as unknown;
      if (!resp.ok) {
        setError(typeof (data as { error?: string })?.error === "string" ? (data as { error: string }).error : "Triage failed.");
        setResult(null);
        return;
      }
      setResult(data as TriageResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-white">Bug report</h2>
                <span
                  className={[
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1",
                    qualityConfig.badge
                  ].join(" ")}
                >
                  Context: {qualityConfig.label}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{recommendation}</p>
            </div>
            <Sparkles className="h-5 w-5 shrink-0 text-lime-300/70" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {ISSUE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-ink-300 transition hover:border-lime-400/30 hover:bg-lime-400/10 hover:text-lime-100"
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-ink-200">
                What happened? <span className="text-red-300">*</span>
              </label>
              <textarea
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                rows={4}
                placeholder="e.g. Clicked Pay Now, toast error appeared. Get Quote returned 404."
                className={`${fieldClass} resize-none`}
              />
              <p className="text-[11px] text-ink-500">
                Include keywords: HTTP status (404, 500), timeout, CORS, or API name.
              </p>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <MapPin className="h-3.5 w-3.5 text-lime-300" />
                Filter Sentry
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-300">Route / Page</label>
                <div className="flex flex-wrap gap-2">
                  {ROUTE_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRoute(preset)}
                      className={[
                        "rounded-lg px-3 py-1.5 font-mono text-xs transition ring-1",
                        route === preset
                          ? "bg-lime-400/15 text-lime-100 ring-lime-400/30"
                          : "bg-black/30 text-ink-400 ring-white/10 hover:text-ink-200"
                      ].join(" ")}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="/payment"
                  className={fieldClass}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-ink-300">Service</label>
                  <select value={service} onChange={(e) => setService(e.target.value as ServiceFilter)} className={fieldClass}>
                    <option value="any">All</option>
                    <option value="fe">Frontend (fe)</option>
                    <option value="be">Backend (be)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-ink-300">Level</label>
                  <select value={level} onChange={(e) => setLevel(e.target.value as LevelFilter)} className={fieldClass}>
                    <option value="any">All</option>
                    <option value="error">error — bugs & failed APIs</option>
                    <option value="warn">warn</option>
                    <option value="info">info</option>
                    <option value="debug">debug</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-ink-300">
                  <Clock className="h-3.5 w-3.5" />
                  Time window
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIME_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTimeWindowMinutes(m)}
                      className={[
                        "rounded-full px-3 py-1.5 text-xs ring-1 transition",
                        timeWindowMinutes === m
                          ? "bg-amber-400/15 text-amber-100 ring-amber-400/30"
                          : "bg-black/30 text-ink-400 ring-white/10 hover:text-ink-200"
                      ].join(" ")}
                    >
                      {m >= 60 ? `${m / 60}h` : `${m}m`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeFilters.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-[10px] text-ink-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {error ? (
              <div className="flex gap-3 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-ink-500">
                Required: description. Recommended: route + level + time window.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onPreview}
                  disabled={!issueOk || previewLoading || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-ink-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  Preview
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-lime-300 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Analyze
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Sentry event preview</h3>
              <p className="mt-1 text-xs text-ink-400">Check if your filters match logs before analyzing.</p>
            </div>
            {previewEvents ? (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-ink-300">
                {previewEvents.length} event
              </span>
            ) : null}
          </div>

          {previewError ? (
            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
              {previewError}
            </div>
          ) : null}

          {previewLoading ? (
            <div className="mt-4 flex items-center justify-center gap-2 py-8 text-sm text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching Sentry…
            </div>
          ) : previewEvents && previewEvents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-6 text-center">
              <p className="text-sm text-ink-300">No events match your filters.</p>
              <ul className="mx-auto mt-3 max-w-xs space-y-1 text-left text-[11px] text-ink-500">
                <li>• Route must match the <code className="text-ink-400">page.route</code> tag</li>
                <li>• For API errors, use level <strong className="text-ink-400">error</strong></li>
                <li>• Widen the time window or try another service</li>
              </ul>
            </div>
          ) : previewEvents && previewEvents.length > 0 ? (
            <div className="mt-4 space-y-2">
              {previewEvents.map((ev) => {
                const selected = selectedEventId === ev.eventId;
                const meta = [
                  ev.tags?.service ? `service=${ev.tags.service}` : null,
                  ev.tags?.level ? `level=${ev.tags.level}` : null,
                  ev.tags?.route ? `route=${ev.tags.route}` : null,
                  ev.dateCreated ? new Date(ev.dateCreated).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : null
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <div
                    key={ev.eventId}
                    className={[
                      "rounded-xl border p-4 transition",
                      selected
                        ? "border-lime-400/40 bg-lime-400/[0.08]"
                        : "border-white/10 bg-black/25 hover:border-white/20"
                    ].join(" ")}
                  >
                    <p className="text-sm font-medium leading-snug text-white">{ev.title}</p>
                    <p className="mt-1.5 font-mono text-[10px] text-ink-500">{meta}</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => analyzeWithEvent(ev.eventId)}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-lime-400/15 px-3 py-1.5 text-[11px] font-medium text-lime-100 ring-1 ring-lime-400/25 transition hover:bg-lime-400/25 disabled:opacity-50"
                      >
                        Analyze this event
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-center text-xs text-ink-500">
              Click Preview after filling in the description & filters.
            </div>
          )}
        </section>
      </div>

      <section className="xl:sticky xl:top-8 xl:self-start">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Triage result</h2>
          {result ? (
            <span className="text-[11px] text-ink-500">Ready to copy to Jira / Slack</span>
          ) : null}
        </div>

        {loading ? <ResultSkeleton /> : result ? <ResultCard result={result} /> : <EmptyResult />}
      </section>
    </div>
  );
}
