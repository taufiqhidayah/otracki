"use client";

import {
  CheckCircle2,
  Copy,
  Globe,
  Monitor,
  Server,
  ShieldAlert,
  Signal
} from "lucide-react";
import { useMemo, useState } from "react";

type TriageOwner = "FE" | "BE" | "INFRA" | "UNKNOWN";
type Confidence = "low" | "medium" | "high";
type InputQuality = "poor" | "ok" | "good";

export interface EvidenceItem {
  source: "FE_LOG" | "BE_LOG" | "NETWORK";
  summary: string;
  detail?: string;
}

export interface TriageResult {
  owner: TriageOwner;
  confidence: Confidence;
  headline: string;
  evidence: EvidenceItem[];
  nextStep: string;
  meta: {
    requestId: string;
    analyzedAt: string;
    inputQuality: InputQuality;
    input: {
      route?: string;
      debugId?: string;
      userHint?: string;
      timeWindowMinutes?: number;
      service?: string;
      level?: string;
    };
  };
}

const ownerConfig: Record<
  TriageOwner,
  { badge: string; panel: string; label: string; team: string; icon: typeof Monitor }
> = {
  FE: {
    badge: "bg-lime-400/15 text-lime-100 ring-lime-400/30",
    panel: "border-lime-400/25 bg-lime-400/[0.06]",
    label: "Frontend",
    team: "FE Team",
    icon: Monitor
  },
  BE: {
    badge: "bg-amber-400/15 text-amber-100 ring-amber-400/30",
    panel: "border-amber-400/25 bg-amber-400/[0.06]",
    label: "Backend",
    team: "BE Team",
    icon: Server
  },
  INFRA: {
    badge: "bg-sky-400/15 text-sky-100 ring-sky-400/30",
    panel: "border-sky-400/25 bg-sky-400/[0.06]",
    label: "Infra",
    team: "Infra / Gateway",
    icon: Signal
  },
  UNKNOWN: {
    badge: "bg-white/10 text-ink-200 ring-white/15",
    panel: "border-white/10 bg-white/[0.03]",
    label: "Uncertain",
    team: "Needs more info",
    icon: CheckCircle2
  }
};

const confidenceWidth: Record<Confidence, string> = {
  low: "w-1/3",
  medium: "w-2/3",
  high: "w-full"
};

const confidenceColor: Record<Confidence, string> = {
  low: "bg-ink-500",
  medium: "bg-amber-400",
  high: "bg-lime-400"
};

const evidenceConfig: Record<
  EvidenceItem["source"],
  { label: string; icon: typeof Monitor; accent: string }
> = {
  FE_LOG: { label: "Frontend Log", icon: Monitor, accent: "text-lime-300" },
  BE_LOG: { label: "Backend Log", icon: Server, accent: "text-amber-300" },
  NETWORK: { label: "Network", icon: Globe, accent: "text-sky-300" }
};

const inputQualityBadge = (quality: InputQuality) => {
  if (quality === "good") return "bg-lime-400/15 text-lime-200 ring-lime-400/25";
  if (quality === "ok") return "bg-amber-400/15 text-amber-200 ring-amber-400/25";
  return "bg-white/10 text-ink-200 ring-white/15";
};

export const ResultCard = ({ result }: { result: TriageResult }) => {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState<Record<EvidenceItem["source"], boolean>>({
    FE_LOG: true,
    BE_LOG: true,
    NETWORK: true
  });

  const config = ownerConfig[result.owner];
  const OwnerIcon = config.icon;

  const filteredEvidence = useMemo(
    () => result.evidence.filter((e) => visible[e.source]),
    [result.evidence, visible]
  );

  const textToCopy = useMemo(() => {
    const lines: string[] = [];
    lines.push("=== otracki Triage ===");
    lines.push(`Owner: ${result.owner} (${config.team})`);
    lines.push(`Confidence: ${result.confidence}`);
    lines.push(`Headline: ${result.headline}`);
    lines.push("");
    lines.push("Evidence:");
    for (const ev of filteredEvidence) {
      lines.push(`- [${ev.source}] ${ev.summary}`);
      if (ev.detail) lines.push(`  ${ev.detail.replace(/\n/g, "\n  ")}`);
    }
    lines.push("");
    lines.push(`Next step: ${result.nextStep}`);
    lines.push("");
    lines.push("--- Meta ---");
    lines.push(`RequestId: ${result.meta.requestId}`);
    lines.push(`AnalyzedAt: ${result.meta.analyzedAt}`);
    if (result.meta.input.route) lines.push(`Route: ${result.meta.input.route}`);
    if (typeof result.meta.input.timeWindowMinutes === "number") {
      lines.push(`TimeWindow: ${result.meta.input.timeWindowMinutes} min`);
    }
    if (result.meta.input.debugId) lines.push(`DebugId: ${result.meta.input.debugId}`);
    if (result.meta.input.service) lines.push(`Service: ${result.meta.input.service}`);
    if (result.meta.input.level) lines.push(`Level: ${result.meta.input.level}`);
    return lines.join("\n");
  }, [config.team, filteredEvidence, result]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className={`overflow-hidden rounded-2xl border shadow-glow ${config.panel}`}>
      <div className="border-b border-white/10 bg-black/20 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <OwnerIcon className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1",
                    config.badge
                  ].join(" ")}
                >
                  Escalate to {config.team}
                </span>
                <span
                  className={[
                    "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium ring-1",
                    inputQualityBadge(result.meta.inputQuality)
                  ].join(" ")}
                >
                  Input {result.meta.inputQuality}
                </span>
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Owner</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-white">{result.owner}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-100">{result.headline}</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-ink-400">
                  <span>Confidence</span>
                  <span className="font-medium capitalize text-ink-200">{result.confidence}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                  <div
                    className={`h-full rounded-full transition-all ${confidenceWidth[result.confidence]} ${confidenceColor[result.confidence]}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCopy}
            className={[
              "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
              copied
                ? "bg-lime-400/20 text-lime-100 ring-1 ring-lime-400/30"
                : "bg-white text-ink-950 hover:bg-ink-100 active:translate-y-px"
            ].join(" ")}
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied!" : "Copy for ticket"}
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Next step</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-100">{result.nextStep}</p>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">Evidence ({filteredEvidence.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {(["FE_LOG", "BE_LOG", "NETWORK"] as const).map((src) => {
                const selected = visible[src];
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setVisible((v) => ({ ...v, [src]: !v[src] }))}
                    className={[
                      "rounded-full px-2.5 py-1 text-[10px] font-medium transition ring-1",
                      selected
                        ? "bg-white/10 text-ink-100 ring-white/15"
                        : "bg-transparent text-ink-500 ring-white/10 line-through"
                    ].join(" ")}
                  >
                    {src.replace("_", " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            {filteredEvidence.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-black/10 px-4 py-6 text-center text-sm text-ink-400">
                No evidence detected for this filter.
              </div>
            ) : (
              filteredEvidence.map((ev, idx) => {
                const evConfig = evidenceConfig[ev.source];
                const EvIcon = evConfig.icon;
                const sameSourceIndex = filteredEvidence.slice(0, idx + 1).filter((item) => item.source === ev.source).length;
                const sameSourceTotal = filteredEvidence.filter((item) => item.source === ev.source).length;
                return (
                  <div key={`${ev.source}-${idx}`} className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center gap-2">
                      <EvIcon className={`h-4 w-4 ${evConfig.accent}`} />
                      <span className="text-xs font-semibold text-ink-100">
                        {evConfig.label}
                        {sameSourceTotal > 1 ? (
                          <span className="ml-1.5 font-normal text-ink-400">
                            ({sameSourceIndex}/{sameSourceTotal})
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-200">{ev.summary}</p>
                    {ev.detail ? (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink-300">
                        {ev.detail}
                      </pre>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {result.meta.input.route ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-ink-400">
              route <span className="font-mono text-ink-200">{result.meta.input.route}</span>
            </span>
          ) : null}
          {typeof result.meta.input.timeWindowMinutes === "number" ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-ink-400">
              window <span className="text-ink-200">{result.meta.input.timeWindowMinutes}m</span>
            </span>
          ) : null}
          {result.meta.input.service ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-ink-400">
              service <span className="text-ink-200">{result.meta.input.service}</span>
            </span>
          ) : null}
          {result.meta.input.level ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-ink-400">
              level <span className="text-ink-200">{result.meta.input.level}</span>
            </span>
          ) : null}
          {result.meta.input.debugId ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-ink-400">
              debugId <span className="font-mono text-ink-200">{result.meta.input.debugId.slice(0, 8)}…</span>
            </span>
          ) : null}
        </div>

        <p className="font-mono text-[10px] text-ink-500">
          {result.meta.requestId} · {new Date(result.meta.analyzedAt).toLocaleString("en-US")}
        </p>
      </div>
    </section>
  );
};

export const ResultSkeleton = () => (
  <div className="animate-pulse space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
    <div className="flex gap-4">
      <div className="h-12 w-12 rounded-2xl bg-white/10" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded bg-white/10" />
        <div className="h-6 w-16 rounded bg-white/10" />
        <div className="h-4 w-full rounded bg-white/10" />
      </div>
    </div>
    <div className="h-20 rounded-xl bg-white/5" />
    <div className="h-24 rounded-xl bg-white/5" />
  </div>
);

export const EmptyResult = () => (
  <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
      <ShieldAlert className="h-5 w-5 text-ink-400" />
    </div>
    <h3 className="mt-4 text-sm font-medium text-white">No results yet</h3>
    <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
      Describe the bug, pick a route & level matching Sentry tags, then click{" "}
      <span className="text-ink-200">Preview</span> or <span className="text-ink-200">Analyze</span>.
    </p>
  </div>
);
