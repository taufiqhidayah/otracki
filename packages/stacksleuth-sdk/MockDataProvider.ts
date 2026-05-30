import type { BeLogEntry, DataProvider, EnvironmentName, FeLogEntry, NetworkRecord, TriageContextInput } from "./types.js";

type ScenarioName = "checkout_fe_nullish" | "be_500" | "infra_timeout" | "unknown";

const nowIso = () => new Date().toISOString();

const inferScenario = (issue: string): ScenarioName => {
  const normalized = issue.trim().toLowerCase();

  if (normalized.includes("checkout") && (normalized.includes("button") || normalized.includes("klik"))) {
    return "checkout_fe_nullish";
  }

  if (normalized.includes("500") || normalized.includes("internal server error") || normalized.includes("server error")) {
    return "be_500";
  }

  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("etimedout")) {
    return "infra_timeout";
  }

  return "unknown";
};

const envLabel = (environment?: EnvironmentName) => (environment ? environment : "unknown");

export class MockDataProvider implements DataProvider {
  async getFeLogs(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<FeLogEntry[]> {
    const scenario = inferScenario(input.issue);
    const env = envLabel(input.environment);

    if (scenario === "checkout_fe_nullish") {
      return [
        {
          timestamp: nowIso(),
          level: "error",
          message: `TypeError: Cannot read properties of null (reading "couponCode") [env=${env}]`,
          stack:
            'TypeError: Cannot read properties of null (reading "couponCode")\n' +
            "    at submitCheckout (src/features/checkout/submit.ts:84:18)\n" +
            "    at onClick (src/features/checkout/CheckoutButton.tsx:41:9)\n" +
            "    at HTMLButtonElement.<anonymous> (react-dom.production.min.js:1:1)"
        },
        {
          timestamp: nowIso(),
          level: "warn",
          message: `Checkout payload builder menghasilkan field kosong sebelum submit [env=${env}]`
        }
      ];
    }

    if (scenario === "be_500") {
      return [
        {
          timestamp: nowIso(),
          level: "info",
          message: `Klik "Checkout" berhasil memicu request, menunggu response [env=${env}]`
        }
      ];
    }

    if (scenario === "infra_timeout") {
      return [
        {
          timestamp: nowIso(),
          level: "warn",
          message: `Request checkout belum mendapat response, kemungkinan jaringan lambat [env=${env}]`
        }
      ];
    }

    return [
      {
        timestamp: nowIso(),
        level: "info",
        message: `Tidak ada FE error yang terdeteksi dari input issue ini (mock) [env=${env}]`
      }
    ];
  }

  async getBeLogs(input: { issue: string; environment?: EnvironmentName; context?: TriageContextInput }): Promise<BeLogEntry[]> {
    const scenario = inferScenario(input.issue);
    const env = envLabel(input.environment);

    if (scenario === "checkout_fe_nullish") {
      return [
        {
          timestamp: nowIso(),
          level: "info",
          message: `POST /api/checkout -> 200 OK (mock) [env=${env}]`
        }
      ];
    }

    if (scenario === "be_500") {
      return [
        {
          timestamp: nowIso(),
          level: "error",
          message: `POST /api/checkout -> 500 Internal Server Error: database connection refused (mock) [env=${env}]`
        }
      ];
    }

    if (scenario === "infra_timeout") {
      return [
        {
          timestamp: nowIso(),
          level: "warn",
          message: `Tidak ada request masuk ke service checkout (kemungkinan timeout sebelum gateway) [env=${env}]`
        }
      ];
    }

    return [
      {
        timestamp: nowIso(),
        level: "info",
        message: `Tidak ada BE error yang terdeteksi dari input issue ini (mock) [env=${env}]`
      }
    ];
  }

  async getNetworkRecord(input: {
    issue: string;
    environment?: EnvironmentName;
    context?: TriageContextInput;
  }): Promise<NetworkRecord | null> {
    const scenario = inferScenario(input.issue);

    if (scenario === "checkout_fe_nullish") {
      return {
        timestamp: nowIso(),
        method: "POST",
        url: "/api/checkout",
        status: 200,
        requestBodyRedacted: JSON.stringify({
          cartId: "cart_123",
          couponCode: null
        }),
        responseBody: JSON.stringify({
          ok: true,
          orderId: "order_987"
        })
      };
    }

    if (scenario === "be_500") {
      return {
        timestamp: nowIso(),
        method: "POST",
        url: "/api/checkout",
        status: 500,
        requestBodyRedacted: JSON.stringify({
          cartId: "cart_456"
        }),
        responseBody: JSON.stringify({
          ok: false,
          error: "Internal Server Error"
        })
      };
    }

    if (scenario === "infra_timeout") {
      return {
        timestamp: nowIso(),
        method: "POST",
        url: "/api/checkout",
        status: 0,
        requestBodyRedacted: JSON.stringify({
          cartId: "cart_789"
        }),
        error: "ETIMEDOUT"
      };
    }

    return null;
  }

  async getNetworkRecords(input: {
    issue: string;
    environment?: EnvironmentName;
    context?: TriageContextInput;
  }): Promise<NetworkRecord[]> {
    const record = await this.getNetworkRecord(input);
    return record ? [record] : [];
  }
}
