import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"]
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: "otracki — Triage",
  description: "Triage FE/BE/Infra issues with evidence from logs and network."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body
        className={[
          "h-full min-h-screen",
          "bg-ink-950 text-ink-100 antialiased",
          "selection:bg-lime-400/20",
          sans.className,
          mono.variable
        ].join(" ")}
      >
        <div className="pointer-events-none fixed inset-0 opacity-60">
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(132,204,22,0.16),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_100%_0%,rgba(245,158,11,0.08),transparent_55%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),transparent_30%,rgba(0,0,0,0.4))]" />
        </div>

        <div className="relative mx-auto min-h-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <header className="mb-8 border-b border-white/10 pb-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-lime-400/20 bg-lime-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-lime-200">
                  Internal QA Tool
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  otracki <span className="text-ink-400">Triage</span>
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-ink-300">
                  Describe the bug, preview Sentry events, then get routing to FE / BE / Infra with
                  ticket-ready evidence.
                </p>
              </div>

              <ol className="flex flex-wrap gap-2 text-[11px] text-ink-400">
                {[
                  { step: "1", label: "Describe" },
                  { step: "2", label: "Preview logs" },
                  { step: "3", label: "Analyze & copy" }
                ].map((item) => (
                  <li
                    key={item.step}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-ink-200">
                      {item.step}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ol>
            </div>
          </header>

          <main>{children}</main>

          <footer className="mt-10 border-t border-white/10 pt-6 text-xs leading-relaxed text-ink-500">
            <p>
              <span className="text-ink-400">Tip:</span> make sure route & level match Sentry tags (
              <code className="font-mono text-ink-300">page.route</code>,{" "}
              <code className="font-mono text-ink-300">level</code>). For API errors, use level{" "}
              <span className="text-ink-300">error</span>. Result UNKNOWN? widen the time window or pick a
              specific event from preview.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
