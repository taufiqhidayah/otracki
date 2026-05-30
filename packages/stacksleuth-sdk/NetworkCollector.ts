import type { DataProvider, EnvironmentName, NetworkRecord, TriageContextInput } from "./types.js";

export class NetworkCollector {
  constructor(private readonly provider: DataProvider) {}

  async collect(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<NetworkRecord | null> {
    return this.provider.getNetworkRecord(input);
  }
}
