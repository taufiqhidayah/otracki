"use client";

import { CheckCircle2, Copy, ShieldAlert, Signal, TriangleAlert } from "lucide-react";
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
    };
  };
}

const ownerBadge = (owner: TriageOwner) => {
  if (owner === "FE") return "bg-lime-400/15 text-lime-200 ring-lime-400/25";
  if (owner === "BE") return "bg-amber-400/15 text-amber-200 ring-amber-400/25";
  if (owner === "INFRA") return "bg-sky-400/15 text-sky-200 ring-sky-400/25";
  return "bg-white/10 text-ink-200 ring-white/15";
};

const confidenceTone = (confidence: Confidence) => {
  if (confidence === "high") return "text-lime-200";
  if (confidence === "medium") return "text-amber-200";
  return "text-ink-300";
};

const inputQualityBadge = (quality: InputQuality) => {
  if (quality === "good") return "bg-lime-400/15 text-lime-200 ring-lime-400/25";
  if (quality === "ok") return "bg-amber-400/15 text-amber-200 ring-amber-400/25";
  return "bg-white/10 text-ink-200 ring-white/15";
};

const OwnerIcon = ({ owner }: { owner: TriageOwner }) => {
  if (owner === "FE") return <TriangleAlert className="h-4 w-4 text-lime-200" />;
  if (owner === "BE") return <ShieldAlert className="h-4 w-4 text-amber-200" />;
  if (owner === "INFRA") return <Signal className="h-4 w-4 text-sky-200" />;
  return <CheckCircle2 className="h-4 w-4 text-ink-300" />;
};

export const ResultCard = ({ result }: { result: TriageResult }) => {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState<Record<EvidenceItem["source"], boolean>>({
    FE_LOG: true,
    BE_LOG: true,
    NETWORK: true
  });

  const filteredEvidence = useMemo(
    () => result.evidence.filter((e) => visible[e.source]),
    [result.evidence, visible]
  );

  const textToCopy = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Owner: ${result.owner}`);
    lines.push(`Confidence: ${result.confidence}`);
    lines.push(`Headline: ${result.headline}`);
    lines.push("");
    lines.push("Evidence:");
    for (const ev of filteredEvidence) {
      lines.push(`- [${ev.source}] ${ev.summary}`);
      if (ev.detail) {
        lines.push(`  ${ev.detail.replace(/\n/g, "\n  ")}`);
      }
    }
    lines.push("");
    lines.push(`Next step: ${result.nextStep}`);
    lines.push(`RequestId: ${result.meta.requestId}`);
    lines.push(`AnalyzedAt: ${result.meta.analyzedAt}`);
    lines.push(`InputQuality: ${result.meta.inputQuality}`);
    if (result.meta.input.route) lines.push(`Route: ${result.meta.input.route}`);
    if (typeof result.meta.input.timeWindowMinutes === "number") lines.push(`TimeWindowMinutes: ${result.meta.input.timeWindowMinutes}`);
    if (result.meta.input.debugId) lines.push(`DebugId: ${result.meta.input.debugId}`);
    if (result.meta.input.userHint) lines.push(`UserHint: ${result.meta.input.userHint}`);
    return lines.join("\n");
  }, [filteredEvidence, result]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-white/10 bg-black/30 p-2">
            <OwnerIcon owner={result.owner} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1",
                  ownerBadge(result.owner)
                ].join(" ")}
              >
                Owner: <span className="font-semibold">{result.owner}</span>
              </span>
              <span
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1",
                  inputQualityBadge(result.meta.inputQuality)
                ].join(" ")}
              >
                Input: <span className="font-semibold">{result.meta.inputQuality}</span>
              </span>
              <span className={["text-xs", confidenceTone(result.confidence)].join(" ")}>
                Confidence: <span className="font-medium">{result.confidence}</span>
              </span>
            </div>
            <h2 className="mt-3 text-sm font-medium leading-relaxed text-white">{result.headline}</h2>
            <p className="mt-2 text-xs leading-relaxed text-ink-200">{result.nextStep}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink-400">
              {result.meta.input.route ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
                  route: <span className="text-ink-200">{result.meta.input.route}</span>
                </span>
              ) : null}
              {typeof result.meta.input.timeWindowMinutes === "number" ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
                  window: <span className="text-ink-200">{result.meta.input.timeWindowMinutes}m</span>
                </span>
              ) : null}
              {result.meta.input.debugId ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
                  debugId: <span className="text-ink-200">{result.meta.input.debugId}</span>
                </span>
              ) : null}
              {result.meta.input.userHint ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1">
                  user: <span className="text-ink-200">{result.meta.input.userHint}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className={[
            "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs",
            "text-ink-100 transition hover:bg-white/10 active:translate-y-px",
            "focus:outline-none focus:ring-2 focus:ring-lime-400/40"
          ].join(" ")}
        >
          <Copy className="h-4 w-4" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-300">Evidence</div>
          <div className="flex flex-wrap gap-2">
            {(["FE_LOG", "BE_LOG", "NETWORK"] as const).map((src) => {
              const selected = visible[src];
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setVisible((v) => ({ ...v, [src]: !v[src] }))}
                  className={[
                    "rounded-full px-3 py-1 text-[11px] transition ring-1",
                    selected
                      ? "bg-white/5 text-ink-100 ring-white/15 hover:bg-white/10"
                      : "bg-black/30 text-ink-400 ring-white/10 hover:bg-white/5"
                  ].join(" ")}
                >
                  {src}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3">
          {filteredEvidence.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-ink-300">
              Tidak ada evidence yang terdeteksi.
            </div>
          ) : (
            filteredEvidence.map((ev, idx) => (
              <div key={`${ev.source}-${idx}`} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-medium text-ink-100">{ev.source}</div>
                  <div className="text-[11px] text-ink-400">
                    {new Date(result.meta.analyzedAt).toLocaleString("id-ID")}
                  </div>
                </div>
                <div className="mt-2 text-xs leading-relaxed text-ink-200">{ev.summary}</div>
                {ev.detail ? (
                  <pre className="mt-3 max-h-44 overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-[11px] leading-relaxed text-ink-200">
                    {ev.detail}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-400">
        <div>
          requestId: <span className="text-ink-200">{result.meta.requestId}</span>
        </div>
        <div>
          analyzedAt: <span className="text-ink-200">{new Date(result.meta.analyzedAt).toISOString()}</span>
        </div>
      </div>
    </section>
  );
};
