import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../lib/canonical";
import { discoverDirectWorkCloudDispatches, WORK_CLOUD_EXECUTION_RECEIPT_PREFIX } from "../lib/chatgpt-work-cloud-autodispatch";
import { executionDirectiveArtifactCanonicalJson } from "../lib/github-execution-directive";
import type { StoredEvent } from "../lib/schema";
import { WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, WORK_MODEL_ROUTING_POLICY_REF } from "../lib/work-execution-profile";

const receiptTarget = { repository: "u-dont-existDOTcom/universal-dev-architecture", stageIssueNumber: 61 };
const sourceChats = [{ supervisorId: "mc-project-manager", sourceChatTitle: "Mission Control Fleet Watch", sourceChatUrl: "chatgpt-conversation://abc-123", sourceChatBrowserUrl: "https://chatgpt.com/c/abc-123", chatgptProjectId: null }];
const now = "2026-09-21T01:45:00.000Z";

function profile() {
  return {
    model: "GPT_5_6_SOL" as const, effort: "MEDIUM" as const, routingTier: "SOL_MEDIUM" as const,
    routingTriggers: [], fastModeRequest: "DO_NOT_ENABLE_FAST" as const,
    assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
    policyRef: WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
    contractVersion: "TRUSTED_SETTER_V1" as const,
  };
}
function bounded(worker: string) {
  return {
    schema_version: 1 as const, task_id: `task:${worker}`, job_id: `job-${worker}`,
    execution_objective: "Apply the exact bounded change.", reasoning_summary: "Reasoning already completed in Chat.",
    strategy_id: `strategy:${worker}`, strategy_causal_hypothesis: "Bounded implementation advances the owner outcome.",
    predicted_outcome_change: "The exact requested behavior becomes mechanically available.", success_threshold: "Focused acceptance passes.",
    failure_threshold: "The target seam remains unavailable.", next_decision_changing_evidence: "Execution receipt and focused acceptance.",
    reviewed_evidence_boundary: "Current source-bound decision and exact repository head.",
    inputs: [{ type: "GITHUB", ref: "source-bound", sha256: "1".repeat(64) }],
    allowed_actions: ["edit bounded files"], allowed_paths: ["."], allowed_commands: ["focused tests"],
    forbidden_actions: ["scope expansion"], forbidden_paths: [], forbidden_decisions: ["methodology"],
    required_evidence: ["execution receipt"], required_tests_or_checks: ["focused acceptance"],
    stop_and_return_triggers: ["completion or blocker"], maximum_execution_cycles: 1,
    execution_capability: { type: "LOCAL_FILESYSTEM_COMMAND" as const }, workspace: "/tmp/workspace",
    output_schema: { status: "string" }, prompt: `EXACT BOUNDED DIRECTIVE FOR ${worker}`,
    deadline: "2026-09-22T00:00:00.000Z", work_execution_profile: profile(), execution_surface: "CHATGPT_WORK_CLOUD" as const,
  };
}
function event(sequence: number, worker: string, eventId: string, data: any): StoredEvent {
  return { eventId, missionId: "mission-control-live", worker, sequence, occurredAt: now, receivedAt: now,
    type: data.type, data, producerId: "fixture", producerKind: "SYSTEM", hash: "a".repeat(64), prevHash: null } as unknown as StoredEvent;
}
function workerEvents(worker: string, sequence = 1): StoredEvent[] {
  const b = bounded(worker);
  const sourceDirective = { id: `directive:${worker}`, revision: 1, taskId: b.task_id,
    sourceMessageId: `message:${worker}`, sourceBodySha256: "2".repeat(64) };
  const artifact = executionDirectiveArtifactCanonicalJson({ bounded: b, sourceDirective, requestedModel: "gpt-5.6-sol", reasoningEffort: "medium" });
  const receiptId = `receipt:${worker}`;
  return [
    event(sequence, worker, receiptId, {
      type: "github_decision_receipt_ingested", worker, request_id: `request:${worker}`, task_id: b.task_id,
      reasoning_lane: "EXTRA_HIGH_DIRECT", supervisor_id: "mc-project-manager", bounded_execution: b,
    }),
    event(sequence + 1, worker, `directive-event:${worker}`, {
      type: "execution_directive_recorded", worker, directive_id: sourceDirective.id, directive_revision: 1,
      task_id: b.task_id, directive_schema_version: 3, source_message_id: sourceDirective.sourceMessageId,
      source_body_sha256: sourceDirective.sourceBodySha256, directive_artifact_sha256: sha256(artifact),
      execution_surface: "CHATGPT_WORK_CLOUD", work_execution_profile: profile(), status: "ACTIVE",
      validated_decision_proof: { authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION", receipt_event_id: receiptId },
    }),
  ];
}

function discover(events: StoredEvent[]) {
  return discoverDirectWorkCloudDispatches({ events, sourceChats, receiptTarget, requestedAt: now,
    artifactPathFor: (dispatchId) => `/private/${sha256(dispatchId)}.directive.json` });
}

test("direct autodispatch derives one exact current-controller request and privacy-safe Work wrapper", () => {
  const candidates = discover(workerEvents("alpha"));
  assert.equal(candidates.length, 1);
  const candidate = candidates[0]!;
  assert.equal(candidate.recoveryState, "NEW");
  assert.equal(candidate.controllerRequest.requestedWorkTitle, "Work — Mission Control Fleet Watch");
  assert.equal(candidate.controllerRequest.sourceChatUrl, "chatgpt-conversation://abc-123");
  assert.equal(candidate.controllerRequest.binding.directiveArtifactSha256, sha256(candidate.directiveArtifactText));
  assert.match(candidate.workPrompt, /EXACT BOUNDED DIRECTIVE FOR alpha/);
  assert.match(candidate.workPrompt, new RegExp(WORK_CLOUD_EXECUTION_RECEIPT_PREFIX.trim()));
  assert.match(candidate.workPrompt, /Do not write the receipt to GitHub yourself/);
  assert.match(candidate.workPrompt, /deterministic Mission Control copier/);
  assert.doesNotMatch(candidate.workPrompt, /SOURCE_ATTESTED_NATIVE_WORK/);
  assert.doesNotMatch(candidate.workPrompt, /Create a native ChatGPT Work cloud task/);
});

test("directive artifact identity binds explicit native Work execution surface", () => {
  const b = bounded("surface-binding");
  const sourceDirective = { id: "directive:surface-binding", revision: 1, taskId: b.task_id,
    sourceMessageId: "message:surface-binding", sourceBodySha256: "2".repeat(64) };
  const work = executionDirectiveArtifactCanonicalJson({ bounded: b, sourceDirective, requestedModel: "gpt-5.6-sol", reasoningEffort: "medium" });
  const codex = executionDirectiveArtifactCanonicalJson({ bounded: { ...b, execution_surface: "CODEX" }, sourceDirective, requestedModel: "gpt-5.6-sol", reasoningEffort: "medium" });
  assert.notEqual(sha256(work), sha256(codex));
});

test("request-only no-intent recovery is eligible while durable handoff intent is not", () => {
  const base = workerEvents("alpha");
  const first = discover(base)[0]!;
  const request = event(3, "alpha", `work-cloud-dispatch-request:${first.dispatchId}`, {
    type: "chatgpt_work_cloud_dispatch_requested", worker: "alpha", dispatch_id: first.dispatchId,
    mode: "CREATE", requested_surface: "CHATGPT_WORK_CLOUD", directive_id: first.controllerRequest.binding.directiveId,
    directive_revision: 1, task_id: "task:alpha", requested_at: now,
  });
  assert.equal(discover([...base, request])[0]?.recoveryState, "REQUEST_ONLY_PROVEN_UNSENT");
  const intent = event(4, "alpha", `work-cloud-handoff-intent:${first.dispatchId}`, {
    type: "chatgpt_work_cloud_handoff_intent_recorded", worker: "alpha", dispatch_id: first.dispatchId,
    directive_id: first.controllerRequest.binding.directiveId, directive_revision: 1, task_id: "task:alpha",
    app_tool: "create_thread", intent_at: now, producer_id: "system:chatgpt-work-cloud-dispatch", source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY",
  });
  assert.equal(discover([...base, request, intent]).length, 0);
});

test("waiting native Work never starves another eligible worker", () => {
  const alpha = workerEvents("alpha", 1), beta = workerEvents("beta", 20);
  const prepared = discover(alpha)[0]!;
  const ready = event(4, "alpha", `work-cloud-result:${prepared.dispatchId}`, {
    type: "chatgpt_work_cloud_dispatch_recorded", worker: "alpha", dispatch_id: prepared.dispatchId,
    status: "READY", surface_verification: "VERIFIED_NATIVE_WORK", work_thread_id: "stable-work-alpha",
  });
  const candidates = discover([...alpha, ready, ...beta]);
  assert.deepEqual(candidates.map((item) => item.worker), ["beta"]);
});

test("Codex/default directives are not discovered by native Work autodispatch", () => {
  const events = workerEvents("alpha") as unknown as Array<any>;
  events[1].data.execution_surface = "CODEX";
  assert.equal(discover(events as StoredEvent[]).length, 0);
});
