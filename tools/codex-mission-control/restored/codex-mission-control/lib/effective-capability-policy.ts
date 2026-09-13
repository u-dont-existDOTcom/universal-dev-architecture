import { daemonFetch, daemonMutationHeaders } from "./daemon-client";
import { githubDecisionProducer, type GitHubReceiptPolicy } from "./github-decision-receipts";

/** Server-only internal policy transfer. Never forward this object as a public response. */
export async function loadEffectiveCapabilityPolicy(): Promise<GitHubReceiptPolicy | null> {
  const response=await daemonFetch("/internal/capability-policy",{headers:daemonMutationHeaders(githubDecisionProducer)});
  if(!response.ok) throw new Error("CAPABILITY_POLICY_UNAVAILABLE");
  return await response.json() as GitHubReceiptPolicy | null;
}
