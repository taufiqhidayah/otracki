export type EnvironmentName = "local" | "dev" | "staging" | "prod";

export type TriageOwner = "FE" | "BE" | "INFRA" | "UNKNOWN";

export type InputQuality = "poor" | "ok" | "good";

export interface TriageContextInput {
  route?: string;
  debugId?: string;
  userHint?: string;
  timeWindowMinutes?: number;
  service?: "fe" | "be" | "any";
  level?: "debug" | "info" | "warn" | "error" | "any";
}

export interface TriageRequest {
  issue: string;
  environment?: EnvironmentName;
  timestamp?: string;
  context?: TriageContextInput;
}

export interface EvidenceItem {
  source: "FE_LOG" | "BE_LOG" | "NETWORK";
  summary: string;
  detail?: string;
}

export interface TriageResult {
  owner: TriageOwner;
  confidence: "low" | "medium" | "high";
  headline: string;
  evidence: EvidenceItem[];
  nextStep: string;
  meta: {
    requestId: string;
    analyzedAt: string;
    inputQuality: InputQuality;
    input: TriageContextInput;
  };
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface FeLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  stack?: string;
}

export interface BeLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
}

export interface NetworkRecord {
  timestamp: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  status: number;
  requestBodyRedacted?: string;
  responseBody?: string;
  error?: string;
}

export interface DataProvider {
  getFeLogs(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<FeLogEntry[]>;
  getBeLogs(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<BeLogEntry[]>;
  getNetworkRecord(input: {
    issue: string;
    environment?: EnvironmentName;
    context?: TriageContextInput;
  }): Promise<NetworkRecord | null>;
  getNetworkRecords(input: {
    issue: string;
    environment?: EnvironmentName;
    context?: TriageContextInput;
  }): Promise<NetworkRecord[]>;
}
