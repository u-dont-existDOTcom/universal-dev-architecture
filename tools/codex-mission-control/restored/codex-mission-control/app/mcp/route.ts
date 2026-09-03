import { sha256 } from "@/lib/canonical";
import { daemonFetch, daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { parseGitHubReceiptPolicy, providerSessionMcpSummary } from "@/lib/github-decision-receipts";
import { handlePublicMissionControlMcpRequest, type PublicMcpAccessEvent } from "@/lib/public-mcp";
import type { AppendEnvelope, StoredEvent } from "@/lib/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-protocol-version, mcp-session-id",
  "cache-control": "no-store, max-age=0",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
const publicMcpAccessCollector = { id: "collector:public-mcp-access", kind: "COLLECTOR" as const, workerScopes: ["*"], taskScopes: ["*"] };

async function handle(request: Request) {
  const response = await handlePublicMissionControlMcpRequest(request, {
    loadEvents: loadEventsFromDaemon,
    loadPolicy: parseGitHubReceiptPolicy,
    recordAccess: recordPublicMcpAccess,
  });
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function recordPublicMcpAccess(event: PublicMcpAccessEvent) {
  console.info(JSON.stringify(event));
  if (event.tool !== "get_supervisory_request_binding" || event.status !== "OK") return;
  if (!event.request_id || !event.supervisor_id || !event.provider_session_id || !event.worker_id) {
    throw new Error("Successful request-binding access telemetry is missing its exact session binding.");
  }
  const receiptId = `public-mcp-binding:${sha256(`${event.request_id}:${event.supervisor_id}:${event.provider_session_id}:${event.occurred_at}`).slice(0, 32)}`;
  const envelope: AppendEnvelope = {
    schema_version: 2,
    event_id: `evidence:${sha256(`${publicMcpAccessCollector.id}:${receiptId}`).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: event.occurred_at,
    data: {
      type: "evidence_receipt_recorded",
      worker: event.worker_id,
      receipt_id: receiptId,
      producer_id: publicMcpAccessCollector.id,
      producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT",
      independence: "SAME_PROVENANCE",
      freshness: "CURRENT",
      exact_candidate_sha256: null,
      summary: providerSessionMcpSummary,
      refs: [
        `request:${event.request_id}`,
        `supervisor:${event.supervisor_id}`,
        `provider_session:${event.provider_session_id}`,
        "tool:get_supervisory_request_binding",
        "status:OK",
        `observed_at:${event.occurred_at}`,
        "server_observed:true",
        "semantic_authority:false",
      ],
      verified: true,
      changed_path_manifest: null,
    },
  };
  const response = await relayJson("/events", {
    method: "POST",
    headers: daemonMutationHeaders(publicMcpAccessCollector, { "content-type": "application/json" }),
    body: JSON.stringify(envelope),
  });
  if (!response.ok) throw new Error(`Mission Control rejected public MCP access telemetry with HTTP ${response.status}.`);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

async function loadEventsFromDaemon(): Promise<StoredEvent[]> {
  const response = await daemonFetch("/events");
  if (!response.ok) throw new Error(`Mission Control daemon returned HTTP ${response.status}.`);
  const body = await response.json() as { events?: unknown };
  if (!Array.isArray(body.events)) throw new Error("Mission Control daemon returned an invalid event projection.");
  return body.events as StoredEvent[];
}
