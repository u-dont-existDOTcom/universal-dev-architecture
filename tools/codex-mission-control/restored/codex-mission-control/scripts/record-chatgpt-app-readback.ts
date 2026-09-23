import { canonicalJson, sha256 } from "../lib/canonical";
import { inBandAppReadbackProducerId, inBandAppReadbackSummary } from "../lib/in-band-request-binding";
function arg(name: string): string { const i = process.argv.indexOf(name); const v = i >= 0 ? process.argv[i + 1] : undefined; if (!v) throw new Error(`${name} is required.`); return v; }
function env(name: string): string { const v = process.env[name]?.trim(); if (!v) throw new Error(`${name} is required.`); return v; }
function digest(value: string, name: string): string { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be SHA-256`); return value; }
async function main() {
  const worker = arg("--worker"), taskId = arg("--task-id"), requestId = arg("--request-id"), supervisorId = arg("--supervisor-id"), providerSessionId = arg("--provider-session-id");
  const conversationUrl = arg("--conversation-url"), promptSha256 = digest(arg("--prompt-sha256"), "prompt"), machineBlockSha256 = digest(arg("--machine-block-sha256"), "machine block"), threadIdSha256 = digest(arg("--thread-id-sha256"), "thread id"), sourceReaderApp = arg("--source-reader-app"), observedAt = arg("--observed-at");
  if (!/^https:\/\/chatgpt\.com\/c\/(?:WEB:)?[A-Za-z0-9_-]+$/.test(conversationUrl)) throw new Error("conversation URL is invalid");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("observed time is invalid");
  if (!["GitHub", "Remote Desktop Commander"].includes(sourceReaderApp)) throw new Error("source reader app is not approved");
  const refs = [`request:${requestId}`, `supervisor:${supervisorId}`, `provider_session:${providerSessionId}`, "status:COMPLETE", `machine_block_sha256:${machineBlockSha256}`, `provider_prompt_sha256:${promptSha256}`, `conversation_url:${conversationUrl}`, "thread_surface:chatgpt", `source_reader_app:${sourceReaderApp}`, "source_reader_mode:READ_ONLY", `app_thread_id_sha256:${threadIdSha256}`, "semantic_authority:false", "readback_method:APP_OWNED_THREAD_EXACT_MACHINE_BLOCK"];
  const identity = { worker, taskId, requestId, supervisorId, providerSessionId, conversationUrl, promptSha256, machineBlockSha256, threadIdSha256, sourceReaderApp, observedAt };
  const receiptId = `app-readback:${sha256(canonicalJson(identity)).slice(0, 32)}`;
  const envelope = { schema_version: 2, event_id: `app-readback-evidence:${sha256(receiptId).slice(0, 32)}`, mission_id: "mission-control-live", occurred_at: observedAt, data: { type: "evidence_receipt_recorded", worker, receipt_id: receiptId, producer_id: inBandAppReadbackProducerId, producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT", exact_candidate_sha256: machineBlockSha256, summary: inBandAppReadbackSummary, refs, verified: true, changed_path_manifest: null } };
  const response = await fetch(`${env("MISSION_CONTROL_DAEMON_URL").replace(/\/$/, "")}/events`, { method: "POST", headers: { authorization: `Bearer ${env("MISSION_CONTROL_INTERNAL_TOKEN")}`, "content-type": "application/json", "x-mission-control-producer-id": inBandAppReadbackProducerId, "x-mission-control-producer-kind": "COLLECTOR", "x-mission-control-worker-scopes": worker, "x-mission-control-task-scopes": taskId }, body: JSON.stringify(envelope), signal: AbortSignal.timeout(30_000) });
  const text = await response.text(); if (!response.ok) throw new Error(`Mission Control app-readback append failed ${response.status}: ${text}`);
  process.stdout.write(`${JSON.stringify({ status: "RECORDED", receiptId, eventId: envelope.event_id })}\n`);
}
main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
