import { NextResponse } from "next/server";

type EnvironmentName = "local" | "dev" | "staging" | "prod";

interface TriageContextInput {
  route?: string;
  debugId?: string;
  userHint?: string;
  timeWindowMinutes?: number;
  service?: "fe" | "be" | "any";
  level?: "debug" | "info" | "warn" | "error" | "any";
}

interface TriageRequestBody {
  issue: string;
  environment?: EnvironmentName;
  context?: TriageContextInput;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<TriageRequestBody> | null;
  if (!body || typeof body.issue !== "string" || body.issue.trim().length === 0) {
    return NextResponse.json({ error: "Field 'issue' is required." }, { status: 400 });
  }

  const sdkBaseUrl = process.env.STACKSLEUTH_SDK_URL ?? "http://localhost:4000";

  const contextFromBody = body.context && typeof body.context === "object" ? body.context : undefined;
  const context: TriageContextInput | undefined = contextFromBody
    ? {
        ...(contextFromBody.route ? { route: contextFromBody.route } : {}),
        ...(contextFromBody.debugId ? { debugId: contextFromBody.debugId } : {}),
        ...(contextFromBody.userHint ? { userHint: contextFromBody.userHint } : {}),
        ...(typeof contextFromBody.timeWindowMinutes === "number" && Number.isFinite(contextFromBody.timeWindowMinutes)
          ? { timeWindowMinutes: contextFromBody.timeWindowMinutes }
          : {}),
        ...(contextFromBody.service ? { service: contextFromBody.service } : {}),
        ...(contextFromBody.level ? { level: contextFromBody.level } : {})
      }
    : undefined;
  const hasContext =
    Boolean(context?.route) ||
    Boolean(context?.debugId) ||
    Boolean(context?.userHint) ||
    Boolean(context?.service) ||
    Boolean(context?.level) ||
    typeof context?.timeWindowMinutes === "number";

  try {
    const resp = await fetch(`${sdkBaseUrl}/triage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        issue: body.issue,
        ...(hasContext && context ? { context } : {})
      }),
      cache: "no-store"
    });

    const data = await resp.json().catch(() => null);
    const requestId = resp.headers.get("x-request-id");

    if (!resp.ok) {
      return NextResponse.json(
        {
          error: data?.error ?? "SDK error",
          requestId
        },
        { status: resp.status }
      );
    }

    return NextResponse.json(data, {
      status: 200,
      headers: requestId ? { "x-request-id": requestId } : undefined
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Network error"
      },
      { status: 502 }
    );
  }
}
