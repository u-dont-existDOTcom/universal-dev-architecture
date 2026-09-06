import {
  parseGitHubReceiptPolicy,
  publicCapabilityChallenge,
} from "@/lib/github-decision-receipts";

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
    const result = publicCapabilityChallenge(parseGitHubReceiptPolicy(), challenge);
    return result
      ? Response.json(result, { headers: responseHeaders })
      : notFound();
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
