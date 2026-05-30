import type { BeLogEntry, DataProvider, EnvironmentName, TriageContextInput } from "./types.js";

export class BeLogCollector {
  constructor(private readonly provider: DataProvider) {}

  async collect(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<BeLogEntry[]> {
    return this.provider.getBeLogs(input);
  }
}
