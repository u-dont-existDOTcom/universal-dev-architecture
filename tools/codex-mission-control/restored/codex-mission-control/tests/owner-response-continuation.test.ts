import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import {
  deriveOwnerResponseContinuation,
  validateOwnerResponseContinuation,
  type OwnerResponseContinuationIntent,
} from "../lib/owner-response-continuation";
import type { OwnerResponseContinuation } from "../lib/owner-response-continuation-schema";
import { decisionRouteStates, type ReasoningMessageStoredEvent } from "../lib/reasoning-message-state";
import {
  githubDecisionReceiptIngestedSchema,
  ownerOutcomeRecordedSchema,
  parseEventV2,
  reasoningMessageRecordedSchema,
  type MissionControlEventV2,
  type StoredEvent,
} from "../lib/schema";
import {
  continuationIntentForAdmission,
  evaluateSupervisionAdmission,
  parseSupervisionAdmissionInput,
  supervisoryCycleRoutePrefix,
} from "../lib/supervision-admission-runtime";

const worker = "worker-a";
const supervisorId = "supervisor-a";
const decisionRequestId = "decision-request:original";
const issuedAt = "2026-09-06T12:00:00.000Z";
const expiresAt = "2026-09-06T12:30:00.000Z";
const exactOwnerText = "Proceed within the existing scope.\r\nPreserve “exact OWNER bytes”  inside the response.";
const pmAssistantText = "PM ASSISTANT OUTPUT MUST NOT BE TRANSPORTED";
const workerProducer: AuthenticatedProducer = { id: "worker:worker-a", kind: "WORKER", workerScopes: [worker], taskScopes: ["task:continuation"] };

test("authoritative direct OWNER continuation preserves exact text and complete causal metadata", () => {
  const { events, request, owner, delivery, intent } = fixture();
  const continuation = deriveOwnerResponseContinuation(events, intent, issuedAt);
  assert.equal(decisionRouteStates(events)[0].status, "SUPERVISOR_RESOLUTION_REQUIRED");
  assert.equal(continuation.binding.path, "DIRECT");
  assert.equal(continuation.exactOwnerResponseText, exactOwnerText);
  assert.equal(continuation.binding.originating_supervisor_message.event_id, request.eventId);
  assert.equal(continuation.binding.owner_input.message_id, owner.data.message_id);
  assert.equal(continuation.binding.supervisor_delivery.message_id, delivery.data.message_id);
  assert.equal(continuation.binding.supervisor_id, supervisorId);
  assert.equal(continuation.binding.decision_request_id, decisionRequestId);
  assert.equal(continuation.binding.worker, worker);
  assert.deepEqual(continuation.binding.owner_outcome, intent.ownerOutcome);
  assert.deepEqual(continuation.binding.evidence_capsule, intent.evidenceCapsule);
  assert.equal(continuation.binding.issued_at, issuedAt);
  assert.equal(continuation.binding.expires_at, expiresAt);
  assert.equal(continuation.digest, sha256(canonicalJson(continuation.binding)));
  assert.equal(Object.hasOwn(continuation.binding, "sent_at_source"), false);
  assert.equal(canonicalJson(continuation.binding).includes(exactOwnerText), false);
  assert.deepEqual(validateOwnerResponseContinuation(events, intent, continuation, issuedAt), continuation);
});

test("authoritative PM-mediated continuation uses only the OWNER-authored supervisor delivery", () => {
  const { events, owner, delivery, intent } = fixture("PROJECT_MANAGER");
  const continuation = deriveOwnerResponseContinuation(events, intent);
  assert.equal(continuation.binding.path, "PROJECT_MANAGER");
  assert.equal(continuation.binding.owner_input.surface_role, "PROJECT_MANAGER");
  assert.equal(continuation.binding.owner_input.event_id, owner.eventId);
  assert.equal(continuation.binding.supervisor_delivery.event_id, delivery.eventId);
  assert.equal(continuation.binding.supervisor_delivery.parent_message_id, owner.data.message_id);
  assert.equal(continuation.binding.owner_input.body_sha256, continuation.binding.supervisor_delivery.body_sha256);
  assert.equal(continuation.exactOwnerResponseText, exactOwnerText);
  assert.equal(JSON.stringify(continuation).includes(pmAssistantText), false);
});

test("continuation rejects missing owner delivery, PM forward mismatch, and an already resolved route", () => {
  const direct = fixture();
  assert.throws(() => deriveOwnerResponseContinuation(direct.events.filter((event) => event !== direct.owner), direct.intent), /OWNER response/);
  const pm = fixture("PROJECT_MANAGER");
  assert.throws(() => deriveOwnerResponseContinuation(pm.events.filter((event) => event !== pm.delivery), pm.intent), /OWNER response/);
  pm.delivery.data.exact_visible_body = "altered OWNER forward";
  pm.delivery.data.body_sha256 = sha256(pm.delivery.data.exact_visible_body);
  assert.equal(decisionRouteStates(pm.events)[0].status, "INVALID_BINDING");
  assert.throws(() => deriveOwnerResponseContinuation(pm.events, pm.intent), /OWNER response/);
  direct.events.push(reasoning(9, "ASSISTANT", "SUPERVISOR", "Already resolved.", { parent_message_id: direct.owner.data.message_id }));
  assert.throws(() => deriveOwnerResponseContinuation(direct.events, direct.intent), /SUPERVISOR_RESOLUTION_REQUIRED/);
});

test("origin and supervisor OWNER delivery must both have the exact stable supervisor ID", () => {
  for (const message of ["request", "delivery"] as const) {
    for (const identity of [undefined, "wrong-supervisor"]) {
      const current = fixture("PROJECT_MANAGER");
      if (identity === undefined) delete current[message].data.stable_supervisor_id;
      else current[message].data.stable_supervisor_id = identity;
      assert.throws(() => deriveOwnerResponseContinuation(current.events, current.intent), /stable supervisor identity/);
    }
  }
  const pm = fixture("PROJECT_MANAGER");
  delete pm.owner.data.stable_supervisor_id;
  assert.doesNotThrow(() => deriveOwnerResponseContinuation(pm.events, pm.intent));
});

test("continuation rejects absent or altered exact supervisor-delivery OWNER bytes", () => {
  for (const exactText of [null, "", exactOwnerText.replace("\r\n", "\n"), "different owner text"]) {
    const current = fixture();
    current.delivery.data.exact_visible_body = exactText;
    assert.throws(() => deriveOwnerResponseContinuation(current.events, current.intent), /exact OWNER response text\/hash mismatch/);
  }
  const current = fixture();
  current.delivery.data.body_sha256 = "0".repeat(64);
  assert.throws(() => deriveOwnerResponseContinuation(current.events, current.intent), /exact OWNER response text\/hash mismatch/);
});

test("exact worker, decision request, origin role, and unambiguous message identity are required", () => {
  const current = fixture();
  for (const changes of [{ worker: "wrong-worker" }, { resumeDecisionRequestId: "decision-request:wrong" }]) {
    assert.throws(() => deriveOwnerResponseContinuation(current.events, { ...current.intent, ...changes }), /one exact worker\/decision request/);
  }
  for (const mutate of [
    (request: ReasoningMessageStoredEvent) => { request.worker = "wrong-worker"; },
    (request: ReasoningMessageStoredEvent) => { request.data.worker = "wrong-worker"; },
    (request: ReasoningMessageStoredEvent) => { request.data.author_role = "OWNER"; },
    (request: ReasoningMessageStoredEvent) => { request.data.surface_role = "PROJECT_MANAGER"; },
    (request: ReasoningMessageStoredEvent) => { request.data.parent_message_id = "message:other"; },
  ]) {
    const invalid = fixture();
    mutate(invalid.request);
    assert.throws(() => deriveOwnerResponseContinuation(invalid.events, invalid.intent), /one exact worker\/decision request/);
  }
  const duplicate = fixture();
  duplicate.events.push({ ...structuredClone(duplicate.delivery), eventId: "event:duplicate-owner", sequence: 8 });
  assert.throws(() => deriveOwnerResponseContinuation(duplicate.events, duplicate.intent), /message identity is ambiguous/);
});

test("current owner outcome uses the latest authoritative worker event and rejects every stale component", () => {
  for (const outcome of [{ id: "other-outcome" }, { epoch: 99 }, { sha256: "0".repeat(64) }]) {
    const current = fixture();
    assert.throws(() => deriveOwnerResponseContinuation(current.events, {
      ...current.intent, ownerOutcome: { ...current.intent.ownerOutcome, ...outcome },
    }), /stale against the current owner outcome/);
  }
  const current = fixture();
  const nextOutcome = { id: "owner-outcome:newer", epoch: 3, sha256: sha256("newer owner outcome") };
  current.events.unshift(outcomeEvent(10, nextOutcome));
  assert.throws(() => deriveOwnerResponseContinuation(current.events, current.intent), /stale against the current owner outcome/);
  const unrelated = outcomeEvent(11, { ...nextOutcome, id: "owner-outcome:unrelated" });
  unrelated.worker = "other-worker";
  if (unrelated.data.type === "owner_outcome_recorded") unrelated.data.worker = "other-worker";
  assert.doesNotThrow(() => deriveOwnerResponseContinuation([...current.events, unrelated], { ...current.intent, ownerOutcome: nextOutcome }));
  assert.throws(() => deriveOwnerResponseContinuation(current.events.filter((event) => event.data.type !== "owner_outcome_recorded"), current.intent), /current owner outcome/);
});

test("continuation identity is stable across pre-consumption windows, evidence and current outcome changes", () => {
  const current = fixture();
  const initial = deriveOwnerResponseContinuation(current.events, current.intent);
  const refreshedOutcome = { id: "owner-outcome:refreshed", epoch: 3, sha256: sha256("refreshed owner outcome") };
  const refreshed = {
    ...current.intent, issuedAt: "2026-09-06T13:00:00.000Z", expiresAt: "2026-09-06T13:30:00.000Z",
    evidenceCapsule: { id: "evidence:refreshed", sha256: sha256("refreshed evidence") }, ownerOutcome: refreshedOutcome,
  };
  current.events.push(outcomeEvent(10, refreshedOutcome));
  const retry = deriveOwnerResponseContinuation(current.events, refreshed);
  assert.equal(initial.binding.continuation_id, retry.binding.continuation_id);
  assert.notEqual(initial.digest, retry.digest);
  current.events.push(consumedReceipt(11, initial));
  assert.throws(() => deriveOwnerResponseContinuation(current.events, refreshed), /already been consumed/);
});

test("authoritative revalidation rejects changed exact text, digest, metadata, current evidence and expiry", () => {
  const current = fixture();
  const original = deriveOwnerResponseContinuation(current.events, current.intent);
  for (const mutate of [
    (value: OwnerResponseContinuation) => { value.exactOwnerResponseText = "worker injection"; },
    (value: OwnerResponseContinuation) => { value.digest = "0".repeat(64); },
    (value: OwnerResponseContinuation) => { value.binding.supervisor_delivery.message_id = "message:other"; },
  ]) {
    const altered = structuredClone(original);
    mutate(altered);
    assert.throws(() => validateOwnerResponseContinuation(current.events, current.intent, altered, issuedAt), /no longer matches authoritative/);
  }
  assert.throws(() => validateOwnerResponseContinuation(current.events, {
    ...current.intent, evidenceCapsule: { id: "evidence:changed", sha256: sha256("changed") },
  }, original, issuedAt), /no longer matches authoritative/);
  for (const now of ["2026-09-06T11:59:59.999Z", "2026-09-06T12:30:00.001Z", "invalid"]) {
    assert.throws(() => deriveOwnerResponseContinuation(current.events, current.intent, now), /Mission Control validity window/);
  }
});

test("worker admission permits continuation intent only and fails without separate server authority", () => {
  const input = admissionInput();
  assert.throws(() => evaluateSupervisionAdmission(worker, workerProducer, input, issuedAt), /separate authoritative server derivation/);
  for (const key of ["continuation", "continuationBinding", "continuationBindingSha256", "continuationOwnerResponseExactText"]) {
    assert.throws(() => parseSupervisionAdmissionInput({ ...input, [key]: "worker injection" }), /intent only/);
  }
  const injected = { ...input, request: { ...input.request, continuationBinding: { malicious: true } },
    factualPacket: { ...input.factualPacket, continuationOwnerResponseExactText: "worker injection", supervisoryCycle: {
      ...input.factualPacket.supervisoryCycle, continuationBinding: { malicious: true },
    } } };
  assert.equal(JSON.stringify(parseSupervisionAdmissionInput(injected)).includes("worker injection"), false);
  assert.equal(JSON.stringify(parseSupervisionAdmissionInput(injected)).includes("malicious"), false);
  assert.throws(() => evaluateSupervisionAdmission(worker, workerProducer, injected, issuedAt), /separate authoritative server derivation/);
});

test("server-derived continuation queues exact OWNER text and cannot authorize worker execution", () => {
  for (const ownerPath of ["DIRECT", "PROJECT_MANAGER"] as const) {
    const current = fixture(ownerPath);
    const input = admissionInput();
    const intent = continuationIntentForAdmission(worker, parseSupervisionAdmissionInput(input), issuedAt);
    assert.deepEqual(intent, current.intent);
    const continuation = deriveOwnerResponseContinuation(current.events, intent!);
    const result = evaluateSupervisionAdmission(worker, workerProducer, input, issuedAt, continuation);
    assert.equal(result.mayExecute, false);
    assert.equal(result.providerDeliveryState, "QUEUED_FOR_PROVIDER_RELAY");
    assert.ok(result.routeEnvelope?.data.type === "worker_message_recorded");
    const packet = JSON.parse(result.routeEnvelope.data.body.slice(supervisoryCycleRoutePrefix.length));
    assert.deepEqual(packet.continuationBinding, continuation.binding);
    assert.equal(packet.continuationBindingSha256, continuation.digest);
    assert.equal(packet.continuationOwnerResponseExactText, exactOwnerText);
    assert.equal(packet.queuedAt, continuation.binding.issued_at);
    assert.equal(packet.expiresAt, continuation.binding.expires_at);
    assert.equal(JSON.stringify(packet).includes(pmAssistantText), false);
    const ordinary = { ...input, resumeDecisionRequestId: undefined };
    delete ordinary.resumeDecisionRequestId;
    assert.throws(() => evaluateSupervisionAdmission(worker, workerProducer, ordinary, issuedAt, continuation), /separate authoritative server derivation/);
  }
});

test("separate server continuation must exactly match the admission intent and current cycle", () => {
  const current = fixture();
  const continuation = deriveOwnerResponseContinuation(current.events, current.intent);
  for (const mutate of [
    (input: ReturnType<typeof admissionInput>) => { input.resumeDecisionRequestId = "decision-request:other"; },
    (input: ReturnType<typeof admissionInput>) => { input.request.internalRoute.destinationChatId = "supervisor:other"; },
    (input: ReturnType<typeof admissionInput>) => { input.factualPacket.supervisoryCycle.ownerOutcome.epoch += 1; },
    (input: ReturnType<typeof admissionInput>) => { input.factualPacket.supervisoryCycle.evidenceCapsule.id = "evidence:other"; },
    (input: ReturnType<typeof admissionInput>) => { input.factualPacket.supervisoryCycle.expiresAt = "2026-09-06T13:00:00.000Z"; },
  ]) {
    const input = admissionInput();
    mutate(input);
    assert.throws(() => evaluateSupervisionAdmission(worker, workerProducer, input, issuedAt, continuation), /does not match admission intent/);
  }
  assert.throws(() => evaluateSupervisionAdmission(worker, workerProducer, admissionInput(), issuedAt, {
    ...continuation, exactOwnerResponseText: "worker injection",
  }), /does not match admission intent/);
});

test("historical reasoning parses without stable supervisor defaults and CLI dry-run preserves optional identity", () => {
  const historical = structuredClone(fixture().request.data);
  delete historical.stable_supervisor_id;
  const parsed = parseEventV2(historical);
  assert.equal(Object.hasOwn(parsed, "stable_supervisor_id"), false);
  assert.equal(canonicalJson(parsed), canonicalJson(historical));
  const directory = mkdtempSync(path.join(tmpdir(), "mc-continuation-cli-"));
  try {
    const bodyFile = path.join(directory, "owner.txt");
    writeFileSync(bodyFile, exactOwnerText, "utf8");
    const script = fileURLToPath(new URL("../scripts/record-reasoning-message.mjs", import.meta.url));
    const args = [script, "--dry-run", "--worker", worker, "--producer-id", "owner:test", "--expected-producer-kind", "OWNER_AUTHORITY",
      "--message-id", "message:owner-cli", "--thread-id", "thread:supervisor", "--surface-role", "SUPERVISOR", "--author-role", "OWNER",
      "--acquisition-method", "OWNER_ATTESTED", "--provenance-status", "OWNER_ATTESTED", "--body-file", bodyFile,
      "--received-at-mission-control", issuedAt, "--decision-request-id", decisionRequestId];
    const run = (extra: string[]) => JSON.parse(execFileSync(process.execPath, [...args, ...extra], {
      encoding: "utf8", env: { ...process.env, MISSION_CONTROL_INGEST_TOKEN: "" },
    }));
    const without = run([]);
    const withIdentity = run(["--stable-supervisor-id", supervisorId]);
    assert.equal(without.status, "REASONING_MESSAGE_VALID_DRY_RUN_NOT_INGESTED");
    assert.equal(Object.hasOwn(without.envelope.data, "stable_supervisor_id"), false);
    assert.equal(withIdentity.envelope.data.stable_supervisor_id, supervisorId);
    assert.equal(withIdentity.envelope.data.exact_visible_body, exactOwnerText);
    assert.equal(withIdentity.envelope.data.body_sha256, sha256(exactOwnerText));
    assert.equal(withIdentity.envelope.data.sent_at_source, null);
    assert.doesNotThrow(() => parseEventV2(withIdentity.envelope.data));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("historical reasoning normalization remains unchanged and cannot silently repair an OWNER hash mismatch", () => {
  const current = fixture();
  const rawText = `${exactOwnerText}  `;
  current.delivery.data = reasoningMessageRecordedSchema.parse({
    ...current.delivery.data, exact_visible_body: rawText, body_sha256: sha256(rawText),
  });
  assert.equal(current.delivery.data.exact_visible_body, exactOwnerText);
  assert.equal(current.delivery.data.body_sha256, sha256(rawText));
  assert.throws(() => deriveOwnerResponseContinuation(current.events, current.intent), /exact OWNER response text\/hash mismatch/);
});

test("app admission fetches authoritative daemon history before enriched persistence and fails closed without it", async () => {
  const previousFetch = globalThis.fetch;
  const environment = {
    MISSION_CONTROL_INTERNAL_TOKEN: process.env.MISSION_CONTROL_INTERNAL_TOKEN,
    MISSION_CONTROL_INGEST_CREDENTIALS: process.env.MISSION_CONTROL_INGEST_CREDENTIALS,
    MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON,
    MISSION_CONTROL_DAEMON_URL: process.env.MISSION_CONTROL_DAEMON_URL,
  };
  const token = "test-worker-credential-" + "x".repeat(40);
  process.env.MISSION_CONTROL_INTERNAL_TOKEN = "test-internal-credential-" + "y".repeat(40);
  process.env.MISSION_CONTROL_DAEMON_URL = "http://daemon.test.invalid";
  process.env.MISSION_CONTROL_INGEST_CREDENTIALS = JSON.stringify({ [workerProducer.id]: {
    kind: "WORKER", token, workers: [worker], tasks: ["*"],
  } });
  process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify({ repository: "o/r", decisionIssueNumber: 59,
    capabilityIssueNumber: 61, stageIssueNumber: 60, authorizedWriterLogins: ["owner"], capabilityChallenges: [] });
  try {
    const { POST } = await import("../app/api/worker-channel/[worker]/admission/route");
    for (const scenario of ["DIRECT", "PROJECT_MANAGER", "UNAVAILABLE", "INVALID_HISTORY", "MISSING_OWNER"] as const) {
      const current = fixture(scenario === "PROJECT_MANAGER" ? "PROJECT_MANAGER" : "DIRECT");
      const calls: string[] = [];
      let persisted: unknown;
      globalThis.fetch = async (url, init) => {
        assert.equal(new URL(String(url)).pathname, "/events");
        calls.push(init?.method ?? "GET");
        if (init?.method === "POST") {
          persisted = JSON.parse(String(init.body));
          const headers = new Headers(init.headers);
          assert.equal(headers.get("x-mission-control-producer-id"), workerProducer.id);
          assert.equal(headers.get("x-mission-control-producer-kind"), "WORKER");
          assert.equal(headers.get("authorization"), `Bearer ${process.env.MISSION_CONTROL_INTERNAL_TOKEN}`);
          return Response.json({ event: { eventId: "persisted:route" } }, { status: 201 });
        }
        if (scenario === "UNAVAILABLE") return Response.json({ error: "test unavailable" }, { status: 503 });
        if (scenario === "INVALID_HISTORY") return Response.json({});
        return Response.json({ events: scenario === "MISSING_OWNER"
          ? current.events.filter((event) => event !== current.owner) : current.events });
      };
      const input = admissionInput();
      input.factualPacket.supervisoryCycle.expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      input.factualPacket.supervisoryCycle.githubReceipt.stageIssueNumber = 999;
      const response = await POST(new Request(`http://app.test.invalid/api/worker-channel/${worker}/admission`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "x-mission-control-producer-id": workerProducer.id,
          "content-type": "application/json" }, body: JSON.stringify(input),
      }), { params: Promise.resolve({ worker }) });
      if (scenario === "DIRECT" || scenario === "PROJECT_MANAGER") {
        assert.equal(response.status, 202);
        assert.deepEqual(calls, ["GET", "POST"]);
        assert.ok(persisted && typeof persisted === "object");
        const data = parseEventV2((persisted as { data: unknown }).data);
        assert.ok(data.type === "worker_message_recorded");
        const packet = JSON.parse(data.body.slice(supervisoryCycleRoutePrefix.length));
        assert.equal(packet.continuationOwnerResponseExactText, exactOwnerText);
        assert.equal(packet.continuationBinding.path, scenario);
        assert.equal(packet.continuationBinding.decision_request_id, decisionRequestId);
        assert.equal(packet.githubReceipt.stageIssueNumber, 60);
        assert.equal(packet.continuationBindingSha256, sha256(canonicalJson(packet.continuationBinding)));
        assert.equal(packet.continuationBinding.issued_at, packet.queuedAt);
        assert.equal(packet.continuationBinding.expires_at, packet.expiresAt);
      } else {
        assert.equal(response.status, 400);
        assert.deepEqual(calls, ["GET"]);
        assert.equal(persisted, undefined);
      }
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function fixture(ownerPath: "DIRECT" | "PROJECT_MANAGER" = "DIRECT") {
  const intent: OwnerResponseContinuationIntent = {
    worker, resumeDecisionRequestId: decisionRequestId, supervisorId,
    ownerOutcome: { id: "owner-outcome:current", epoch: 2, sha256: sha256("current owner outcome") },
    evidenceCapsule: { id: "evidence:current", sha256: sha256("current evidence") }, issuedAt, expiresAt,
  };
  const request = reasoning(2, "ASSISTANT", "SUPERVISOR", "Original supervisor question?");
  const owner = reasoning(3, "OWNER", ownerPath === "DIRECT" ? "SUPERVISOR" : "PROJECT_MANAGER", exactOwnerText, { parent_message_id: request.data.message_id });
  const delivery = ownerPath === "DIRECT" ? owner
    : reasoning(5, "OWNER", "SUPERVISOR", exactOwnerText, { parent_message_id: owner.data.message_id });
  const events: StoredEvent[] = [outcomeEvent(1, intent.ownerOutcome), request, owner];
  if (ownerPath === "PROJECT_MANAGER") events.push(reasoning(4, "ASSISTANT", "PROJECT_MANAGER", pmAssistantText, { parent_message_id: owner.data.message_id }), delivery);
  return { events, request, owner, delivery, intent };
}

function reasoning(sequence: number, authorRole: "OWNER" | "ASSISTANT", surfaceRole: "SUPERVISOR" | "PROJECT_MANAGER", text: string,
  changes: Partial<ReasoningMessageStoredEvent["data"]> = {}): ReasoningMessageStoredEvent {
  const data = reasoningMessageRecordedSchema.parse({
    type: "reasoning_message_recorded", worker, stable_supervisor_id: supervisorId, message_id: `message:${sequence}`, thread_id: `thread:${surfaceRole}`,
    author_role: authorRole, surface_role: surfaceRole, provider_surface: "CHATGPT_CONSUMER", model_mode: authorRole === "OWNER" ? "UNKNOWN" : "Extra High",
    account_workspace: "owner-primary", sent_at_source: null, received_at_mission_control: `2026-09-06T11:00:${String(sequence).padStart(2, "0")}.000Z`,
    exact_visible_body: text, body_sha256: sha256(text), immutable_provider_locator: `https://chatgpt.com/c/fixture#message-${sequence}`,
    parent_message_id: null, owner_direction_id: "owner-direction:current", decision_request_id: decisionRequestId,
    acquisition_method: authorRole === "OWNER" ? "OWNER_ATTESTED" : "GITHUB_SESSION_ATTESTED",
    provenance_status: authorRole === "OWNER" ? "OWNER_ATTESTED" : "UNVERIFIED",
    limitations: ["Provider source timestamp unavailable."], recorded_by: authorRole === "OWNER" ? "owner:test" : "supervisor:test", ...changes,
  });
  return { ...stored(sequence, data), data };
}

function outcomeEvent(sequence: number, outcome: OwnerResponseContinuationIntent["ownerOutcome"]): StoredEvent {
  return stored(sequence, ownerOutcomeRecordedSchema.parse({
    type: "owner_outcome_recorded", worker, owner_request_id: "owner-request:current", owner_outcome_id: outcome.id, epoch: outcome.epoch,
    owner_outcome_sha256: outcome.sha256, source_receipt_id: "owner-source:current", owner_source_sha256: sha256(exactOwnerText),
    verbatim_owner_request: [exactOwnerText], normalized_result: "Continue the owner response in a fresh supervisor session.",
    required_outcomes: [{ id: "outcome:continuation", text: "Resume exact OWNER response.", terminal_required: true, status: "UNMET" }],
    current_gap: "Awaiting supervisor resolution.", gap_status: "OPEN",
  }));
}

function consumedReceipt(sequence: number, continuation: OwnerResponseContinuation): StoredEvent {
  const decision = "Admitted canonical GitHub decision.";
  const envelope = { schema_version: 1, binding_capsule_id: "binding:prior", request_id: "request:prior", request_nonce: "nonce:prior",
    supervisor_id: supervisorId, binding_provider_session_id: "provider-session:binding", binding_receipt_id: "binding-receipt:prior",
    worker_id: worker, reasoning_lane: "EXTRA_HIGH_DIRECT", queued_at: continuation.binding.issued_at, expires_at: continuation.binding.expires_at,
    evidence_capsule: continuation.binding.evidence_capsule, owner_outcome: continuation.binding.owner_outcome,
    receipt_targets: { repository: "o/r", decision_issue_number: 59, stage_issue_number: 60 } };
  return stored(sequence, githubDecisionReceiptIngestedSchema.parse({
    type: "github_decision_receipt_ingested", worker, task_id: "task:continuation", receipt_id: "receipt:consumed", request_id: "request:prior",
    supervisor_id: supervisorId, binding_provider_session_id: "provider-session:binding", decision_provider_session_id: "provider-session:decision",
    binding_envelope: envelope, binding_envelope_sha256: sha256(canonicalJson(envelope)), decision_session_provenance: "VISIBLE_EXTRA_HIGH_SESSION_GITHUB_ATTESTED",
    nonce: "nonce:prior", evidence_capsule: continuation.binding.evidence_capsule, owner_outcome_id: continuation.binding.owner_outcome.id,
    owner_outcome_epoch: continuation.binding.owner_outcome.epoch, owner_outcome_sha256: continuation.binding.owner_outcome.sha256,
    continuation_binding: continuation.binding, continuation_binding_sha256: continuation.digest, reasoning_lane: "EXTRA_HIGH_DIRECT",
    decision_block: { decision_id: "decision:prior", exact_text: decision, sha256: sha256(decision) },
    pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
    writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false }, canonical_envelope_sha256: sha256("canonical"),
    github_receipt: { repository: "o/r", issue_number: 59, comment_id: 123, immutable_url: "https://github.com/o/r/issues/59#issuecomment-123",
      github_created_at: issuedAt, github_author_login: "owner", github_delivery_id: null },
    ingestion_method: "RECONCILIATION_POLL", ingested_at: issuedAt,
  }));
}

function stored(sequence: number, data: MissionControlEventV2): StoredEvent {
  return { id: sequence, sequence, eventId: `event:${sequence}`, schemaVersion: 2, missionId: "mission-control-live", worker: data.worker,
    type: data.type, occurredAt: issuedAt, receivedAt: issuedAt, previousHash: null, eventHash: sha256(canonicalJson(data)),
    producerId: "test:authoritative", producerKind: "SUPERVISOR", data };
}

function admissionInput() {
  const { intent } = fixture();
  return {
    resumeDecisionRequestId: decisionRequestId,
    request: { requestId: "request:fresh", action: "ROUTE_INTERNAL_SUPERVISOR", actor: "CODEX", sourceReceipt: null,
      boundedExecution: true, taskRequiresExecutionOutsideChat: true, executionScope: "TERMINAL_OR_COMPUTER_WORK", spend: null,
      internalRoute: { destination: "SPECIALIST_SUPERVISOR_CHAT", destinationChatId: supervisorId, standingOwnerAuthorization: true,
        ownerRelayRequested: false, actionTimeConfirmationRequested: false },
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:zero-spend" } },
    factualPacket: { packetId: "packet:fresh", taskId: "task:continuation", exactFactualState: "An OWNER answer awaits the original supervisor.",
      evidenceRefs: ["github:o/r#53"], decisionRequested: "Resolve the original decision request using the exact OWNER input.",
      supervisoryCycle: { nonce: "nonce:fresh", evidenceCapsule: { ...intent.evidenceCapsule }, ownerOutcome: { ...intent.ownerOutcome },
        reasoningLane: "EXTRA_HIGH_DIRECT", githubReceipt: { repository: "o/r", issueNumber: 59, stageIssueNumber: 60 }, expiresAt } },
  };
}
