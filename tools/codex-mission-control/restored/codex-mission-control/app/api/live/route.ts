import { daemonFetch } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await daemonFetch("/live");
    if (!response.ok) return Response.json({ status: "unavailable", kind: "liveness" }, { status: 503 });
    const body = await response.json() as { status?: string; kind?: string };
    if (body.status !== "ok" || body.kind !== "liveness") {
      return Response.json({ status: "degraded", kind: "liveness" }, { status: 503 });
    }
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", kind: "liveness" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
