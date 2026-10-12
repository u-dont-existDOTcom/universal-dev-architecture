import { canonicalJson, sha256 } from "../lib/canonical";
import {
  inBandBrowserDomReadbackMethod,
  inBandBrowserDomReadbackProducerId,
  inBandBrowserDomReadbackSummary,
} from "../lib/in-band-request-binding";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
function digest(value: string, name: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be SHA-256.`);
  return value;
}

async function main() {
  const worker = arg("--worker");
  const taskId = arg("--task-id");
  const requestId = arg("--request-id");
  const supervisorId = arg("--supervisor-id");
  const providerSessionId = arg("--provider-session-id");
  const conversationUrl = arg("--conversation-url");
  const promptSha256 = digest(arg("--prompt-sha256"), "prompt");
  const machineBlockSha256 = digest(arg("--machine-block-sha256"), "machine block");
  const browserTargetIdSha256 = digest(arg("--browser-target-id-sha256"), "browser target id");
  const sourceReaderApp = arg("--source-reader-app");
  const observedAt = arg("--observed-at");
  if (!/^https:\/\/chatgpt\.com\/c\/(?:WEB:)?[A-Za-z0-9_-]+$/.test(conversationUrl)) {
    throw new Error("conversation URL is invalid.");
  }
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("observed time is invalid.");
  if (!["GitHub", "Remote Desktop Commander"].includes(sourceReaderApp)) {
    throw new Error("source reader app is not approved.");
  }
  const refs = [
    `request:${requestId}`, `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`,
    "status:COMPLETE", `machine_block_sha256:${machineBlockSha256}`, `provider_prompt_sha256:${promptSha256}`,
    `conversation_url:${conversationUrl}`, "thread_surface:chatgpt", `source_reader_app:${sourceReaderApp}`,
    "source_reader_mode:READ_ONLY", `browser_target_id_sha256:${browserTargetIdSha256}`,
    "browser_capture_surface:EXISTING_BOUND_CONVERSATION_DOM",
    "assistant_message_selection:UNIQUE_CANONICAL_BLOCK", "semantic_authority:false",
    `readback_method:${inBandBrowserDomReadbackMethod}`,
  ];
  const identity = {
    worker, taskId, requestId, supervisorId, providerSessionId, conversationUrl, promptSha256,
    machineBlockSha256, browserTargetIdSha256, sourceReaderApp, observedAt,
  };
  const receiptId = `browser-dom-readback:${sha256(canonicalJson(identity)).slice(0, 32)}`;
  const envelope = {
    schema_version: 2 as const,
    event_id: `browser-dom-readback-evidence:${sha256(receiptId).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: observedAt,
    data: {
      type: "evidence_receipt_recorded" as const, worker, receipt_id: receiptId,
      producer_id: inBandBrowserDomReadbackProducerId, producer_role: "COLLECTOR" as const,
      evidence_class: "ARTIFACT" as const, independence: "INDEPENDENT" as const,
      freshness: "CURRENT" as const, exact_candidate_sha256: machineBlockSha256,
      summary: inBandBrowserDomReadbackSummary, refs, verified: true, changed_path_manifest: null,
    },
  };
  const response = await fetch(`${env("MISSION_CONTROL_DAEMON_URL").replace(/\/$/, "")}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("MISSION_CONTROL_INTERNAL_TOKEN")}`,
      "content-type": "application/json",
      "x-mission-control-producer-id": inBandBrowserDomReadbackProducerId,
      "x-mission-control-producer-kind": "COLLECTOR",
      "x-mission-control-worker-scopes": worker,
      "x-mission-control-task-scopes": taskId,
    },
    body: JSON.stringify(envelope), signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Mission Control browser-DOM readback append failed ${response.status}: ${text}`);
  process.stdout.write(`${JSON.stringify({ status: "RECORDED", receiptId, eventId: envelope.event_id })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
