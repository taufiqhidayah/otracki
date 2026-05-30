import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"]
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  title: "StackSleuth — Triage",
  description: "Triage issue FE/BE/Infra dengan bukti dari log dan network."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <body
        className={[
          "h-full",
          "bg-ink-950 text-ink-100 antialiased",
          "selection:bg-lime-400/20",
          sans.className
        ].join(" ")}
      >
        <div className="pointer-events-none fixed inset-0 opacity-[0.55]">
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(132,204,22,0.18),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(70%_40%_at_70%_40%,rgba(245,158,11,0.10),transparent_60%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),transparent_25%,rgba(0,0,0,0.35))]" />
        </div>

        <div className="relative mx-auto min-h-full max-w-6xl px-6 py-10">
          <header className="flex flex-col gap-3 border-b border-white/10 pb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                StackSleuth <span className="text-ink-300">Triage</span>
              </h1>
              <div className="text-xs text-ink-300" style={{ fontFamily: mono.style.fontFamily }}>
                Endpoint: /api/triage • Preview: /api/preview
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-ink-200">
              Input gejala dari QA, lalu dapatkan routing FE/BE/Infra dengan ringkasan bukti yang bisa langsung
              dicopy ke tiket.
            </p>
          </header>

          <main className="pt-8">{children}</main>

          <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-ink-400">
            Tips: kalau hasil UNKNOWN, tambahkan status Network (HAR) atau trace/request id.
          </footer>
        </div>
      </body>
    </html>
  );
}
