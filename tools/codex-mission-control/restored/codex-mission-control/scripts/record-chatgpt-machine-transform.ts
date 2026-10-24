import { canonicalJson, sha256 } from "../lib/canonical";
import { readFileSync } from "node:fs";
import { removeSingleDecisionWrapper, singleWrapperRemovalOperation } from "../lib/single-decision-wrapper";
import {
  inBandAppReadbackProducerId,
  inBandDigestRepairOperation,
  inBandMachineTransformSummary,
} from "../lib/in-band-request-binding";

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`${name} is required.`);
  return v;
}
function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is required.`);
  return v;
}
function digest(value: string, name: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${name} must be SHA-256`);
  return value;
}

async function main() {
  const worker = arg("--worker");
  const taskId = arg("--task-id");
  const requestId = arg("--request-id");
  const supervisorId = arg("--supervisor-id");
  const providerSessionId = arg("--provider-session-id");
  const sourceMachineBlockSha256 = digest(arg("--source-machine-block-sha256"), "source machine block");
  const transformedMachineBlockSha256 = digest(arg("--transformed-machine-block-sha256"), "transformed machine block");
  const decisionExactTextSha256 = digest(arg("--decision-exact-text-sha256"), "decision exact text");
  const operationIndex = process.argv.indexOf("--operation");
  const operation = operationIndex < 0 ? inBandDigestRepairOperation : arg("--operation");
  if (![inBandDigestRepairOperation, singleWrapperRemovalOperation].includes(operation)) throw new Error("unsupported machine transform operation");
  let wrapperRefs: string[] = [];
  if (operation === singleWrapperRemovalOperation) {
    const authorizationSha256 = digest(arg("--source-authorization-sha256"), "source authorization");
    const raw = readFileSync(0, "utf8");
    if (raw.length > 2_000_000) throw new Error("wrapper proof input too large");
    const input = JSON.parse(raw) as { sourceBlock?: unknown; transformedBlock?: unknown };
    if (typeof input.sourceBlock !== "string" || typeof input.transformedBlock !== "string") throw new Error("wrapper proof requires exact source and target bytes on stdin");
    const proof = removeSingleDecisionWrapper(input.sourceBlock);
    if (sha256(input.sourceBlock) !== sourceMachineBlockSha256 || sha256(input.transformedBlock) !== transformedMachineBlockSha256
      || proof.body !== input.transformedBlock) throw new Error("wrapper proof bytes do not match exact transform");
    const payload = JSON.parse(proof.body.slice("MISSION_CONTROL_CANONICAL_DECISION_V1\n".length));
    if (payload.request_id !== requestId || payload.supervisor_id !== supervisorId || payload.provider_session_id !== providerSessionId
      || payload.decision_block?.sha256 !== decisionExactTextSha256 || typeof payload.decision_block?.exact_text !== "string"
      || sha256(payload.decision_block.exact_text) !== decisionExactTextSha256) throw new Error("wrapper proof identity or decision digest mismatch");
    wrapperRefs = [`source_authorization_sha256:${authorizationSha256}`, `preserved_json_sha256:${proof.preservedJsonSha256}`];
  }
  const observedAt = arg("--observed-at");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("observed time is invalid");
  if (sourceMachineBlockSha256 === transformedMachineBlockSha256) throw new Error("machine transformation requires changed machine-block bytes");

  const refs = [
    `request:${requestId}`,
    `supervisor:${supervisorId}`,
    `provider_session:${providerSessionId}`,
    `source_machine_block_sha256:${sourceMachineBlockSha256}`,
    `transformed_machine_block_sha256:${transformedMachineBlockSha256}`,
    `operation:${operation}`,
    `decision_exact_text_sha256:${decisionExactTextSha256}`,
    "writer_mode:EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY",
    "reinterpretation_allowed:false",
    "semantic_authority:false",
    ...wrapperRefs,
  ];
  const identity = {
    worker, taskId, requestId, supervisorId, providerSessionId,
    sourceMachineBlockSha256, transformedMachineBlockSha256,
    decisionExactTextSha256, observedAt,
    ...(operation === singleWrapperRemovalOperation ? { operation, wrapperRefs } : {}),
  };
  const receiptId = `machine-transform:${sha256(canonicalJson(identity)).slice(0, 32)}`;
  const envelope = {
    schema_version: 2,
    event_id: `machine-transform-evidence:${sha256(receiptId).slice(0, 32)}`,
    mission_id: "mission-control-live",
    occurred_at: observedAt,
    data: {
      type: "evidence_receipt_recorded",
      worker,
      receipt_id: receiptId,
      producer_id: inBandAppReadbackProducerId,
      producer_role: "COLLECTOR",
      evidence_class: "ARTIFACT",
      independence: "INDEPENDENT",
      freshness: "CURRENT",
      exact_candidate_sha256: transformedMachineBlockSha256,
      summary: inBandMachineTransformSummary,
      refs,
      verified: true,
      changed_path_manifest: null,
    },
  };
  const response = await fetch(`${env("MISSION_CONTROL_DAEMON_URL").replace(/\/$/, "")}/events`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env("MISSION_CONTROL_INTERNAL_TOKEN")}`,
      "content-type": "application/json",
      "x-mission-control-producer-id": inBandAppReadbackProducerId,
      "x-mission-control-producer-kind": "COLLECTOR",
      "x-mission-control-worker-scopes": worker,
      "x-mission-control-task-scopes": taskId,
    },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Mission Control machine-transform append failed ${response.status}: ${text}`);
  process.stdout.write(`${JSON.stringify({ status: "RECORDED", receiptId, eventId: envelope.event_id })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
