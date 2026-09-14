import { daemonFetch } from "@/lib/daemon-client";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ challenge: string }> },
) {
  const { challenge } = await context.params;
  if (!challenge || challenge.length > 180) return notFound();
  try {
    const response = await daemonFetch(`/capability-challenges/${encodeURIComponent(challenge)}`);
    if (response.status === 404) return notFound();
    if (!response.ok) throw new Error(`Capability challenge daemon returned HTTP ${response.status}.`);
    return Response.json(await response.json(), { headers: responseHeaders });
  } catch {
    return Response.json({ error: "Capability challenge service is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    });
  }
}

function notFound() {
  return Response.json({ error: "Capability challenge not found." }, {
    status: 404,
    headers: responseHeaders,
  });
}
