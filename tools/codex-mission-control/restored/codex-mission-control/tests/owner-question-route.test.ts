import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import { canonicalOwnerActionSchema, type StoredEvent } from "../lib/schema";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import { producerMayEmit, type AuthenticatedProducer } from "../lib/ingestion-auth";
import { latestOwnerAction } from "../lib/terminal-comparator";
import {
  buildOwnerAnswerContinuationRoute,
  buildWorkSupervisorQuestionRoute,
  workQuestionContextForRequest,
  WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
  workSupervisorQuestionCollector,
} from "../lib/owner-question-route";
import type { GitHubReceiptPolicy } from "../lib/github-decision-receipts";

const worker = "alpha";
const taskId = "task:alpha";
const dispatchId = "work-cloud:alpha";
const workThreadId = "work-thread:alpha";
const supervisorId = "mc-project-manager";
const now = "2026-10-07T12:00:00.000Z";
const outcomeSha = "a".repeat(64);
const decisionReceiptEventId = "github-decision-receipt:alpha";
const originalRequestId = "request:alpha";

function policy(): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/private-receipts",
    decisionIssueNumber: 4,
    capabilityIssueNumber: 4,
    stageIssueNumber: 4,
    authorizedWriterLogins: ["owner"],
    ownerDirectionWriterLogins: ["owner"],
    capabilityChallenges: [],
    requestBound: { enabled: true, relayProducerIds: ["collector:relay"] },
  };
}

function stored(sequence: number, eventId: string, data: any, producerId = "fixture", producerKind: StoredEvent["producerKind"] = "SYSTEM"): StoredEvent {
  return {
    id: sequence,
    sequence,
    eventId,
    schemaVersion: 2,
    missionId: "mission-control-live",
    worker: data.worker ?? null,
    type: data.type,
    occurredAt: now,
    receivedAt: now,
    previousHash: sequence === 1 ? null : "0".repeat(64),
    eventHash: String(sequence).padStart(64, "0"),
    producerId,
    producerKind,
    data,
  } as unknown as StoredEvent;
}

function baseEvents(): StoredEvent[] {
  const originalRouteBody = inBandRequestRoutePrefix + canonicalJson({
    schemaVersion: 6,
    executionContext: { task_id: taskId },
    packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId: originalRequestId,
    worker,
    producerId: "worker:alpha",
    destination: "PROJECT_MANAGER_CHAT",
    destinationSupervisorId: supervisorId,
    factualPacket: { taskId },
    queuedAt: "2026-10-07T10:00:00.000Z",
    expiresAt: "2026-10-07T11:00:00.000Z",
  });
  return [
    stored(1, "owner-outcome:alpha", {
      type: "owner_outcome_recorded",
      worker,
      owner_outcome_id: "outcome:alpha",
      owner_request_id: "request:owner-alpha",
      epoch: 2,
      owner_outcome_sha256: outcomeSha,
      source_receipt_id: "source:alpha",
      owner_source_sha256: "b".repeat(64),
      verbatim_owner_request: ["Keep Work and supervisor direct; owner only for genuine decisions."],
      normalized_result: "Direct Work-supervisor loop.",
      required_outcomes: [],
      non_satisfying_proxies: [],
      current_gap: "Work needs supervisor reasoning.",
      gap_status: "OPEN",
      supersedes: null,
    }),
    stored(2, "original-route:alpha", {
      type: "worker_message_recorded",
      worker,
      message_id: "message:original-route",
      thread_id: "thread:supervisor-alpha",
      message_kind: "QUESTION",
      body: originalRouteBody,
      reply_to_message_id: null,
      direction_id: null,
    }, "worker:alpha", "WORKER"),
    stored(3, decisionReceiptEventId, {
      type: "github_decision_receipt_ingested",
      worker,
      task_id: taskId,
      receipt_id: "github-comment:alpha",
      request_id: originalRequestId,
      supervisor_id: supervisorId,
      owner_outcome_id: "outcome:alpha",
      owner_outcome_epoch: 2,
      owner_outcome_sha256: outcomeSha,
      reasoning_lane: "EXTRA_HIGH_DIRECT",
    }),
    stored(4, "directive:alpha:event", {
      type: "execution_directive_recorded",
      worker,
      directive_id: "directive:alpha",
      directive_revision: 1,
      task_id: taskId,
      execution_surface: "CHATGPT_WORK_CLOUD",
      validated_decision_proof: {
        authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION",
        receipt_event_id: decisionReceiptEventId,
      },
    }),
    stored(5, "dispatch-request:alpha", {
      type: "chatgpt_work_cloud_dispatch_requested",
      worker,
      dispatch_id: dispatchId,
      directive_id: "directive:alpha",
      directive_revision: 1,
      task_id: taskId,
      source_chat_title: "Supervisor",
      source_chat_url: "chatgpt-conversation://supervisor-alpha",
      requested_work_title: "Work — Supervisor",
      requested_at: "2026-10-07T11:30:00.000Z",
    }),
    stored(6, "dispatch-result:alpha", {
      type: "chatgpt_work_cloud_dispatch_recorded",
      worker,
      dispatch_id: dispatchId,
      directive_id: "directive:alpha",
      directive_revision: 1,
      task_id: taskId,
      status: "READY",
      surface_verification: "VERIFIED_NATIVE_WORK",
      work_thread_id: workThreadId,
    }),
  ];
}

test("Work reasoning handoff routes to the original supervisor without owner relay", () => {
  const built = buildWorkSupervisorQuestionRoute(baseEvents(), {
    worker,
    sourceDispatchId: dispatchId,
    workThreadId,
    questionId: "question:alpha",
    exactQuestion: "Should the guard be repaired before retrying the same unsent request?",
    factualState: "The request is proven unsent and the failure is a transport guard mismatch.",
    evidenceRefs: ["event:sealed-failure"],
    recordedAt: now,
  }, policy());

  assert.ok(built.route.data.type === "worker_message_recorded");
  const packet = JSON.parse(built.route.data.body.slice(inBandRequestRoutePrefix.length));
  assert.equal(packet.schemaVersion, 6);
  assert.equal(packet.destinationSupervisorId, supervisorId);
  assert.equal(packet.ownerRelayRequired, false);
  assert.equal(packet.producerId, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID);
  const factual = JSON.parse(packet.factualPacket.exactFactualState);
  assert.equal(factual.review_kind, "WORK_SUPERVISOR_QUESTION");
  assert.equal(factual.source_work_dispatch_id, dispatchId);
  assert.equal(factual.work_factual_state, "The request is proven unsent and the failure is a transport guard mismatch.");
  assert.equal(factual.worker_may_decide_owner_need, false);
  assert.equal(built.context.workThreadId, workThreadId);
  assert.equal(built.provenance.data.type, "evidence_receipt_recorded");

  const system: AuthenticatedProducer = {
    id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
    kind: "SYSTEM",
    workerScopes: [worker],
    taskScopes: [taskId, "task:" + worker],
  };
  assert.equal(producerMayEmit(system, built.route.data), true);
  assert.equal(producerMayEmit(workSupervisorQuestionCollector, built.provenance.data), true);
  assert.equal(producerMayEmit({ ...system, id: "system:other-router" }, built.route.data), false);
});

test("Work question context recovers the exact existing native Work thread", () => {
  const events = baseEvents();
  const built = buildWorkSupervisorQuestionRoute(events, {
    worker,
    sourceDispatchId: dispatchId,
    workThreadId,
    questionId: "question:context",
    exactQuestion: "Which bounded repair is permitted?",
    factualState: "One existing native Work thread is READY.",
    recordedAt: now,
  }, policy());
  const packet = built.route.data.type === "worker_message_recorded"
    ? JSON.parse(built.route.data.body.slice(inBandRequestRoutePrefix.length))
    : null;
  assert.ok(packet);
  const routeEvent = stored(7, built.route.event_id, built.route.data, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM");
  assert.deepEqual(workQuestionContextForRequest([...events, routeEvent], worker, packet.requestId), {
    sourceDispatchId: dispatchId,
    workThreadId,
    questionId: "question:context",
    exactQuestionSha256: sha256("Which bounded repair is permitted?"),
  });
});

test("owner-action classification requires a real option and recommendation binding", () => {
  assert.deepEqual(canonicalOwnerActionSchema.parse({ kind: "NONE" }), { kind: "NONE" });
  const decision = {
    kind: "DECISION_REQUIRED" as const,
    decision_id: "decision:alpha",
    question: "Choose A or B.",
    context: "The supervisor cannot infer this owner preference.",
    options: [
      { option_id: "A", label: "Proceed", benefits: ["Continue"], drawbacks: ["One bounded attempt"], downstream_consequences: ["Resume"] },
      { option_id: "B", label: "Pause", benefits: ["No further action"], drawbacks: ["Outcome stays open"], downstream_consequences: ["Remain paused"] },
    ],
    recommendation_option_id: "A",
    recommendation_reasoning: "A preserves the existing evidence boundary.",
    default_if_no_decision: "B",
  };
  assert.equal(canonicalOwnerActionSchema.parse(decision).kind, "DECISION_REQUIRED");
  assert.equal(canonicalOwnerActionSchema.safeParse({ ...decision, recommendation_option_id: "C" }).success, false);
});

test("dashboard owner answer becomes completed owner obligation and queues a supervisor continuation", () => {
  const events = baseEvents();
  const built = buildWorkSupervisorQuestionRoute(events, {
    worker,
    sourceDispatchId: dispatchId,
    workThreadId,
    questionId: "question:owner",
    exactQuestion: "A genuine owner preference is required.",
    factualState: "Two materially different options remain.",
    recordedAt: now,
  }, policy());
  if (built.route.data.type !== "worker_message_recorded") throw new Error("Expected route");
  const packet = JSON.parse(built.route.data.body.slice(inBandRequestRoutePrefix.length));
  const routeEvent = stored(7, built.route.event_id, built.route.data, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM");
  const originText = "Owner decision required: choose A or B.";
  const origin = stored(8, "supervisor-owner-question:alpha", {
    type: "reasoning_message_recorded",
    worker,
    stable_supervisor_id: supervisorId,
    message_id: "supervisor-owner-question:alpha",
    thread_id: "provider-session:alpha",
    surface_role: "SUPERVISOR",
    provider_surface: "CHATGPT_CONSUMER",
    model_mode: "UNKNOWN",
    account_workspace: "UNKNOWN",
    author_role: "ASSISTANT",
    sent_at_source: null,
    received_at_mission_control: now,
    body_sha256: sha256(originText),
    exact_visible_body: originText,
    immutable_provider_locator: null,
    parent_message_id: null,
    owner_direction_id: null,
    decision_request_id: packet.requestId,
    acquisition_method: "GITHUB_SESSION_ATTESTED",
    provenance_status: "UNVERIFIED",
    limitations: [],
    recorded_by: "supervisor:" + supervisorId,
  }, "supervisor:" + supervisorId, "SUPERVISOR");
  const ownerAction = {
    kind: "DECISION_REQUIRED" as const,
    exact_text: "Choose A or B.",
    reason_code: "SUPERVISOR_OWNER_DECISION_REQUIRED",
    subject_id: packet.requestId,
    blocking_scope: [taskId],
    source_event_ids: ["decision:source"],
    due_at: null,
    escalation_at: null,
    status: "OPEN" as const,
    decision_id: "decision:alpha",
    decision_question: "Choose A or B.",
    decision_context: "Only the owner can choose.",
    options: [
      { option_id: "A", label: "A", benefits: ["Continue"], drawbacks: ["Attempt"], downstream_consequences: ["Resume"] },
      { option_id: "B", label: "B", benefits: ["Pause"], drawbacks: ["Open"], downstream_consequences: ["Wait"] },
    ],
    recommendation_option_id: "A",
    recommendation_reasoning: "A is recommended.",
    pro_analysis_ref: "private:decision",
    default_if_no_decision: "B",
  };
  const request = stored(9, "owner-decision-request:alpha", {
    type: "owner_decision_request_recorded",
    worker,
    request_id: packet.requestId,
    task_id: taskId,
    source_decision_event_id: "decision:source",
    owner_outcome_id: "outcome:alpha",
    owner_outcome_epoch: 2,
    owner_outcome_sha256: outcomeSha,
    owner_action: ownerAction,
    recorded_at: now,
  }, "supervisor:" + supervisorId, "SUPERVISOR");
  const before = [...events, routeEvent, origin, request];
  assert.equal(latestOwnerAction(before)?.status, "OPEN");

  const ownerText = "A";
  const ownerReply = stored(10, "owner-dashboard-reply:alpha", {
    type: "reasoning_message_recorded",
    worker,
    stable_supervisor_id: supervisorId,
    message_id: "owner-dashboard-reply:alpha",
    thread_id: "provider-session:alpha",
    surface_role: "SUPERVISOR",
    provider_surface: "CHATGPT_CONSUMER",
    model_mode: "UNKNOWN",
    account_workspace: "MISSION_CONTROL_DASHBOARD",
    author_role: "OWNER",
    sent_at_source: "2026-10-07T12:10:00.000Z",
    received_at_mission_control: "2026-10-07T12:10:00.000Z",
    body_sha256: sha256(ownerText),
    exact_visible_body: ownerText,
    immutable_provider_locator: null,
    parent_message_id: "supervisor-owner-question:alpha",
    owner_direction_id: null,
    decision_request_id: packet.requestId,
    acquisition_method: "OWNER_ATTESTED",
    provenance_status: "OWNER_ATTESTED",
    limitations: [],
    recorded_by: "owner:test",
  }, "owner:test", "OWNER_AUTHORITY");
  const answered = [...before, ownerReply];
  assert.equal(latestOwnerAction(answered)?.status, "COMPLETED");

  const continuation = buildOwnerAnswerContinuationRoute(answered, {
    worker,
    resumeDecisionRequestId: packet.requestId,
    recordedAt: "2026-10-07T12:11:00.000Z",
  }, policy());
  assert.ok(continuation.data.type === "worker_message_recorded");
  const continuationPacket = JSON.parse(continuation.data.body.slice(inBandRequestRoutePrefix.length));
  assert.equal(continuationPacket.destinationSupervisorId, supervisorId);
  assert.equal(continuationPacket.ownerRelayRequired, false);
  assert.equal(continuationPacket.continuationOwnerResponseExactText, "A");
  assert.equal(continuationPacket.continuationBinding.path, "DIRECT");
  assert.equal(continuationPacket.continuationBinding.decision_request_id, packet.requestId);
});
