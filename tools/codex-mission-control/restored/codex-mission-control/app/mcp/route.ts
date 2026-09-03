import { daemonFetch } from "@/lib/daemon-client";
import { parseGitHubReceiptPolicy } from "@/lib/github-decision-receipts";
import { handlePublicMissionControlMcpRequest } from "@/lib/public-mcp";
import type { StoredEvent } from "@/lib/schema";

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

async function handle(request: Request) {
  const response = await handlePublicMissionControlMcpRequest(request, {
    loadEvents: loadEventsFromDaemon,
    loadPolicy: parseGitHubReceiptPolicy,
    recordAccess: (event) => console.info(JSON.stringify(event)),
  });
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
