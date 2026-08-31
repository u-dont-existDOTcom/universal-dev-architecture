import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";

export const dynamic = "force-dynamic";

export async function GET() {
  return relayJson("/events");
}

export async function POST(request: Request) {
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok) {
    const unavailable = authentication.reason === "DISABLED" || authentication.reason === "MISCONFIGURED";
    return Response.json(
      { error: unavailable ? "External event ingestion is disabled or misconfigured." : "Unauthorized event producer." },
      { status: unavailable ? 503 : 401 },
    );
  }
  return relayJson("/events", {
    method: "POST",
    headers: daemonMutationHeaders(authentication.producer, { "content-type": "application/json" }),
    body: await request.text(),
  });
}
