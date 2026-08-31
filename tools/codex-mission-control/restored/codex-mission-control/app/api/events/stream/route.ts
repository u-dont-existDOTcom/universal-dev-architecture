import { daemonFetch } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const upstream = await daemonFetch("/events/stream", {
      signal: request.signal,
      headers: { accept: "text/event-stream" },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("event: error\ndata: {\"error\":\"Mission Control daemon is unavailable.\"}\n\n", {
      status: 503,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }
}
