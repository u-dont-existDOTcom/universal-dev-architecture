import { daemonMutationHeaders, relayJson } from "@/lib/daemon-client";
import {
  githubDecisionCandidateFromWebhook,
  githubDecisionProducer,
  verifyGitHubWebhookSignature,
} from "@/lib/github-decision-receipts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyGitHubWebhookSignature(
    process.env.MISSION_CONTROL_GITHUB_WEBHOOK_SECRET,
    rawBody,
    request.headers.get("x-hub-signature-256"),
  )) {
    return Response.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });
  }
  if (request.headers.get("x-github-event") !== "issue_comment") {
    return Response.json({ error: "Only GitHub issue_comment webhooks are accepted." }, { status: 422 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "GitHub webhook body is not valid JSON." }, { status: 400 });
  }
  try {
    const candidate = githubDecisionCandidateFromWebhook(payload, request.headers.get("x-github-delivery"));
    return relayJson("/github/decision-receipts", {
      method: "POST",
      headers: daemonMutationHeaders(githubDecisionProducer, { "content-type": "application/json" }),
      body: JSON.stringify(candidate),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid GitHub decision receipt." }, { status: 422 });
  }
}
