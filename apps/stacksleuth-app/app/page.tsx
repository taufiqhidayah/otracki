"use client";

import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { ResultCard, type TriageResult } from "../components/ResultCard";

type InputQuality = "poor" | "ok" | "good";

const inputQualityBadge = (quality: InputQuality) => {
  if (quality === "good") return "bg-lime-400/15 text-lime-200 ring-lime-400/25";
  if (quality === "ok") return "bg-amber-400/15 text-amber-200 ring-amber-400/25";
  return "bg-white/10 text-ink-200 ring-white/15";
};

const computeInputQuality = (input: { issue: string; route: string; debugId: string; userHint: string; timeWindow: number }) => {
  let score = 0;
  if (input.debugId.trim().length > 0) score += 2;
  if (input.timeWindow > 0) score += 1;
  if (input.route.trim().length > 0) score += 1;
  if (input.userHint.trim().length > 0) score += 1;

  if (score >= 2) return "good" as const;
  if (score === 1) return "ok" as const;

  const normalizedIssue = input.issue.toLowerCase();
  const hasStrongKeywords =
    normalizedIssue.includes("500") ||
    normalizedIssue.includes("timeout") ||
    normalizedIssue.includes("cors") ||
    normalizedIssue.includes("401") ||
    normalizedIssue.includes("403") ||
    normalizedIssue.includes("422");

  return hasStrongKeywords ? ("ok" as const) : ("poor" as const);
};

export default function Page() {
  const [issue, setIssue] = useState("checkout button error, response apa?");
  const [route, setRoute] = useState("/checkout");
  const [timeWindowMinutes, setTimeWindowMinutes] = useState(5);
  const [debugId, setDebugId] = useState("");
  const [userHint, setUserHint] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);

  const issueOk = issue.trim().length > 0;
  const canSubmit = issueOk && !loading;

  const inputQuality = useMemo(
    () =>
      computeInputQuality({
        issue,
        route,
        debugId,
        userHint,
        timeWindow: timeWindowMinutes
      }),
    [issue, route, debugId, userHint, timeWindowMinutes]
  );

  const recommendation = useMemo(() => {
    if (debugId.trim().length > 0) return "Sudah oke. Debug ID biasanya cukup untuk korelasi yang presisi.";
    if (timeWindowMinutes > 0 && route.trim().length > 0) return "Cukup oke. Route + window membantu filter log yang relevan.";
    if (timeWindowMinutes > 0) return "Tambahkan route (/checkout) biar sistem gak salah ambil flow.";
    return "Isi minimal: time window atau Debug ID, biar gak nebak-nebak dari teks.";
  }, [debugId, route, timeWindowMinutes]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    const context = {
      ...(route.trim().length > 0 ? { route: route.trim() } : {}),
      ...(debugId.trim().length > 0 ? { debugId: debugId.trim() } : {}),
      ...(userHint.trim().length > 0 ? { userHint: userHint.trim() } : {}),
      ...(timeWindowMinutes > 0 ? { timeWindowMinutes } : {})
    };

    try {
      const resp = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issue,
          context
        })
      });

      const data = (await resp.json().catch(() => null)) as unknown;

      if (!resp.ok) {
        const msg = typeof (data as any)?.error === "string" ? (data as any).error : "Terjadi error saat triage.";
        setError(msg);
        setResult(null);
        return;
      }

      setResult(data as TriageResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi error jaringan.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-glow">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-white">Input QA</h2>
              <span
                className={[
                  "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1",
                  inputQualityBadge(inputQuality)
                ].join(" ")}
              >
                Kualitas konteks: <span className="font-semibold">{inputQuality}</span>
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-200">{recommendation}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-ink-200">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-5 grid gap-5">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-ink-200">Deskripsi singkat</label>
            </div>

            <textarea
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={5}
              placeholder={[
                "Template:",
                "- Apa yang kamu klik?",
                "- Apa yang terjadi?",
                "- Di page mana?",
                "",
                "Contoh: klik checkout, UI error, response apa?"
              ].join("\n")}
              className={[
                "w-full resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-ink-100",
                "outline-none transition focus:border-lime-400/40 focus:ring-2 focus:ring-lime-400/20"
              ].join(" ")}
            />
            <div className="text-[11px] text-ink-400">
              Untuk routing cepat: masukkan kata kunci seperti <span className="text-ink-200">500</span>,{" "}
              <span className="text-ink-200">timeout</span>, <span className="text-ink-200">CORS</span>,{" "}
              <span className="text-ink-200">401</span>.
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-white">Konteks (direkomendasikan)</div>
              <div className="text-[11px] text-ink-400">
                Semakin spesifik → semakin mudah cari flow di log/Sentry.
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-medium text-ink-200">Route/Page</label>
                <input
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="/checkout"
                  className={[
                    "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-ink-100",
                    "outline-none transition focus:border-lime-400/40 focus:ring-2 focus:ring-lime-400/20"
                  ].join(" ")}
                />
                <div className="text-[11px] text-ink-400">Contoh: /checkout, /login, /payment</div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-ink-200">Time window</label>
                <div className="flex flex-wrap gap-2">
                  {[5, 15, 60].map((m) => {
                    const selected = m === timeWindowMinutes;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTimeWindowMinutes(m)}
                        className={[
                          "rounded-full px-3 py-2 text-xs transition ring-1",
                          selected
                            ? "bg-amber-400/15 text-amber-200 ring-amber-400/25"
                            : "bg-white/5 text-ink-200 ring-white/10 hover:bg-white/10"
                        ].join(" ")}
                      >
                        {m} menit
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-ink-400">Default 5 menit terakhir.</div>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-medium text-ink-200">Debug ID / Trace ID</label>
                <input
                  value={debugId}
                  onChange={(e) => setDebugId(e.target.value)}
                  placeholder="Contoh: 9f1f0c1c-... (kalau ada)"
                  className={[
                    "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-ink-100",
                    "outline-none transition focus:border-lime-400/40 focus:ring-2 focus:ring-lime-400/20"
                  ].join(" ")}
                />
                <div className="text-[11px] text-ink-400">Kalau ada Debug ID, hasil biasanya paling presisi.</div>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-medium text-ink-200">User hint (opsional)</label>
              <input
                value={userHint}
                onChange={(e) => setUserHint(e.target.value)}
                placeholder="Contoh: qa_checkout_01 / userId 123"
                className={[
                  "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-ink-100",
                  "outline-none transition focus:border-lime-400/40 focus:ring-2 focus:ring-lime-400/20"
                ].join(" ")}
              />
              <div className="text-[11px] text-ink-400">Hindari email/token asli. Cukup identifier test.</div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-100">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-ink-400">
              Input wajib: <span className="text-ink-200">Deskripsi</span>. Rekomendasi:{" "}
              <span className="text-ink-200">Route</span> + <span className="text-ink-200">Time window</span> atau{" "}
              <span className="text-ink-200">Debug ID</span>.
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium",
                "bg-lime-400/15 text-lime-200 ring-1 ring-lime-400/25 transition",
                "hover:bg-lime-400/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
              ].join(" ")}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Analyze
            </button>
          </div>
        </form>
      </section>

      <section className="grid content-start gap-4 lg:sticky lg:top-10 lg:self-start">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-semibold text-white">Hasil</h2>
          <div className="text-xs text-ink-400">
            Endpoint: <span className="text-ink-200">/api/triage</span>
          </div>
        </div>

        {result ? (
          <ResultCard result={result} />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-ink-200 shadow-glow">
            Isi form, lalu klik Analyze.
          </div>
        )}
      </section>
    </div>
  );
}
