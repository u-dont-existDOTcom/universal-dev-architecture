import { ensureDemoData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const store = ensureDemoData();
  const encoder = new TextEncoder();
  let cursor = store.latestEventId();
  let interval: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ cursor })}\n\n`));
      interval = setInterval(() => {
        const events = store.eventsAfter(cursor);
        for (const event of events) {
          cursor = event.id;
          controller.enqueue(encoder.encode(`id: ${event.id}\nevent: mission-control-event\ndata: ${JSON.stringify(event)}\n\n`));
        }
      }, 750);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keepalive\n\n")), 15_000);
      request.signal.addEventListener("abort", () => {
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        controller.close();
      });
    },
    cancel() {
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
