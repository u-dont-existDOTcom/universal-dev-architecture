import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";

export const dynamic = "force-dynamic";

const allowedGetOperations = new Set(["status", "ledger"]);
const allowedPostOperations = new Set([
  "admissions",
  "admissions/validate",
  "relay-target-transitions/begin",
  "relay-target-transitions/commit",
  "relay-target-transitions/abort",
  "boundaries",
  "target-bindings",
  "provider-rate-limits",
  "aborts",
  "outcomes",
  "relay-health",
]);

export async function GET(request: Request, context: { params: Promise<{ operation: string[] }> }) {
  const operation = (await context.params).operation.join("/");
  if (!allowedGetOperations.has(operation)) return Response.json({ error: "Not found." }, { status: 404 });
  const authentication = authenticate(request);
  if (!authentication.ok) return authentication.response;
  if (authentication.producer.kind !== "COLLECTOR") return forbiddenRelayResponse();
  const query = new URL(request.url).search;
  return relayJson(`/submission-authority/${operation}${query}`, {
    headers: daemonMutationHeaders(authentication.producer),
  });
}

export async function POST(request: Request, context: { params: Promise<{ operation: string[] }> }) {
  const operation = (await context.params).operation.join("/");
  if (!allowedPostOperations.has(operation)) return Response.json({ error: "Not found." }, { status: 404 });
  const authentication = authenticate(request);
  if (!authentication.ok) return authentication.response;
  if (authentication.producer.kind !== "COLLECTOR") return forbiddenRelayResponse();
  return relayJson(`/submission-authority/${operation}`, {
    method: "POST",
    headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
    body: await request.text(),
  });
}

function forbiddenRelayResponse() {
  return Response.json(
    { error: "Submission authority is restricted to authenticated relay collectors." },
    { status: 403 },
  );
}

function authenticate(request: Request) {
  const result = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (result.ok) return result;
  const unavailable = result.reason === "DISABLED" || result.reason === "MISCONFIGURED";
  return {
    ok: false as const,
    response: Response.json(
      { error: unavailable ? "Submission authority authentication is disabled or misconfigured." : "Unauthorized submission producer." },
      { status: unavailable ? 503 : 401 },
    ),
  };
}
