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

const isPlaceholderLog = (message: string) =>
  message.startsWith("No FE events found") || message.startsWith("No BE events found");

const networkSummary = (network: NetworkRecord) =>
  `${network.method} ${network.url} -> ${network.status || "NO_STATUS"}${network.error ? ` (${network.error})` : ""}`;

const networkDetail = (network: NetworkRecord) =>
  [
    network.requestBodyRedacted ? `request=${network.requestBodyRedacted}` : undefined,
    network.responseBody ? `response=${network.responseBody}` : undefined
  ]
    .filter((v): v is string => Boolean(v))
    .join("\n");

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
        : {}),
      ...(input.context?.service ? { service: input.context.service } : {}),
      ...(input.context?.level ? { level: input.context.level } : {})
    };
    const hasContext =
      Boolean(context.route) ||
      Boolean(context.debugId) ||
      Boolean(context.userHint) ||
      Boolean(context.service) ||
      Boolean(context.level) ||
      typeof context.timeWindowMinutes === "number";

    const providerInputBase = {
      issue,
      ...(environment ? { environment } : {}),
      ...(hasContext ? { context } : {})
    };

    const inputQuality = getInputQuality(context, issue);

    const feLogs = await this.provider.getFeLogs(providerInputBase);
    const beLogs = await this.provider.getBeLogs(providerInputBase);
    const networkRecords = await this.provider.getNetworkRecords(providerInputBase);
    const network = networkRecords[0] ?? null;

    const evidence: EvidenceItem[] = [];

    const feEntries = feLogs.filter((log) => !isPlaceholderLog(log.message));
    if (feEntries.length === 0 && feLogs[0]) {
      evidence.push({ source: "FE_LOG", summary: feLogs[0].message });
    } else {
      for (const log of feEntries) {
        evidence.push({
          source: "FE_LOG",
          summary: log.message,
          ...(log.stack ? { detail: log.stack } : {})
        });
      }
    }

    const beEntries = beLogs.filter((log) => !isPlaceholderLog(log.message));
    if (beEntries.length === 0 && beLogs[0]) {
      evidence.push({ source: "BE_LOG", summary: beLogs[0].message });
    } else {
      for (const log of beEntries) {
        evidence.push({ source: "BE_LOG", summary: log.message });
      }
    }

    for (const record of networkRecords) {
      const detail = networkDetail(record);
      evidence.push({
        source: "NETWORK",
        summary: networkSummary(record),
        ...(detail ? { detail } : {})
      });
    }

    const resolution = decideOwner({ issue, feLogs, beLogs, network: networkRecords.find((r) => r.status >= 400) ?? network });
    const finalConfidence =
      resolution.owner === "UNKNOWN" ? "low" : downgradeConfidence(resolution.confidence, inputQuality);
    const finalNextStep =
      inputQuality === "poor"
        ? `${resolution.nextStep} Add a specific event from preview or widen the time window for better log correlation.`
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
      headline: `FE issue — runtime/validation error on submit. BE returned 200.`,
      nextStep: `Escalate to the FE team. Include the error headline and relevant payload (redact PII).`
    };
  }

  if (network?.status === 0 && network.error) {
    return {
      owner: "INFRA",
      confidence: "high",
      headline: `Network/gateway issue — request got no status (error: ${network.error}).`,
      nextStep: `Escalate to infra/gateway. Include timestamp and environment; confirm the request reaches the service.`
    };
  }

  if (typeof network?.status === "number" && network.status >= 500) {
    return {
      owner: beSignal ? "BE" : "INFRA",
      confidence: beSignal ? "high" : "medium",
      headline: beSignal
        ? `BE issue — server returned ${network.status}.`
        : `Likely infra/BE issue — server returned ${network.status} but BE logs are unclear.`,
      nextStep: beSignal
        ? `Escalate to the BE team. Include endpoint, status, and error log summary.`
        : `Start with infra/gateway. If you have a request-id, correlate to BE logs.`
    };
  }

  if (typeof network?.status === "number" && network.status >= 400 && network.status < 500) {
    return {
      owner: "FE",
      confidence: "medium",
      headline: `Likely payload/contract issue — server returned ${network.status}.`,
      nextStep: `Check the FE payload (required fields, nullish/empty). If the error mentions validation, route to FE first.`
    };
  }

  if (feSignal && !network) {
    return {
      owner: "FE",
      confidence: "medium",
      headline: `FE issue — error signal detected, but no network record found.`,
      nextStep: `Check if the click triggers a request (DevTools Network). If none, focus on FE handler/validation.`
    };
  }

  if (beSignal) {
    return {
      owner: "BE",
      confidence: "medium",
      headline: `BE issue — error signal in backend logs.`,
      nextStep: `Escalate to the BE team with log summary and time of occurrence.`
    };
  }

  return {
    owner: "UNKNOWN",
    confidence: "low",
    headline: `Not enough evidence to auto-route from input: "${issue}".`,
    nextStep: `Include network status (HAR) or trace/request id for correlation.`
  };
};
