import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";

export async function POST(request: Request) {
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok) return Response.json({ error: "Unauthorized Mission Control machine client." }, { status: 401 });
  return relayJson("/mcp", {
    method: "POST",
    headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
