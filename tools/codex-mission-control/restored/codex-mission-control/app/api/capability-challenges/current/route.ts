import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import { authenticateIngestProducer } from "@/lib/ingestion-credentials";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authentication = authenticateIngestProducer(
    process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    request.headers.get("x-mission-control-producer-id"),
    request.headers.get("authorization"),
  );
  if (!authentication.ok) return Response.json({ error: "Unauthorized Mission Control machine client." }, { status: 401 });
  const url = new URL(request.url);
  const supervisorId = url.searchParams.get("supervisor_id") ?? "";
  const chatId = url.searchParams.get("chat_id") ?? "";
  if (!supervisorId || supervisorId.length > 180 || !chatId || chatId.length > 180) {
    return Response.json({ error: "Exact supervisor_id and chat_id are required." }, { status: 400 });
  }
  const query = new URLSearchParams({ supervisor_id: supervisorId, chat_id: chatId });
  return relayJson(`/capability-challenges/current?${query}`, {
    headers: daemonMutationHeaders(authentication.producer),
  });
}
