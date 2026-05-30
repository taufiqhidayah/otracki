import type {
  BeLogEntry,
  DataProvider,
  EvidenceItem,
  EnvironmentName,
  FeLogEntry,
  InputQuality,
  NetworkRecord,
  TriageOwner,
  TriageContextInput,
  TriageRequest,
  TriageResult
} from "./types.js";

const isoNow = () => new Date().toISOString();

const findFirstError = (logs: Array<{ level: string; message: string }>) =>
  logs.find((l) => l.level === "error" || l.level === "warn");

const hasFeExceptionSignal = (feLogs: FeLogEntry[]) => {
  if (feLogs.some((l) => l.level === "error")) return true;
  const joined = feLogs.map((l) => l.message).join("\n").toLowerCase();
  return (
    joined.includes("typeerror") ||
    joined.includes("cannot read properties") ||
    joined.includes("null") ||
    joined.includes("undefined")
  );
};

const hasBeErrorSignal = (beLogs: BeLogEntry[]) => beLogs.some((l) => l.level === "error");

const normalizeIssue = (issue: string) => issue.trim().replace(/\s+/g, " ");

const getInputQuality = (context: TriageContextInput, issue: string): InputQuality => {
  let score = 0;
  if (context.debugId) score += 2;
  if (typeof context.timeWindowMinutes === "number") score += 1;
  if (context.route) score += 1;
  if (context.userHint) score += 1;

  if (score >= 2) return "good";
  if (score === 1) return "ok";

  const normalizedIssue = issue.toLowerCase();
  const hasStrongKeywords =
    normalizedIssue.includes("500") ||
    normalizedIssue.includes("timeout") ||
    normalizedIssue.includes("cors") ||
    normalizedIssue.includes("401") ||
    normalizedIssue.includes("403") ||
    normalizedIssue.includes("422");

  return hasStrongKeywords ? "ok" : "poor";
};

const downgradeConfidence = (confidence: "low" | "medium" | "high", quality: InputQuality) => {
  if (quality !== "poor") return confidence;
  if (confidence === "high") return "medium";
  if (confidence === "medium") return "low";
  return "low";
};

export class TriageAnalyzer {
  constructor(private readonly provider: DataProvider) {}

  async analyze(input: TriageRequest, meta: { requestId: string }): Promise<TriageResult> {
    const issue = normalizeIssue(input.issue);
    const environment: EnvironmentName | undefined = input.environment;
    const context: TriageContextInput = {
      ...(input.context?.route ? { route: input.context.route } : {}),
      ...(input.context?.debugId ? { debugId: input.context.debugId } : {}),
      ...(input.context?.userHint ? { userHint: input.context.userHint } : {}),
      ...(typeof input.context?.timeWindowMinutes === "number"
        ? { timeWindowMinutes: input.context.timeWindowMinutes }
        : {})
    };
    const hasContext =
      Boolean(context.route) ||
      Boolean(context.debugId) ||
      Boolean(context.userHint) ||
      typeof context.timeWindowMinutes === "number";

    const providerInputBase = {
      issue,
      ...(environment ? { environment } : {}),
      ...(hasContext ? { context } : {})
    };

    const inputQuality = getInputQuality(context, issue);

    const feLogs = await this.provider.getFeLogs(providerInputBase);
    const beLogs = await this.provider.getBeLogs(providerInputBase);
    const network = await this.provider.getNetworkRecord(providerInputBase);

    const evidence: EvidenceItem[] = [];

    const fePicked = findFirstError(feLogs) ?? feLogs[0];
    if (fePicked) {
      const detail = fePicked.level === "error" ? feLogs.find((l) => l.message === fePicked.message)?.stack : undefined;
      evidence.push({
        source: "FE_LOG",
        summary: fePicked.message,
        ...(detail ? { detail } : {})
      });
    }

    const bePicked = findFirstError(beLogs) ?? beLogs[0];
    if (bePicked) {
      evidence.push({
        source: "BE_LOG",
        summary: bePicked.message
      });
    }

    if (network) {
      const detail = [
        network.requestBodyRedacted ? `request=${network.requestBodyRedacted}` : undefined,
        network.responseBody ? `response=${network.responseBody}` : undefined
      ]
        .filter((v): v is string => Boolean(v))
        .join("\n");

      evidence.push({
        source: "NETWORK",
        summary: `${network.method} ${network.url} -> ${network.status || "NO_STATUS"}${network.error ? ` (${network.error})` : ""}`,
        ...(detail ? { detail } : {})
      });
    }

    const resolution = decideOwner({ issue, feLogs, beLogs, network });
    const finalConfidence =
      resolution.owner === "UNKNOWN" ? "low" : downgradeConfidence(resolution.confidence, inputQuality);
    const finalNextStep =
      inputQuality === "poor"
        ? `${resolution.nextStep} Tambahkan Debug ID/Trace ID atau rentang waktu kejadian agar korelasi log lebih presisi.`
        : resolution.nextStep;

    return {
      owner: resolution.owner,
      confidence: finalConfidence,
      headline: resolution.headline,
      nextStep: finalNextStep,
      evidence,
      meta: {
        requestId: meta.requestId,
        analyzedAt: isoNow(),
        inputQuality,
        input: context
      }
    };
  }
}

const decideOwner = (input: {
  issue: string;
  feLogs: FeLogEntry[];
  beLogs: BeLogEntry[];
  network: NetworkRecord | null;
}): { owner: TriageOwner; confidence: "low" | "medium" | "high"; headline: string; nextStep: string } => {
  const { issue, feLogs, beLogs, network } = input;
  const feSignal = hasFeExceptionSignal(feLogs);
  const beSignal = hasBeErrorSignal(beLogs);

  if (network?.status === 200 && feSignal) {
    return {
      owner: "FE",
      confidence: "high",
      headline: `Issue di FE — ada error runtime/validation saat submit. BE sukses (200).`,
      nextStep: `Hubungi FE team. Sertakan error headline dan payload yang relevan (redact PII).`
    };
  }

  if (network?.status === 0 && network.error) {
    return {
      owner: "INFRA",
      confidence: "high",
      headline: `Issue jaringan/gateway — request tidak mendapat status (error: ${network.error}).`,
      nextStep: `Hubungi infra/gateway team. Sertakan timestamp dan environment; pastikan request bisa sampai service.`
    };
  }

  if (typeof network?.status === "number" && network.status >= 500) {
    return {
      owner: beSignal ? "BE" : "INFRA",
      confidence: beSignal ? "high" : "medium",
      headline: beSignal
        ? `Issue di BE — server mengembalikan ${network.status}.`
        : `Kemungkinan issue infra/BE — server mengembalikan ${network.status} tapi log BE tidak jelas.`,
      nextStep: beSignal
        ? `Hubungi BE team. Sertakan endpoint, status, dan ringkasan error log.`
        : `Mulai dari infra/gateway. Kalau ada request-id, korelasikan ke log BE.`
    };
  }

  if (typeof network?.status === "number" && network.status >= 400 && network.status < 500) {
    return {
      owner: "FE",
      confidence: "medium",
      headline: `Kemungkinan issue payload/kontrak — server mengembalikan ${network.status}.`,
      nextStep: `Cek payload yang dikirim FE (field wajib, nullish/empty). Kalau error message menyebut validasi, arahkan ke FE dulu.`
    };
  }

  if (feSignal && !network) {
    return {
      owner: "FE",
      confidence: "medium",
      headline: `Issue di FE — ada sinyal error, tapi tidak ada network record yang terdeteksi.`,
      nextStep: `Cek apakah klik memicu request (DevTools Network). Kalau tidak ada request, fokus ke handler/validation FE.`
    };
  }

  if (beSignal) {
    return {
      owner: "BE",
      confidence: "medium",
      headline: `Issue di BE — ada sinyal error di log backend.`,
      nextStep: `Hubungi BE team dan sertakan ringkasan log serta waktu kejadian.`
    };
  }

  return {
    owner: "UNKNOWN",
    confidence: "low",
    headline: `Belum cukup bukti untuk routing otomatis dari input: "${issue}".`,
    nextStep: `Sertakan status network (HAR) atau trace/request id agar bisa dikorelasikan.`
  };
};
