import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import { boundedExecutionResidueSchema, canonicalOwnerActionSchema, type StoredEvent } from "../lib/schema";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import { continuationId } from "../lib/owner-response-continuation-schema";
import { producerMayEmit, type AuthenticatedProducer } from "../lib/ingestion-auth";
import { latestOwnerAction } from "../lib/terminal-comparator";
import { buildExecutionDirectiveFromGitHubDecision } from "../lib/github-execution-directive";
import { WORK_MODEL_ROUTING_POLICY_BASE_COMMIT, WORK_MODEL_ROUTING_POLICY_REF } from "../lib/work-execution-profile";
import { EventStore } from "../lib/store";
import { refreshUnsentWorkContinuation } from "../lib/work-continuation-refresh";
import { pendingDecisionRequests } from "../lib/github-decision-receipts";
import { WORK_QUESTION_RETIREMENT_PRODUCER_ID } from "../lib/unsent-request-proof";
import { SubmissionAuthorityRuntime } from "../lib/submission-authority-runtime";
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

function sourceBounds() {
  return {
    schema_version: 1 as const, task_id: taskId, job_id: "job-alpha",
    execution_objective: "Collect the exact bounded source evidence.", reasoning_summary: "The semantic supervisor selected this one work package.",
    strategy_id: "strategy:alpha", strategy_causal_hypothesis: "One bounded source check advances the owner outcome.",
    predicted_outcome_change: "A source packet becomes available.", success_threshold: "A checkable packet exists.",
    failure_threshold: "The source cannot be verified.", next_decision_changing_evidence: "The packet or exact blocker.",
    reviewed_evidence_boundary: "The exact admitted source receipt.",
    inputs: Array.from({ length: 5 }, (_, i) => ({ type: "GITHUB", ref: `private-input:${i}`, sha256: String(i + 1).repeat(64) })),
    allowed_actions: ["read the bound evidence"], allowed_paths: ["."], allowed_commands: ["none"],
    forbidden_actions: ["spend or publish"], forbidden_paths: [], forbidden_decisions: ["change methodology"],
    required_evidence: ["source packet"], required_tests_or_checks: ["input integrity"],
    stop_and_return_triggers: ["completion or blocker"], maximum_execution_cycles: 1,
    execution_capability: { type: "BROWSER" as const, name: "Native Work" }, workspace: "/tmp/private-alpha",
    output_schema: { status: "string" }, prompt: "Collect exactly the admitted evidence and return a packet.",
    deadline: "2026-10-07T11:00:00.000Z", execution_surface: "CHATGPT_WORK_CLOUD" as const,
    work_execution_profile: {
      model: "GPT_5_6_SOL" as const, effort: "MEDIUM" as const, routingTier: "SOL_MEDIUM" as const, routingTriggers: [],
      fastModeRequest: "DO_NOT_ENABLE_FAST" as const, assuranceRequirement: "SET_REQUEST_SUFFICIENT" as const,
      policyRef: WORK_MODEL_ROUTING_POLICY_REF, routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
      contractVersion: "TRUSTED_SETTER_V1" as const,
    },
  };
}

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

function baseEvents(bounded = sourceBounds()): StoredEvent[] {
  const canonicalBounded = boundedExecutionResidueSchema.parse(bounded);
  const sourceText = "One bounded source check is authorized within the exact private inputs and deadline.";
  const receipt = {
    type: "github_decision_receipt_ingested" as const,
    worker, task_id: taskId, receipt_id: "github-comment:alpha", request_id: originalRequestId,
    supervisor_id: supervisorId, owner_outcome_id: "outcome:alpha", owner_outcome_epoch: 2, owner_outcome_sha256: outcomeSha,
    reasoning_lane: "EXTRA_HIGH_DIRECT" as const,
    provider_session_id: "provider-session:alpha",
    evidence_capsule: { id: "source-capsule:alpha", sha256: "c".repeat(64) },
    decision_block: { decision_id: "source-decision:alpha", exact_text: sourceText, sha256: sha256(sourceText) },
    bounded_execution: canonicalBounded, bounded_execution_sha256: sha256(canonicalJson(canonicalBounded)),
    canonical_envelope_sha256: "d".repeat(64),
    github_receipt: { repository: "example/private-source", issue_number: 4, comment_id: 123,
      immutable_url: "https://github.com/example/private-source/issues/4#issuecomment-123",
      github_created_at: now, github_author_login: "owner", github_delivery_id: null },
    ingested_at: now,
  };
  const sourceDirective = buildExecutionDirectiveFromGitHubDecision({
    eventId: decisionReceiptEventId, occurredAt: now, data: receipt as any,
  }, [], now)!;
  assert.ok(sourceDirective.data.type === "execution_directive_recorded");
  const directive = sourceDirective.data;
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
    stored(3, decisionReceiptEventId, receipt, "system:github-decision-receipts", "SYSTEM"),
    stored(4, sourceDirective.event_id, directive),
    stored(5, "dispatch-request:alpha", {
      type: "chatgpt_work_cloud_dispatch_requested",
      worker,
      dispatch_id: dispatchId,
      directive_id: directive.directive_id,
      directive_revision: directive.directive_revision,
      task_id: taskId,
      directive_artifact_sha256: directive.directive_artifact_sha256,
      source_message_id: directive.source_message_id,
      source_body_sha256: directive.source_body_sha256,
      source_chat_title: "Supervisor",
      source_chat_url: "chatgpt-conversation://supervisor-alpha",
      requested_work_title: "Work — Supervisor",
      requested_at: "2026-10-07T11:30:00.000Z",
    }),
    stored(6, "dispatch-result:alpha", {
      type: "chatgpt_work_cloud_dispatch_recorded",
      worker,
      dispatch_id: dispatchId,
      directive_id: directive.directive_id,
      directive_revision: directive.directive_revision,
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

test("dashboard owner answer remains retryable until a matching supervisor continuation is durable", async (t) => {
  const events = baseEvents();
  const originalPolicy = { ...policy(), repository: "example/public-receipts", decisionIssueNumber: 59, stageIssueNumber: 61 };
  const built = buildWorkSupervisorQuestionRoute(events, {
    worker,
    sourceDispatchId: dispatchId,
    workThreadId,
    questionId: "question:owner",
    exactQuestion: "A genuine owner preference is required.",
    factualState: "Two materially different options remain.",
    recordedAt: now,
  }, originalPolicy);
  if (built.route.data.type !== "worker_message_recorded") throw new Error("Expected route");
  const packet = JSON.parse(built.route.data.body.slice(inBandRequestRoutePrefix.length));
  const routeEvent = stored(7, built.route.event_id, built.route.data, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM");
  assert.ok(routeEvent.data.type === "worker_message_recorded");
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
  assert.equal(latestOwnerAction(answered)?.status, "OPEN");
  assert.equal(latestOwnerAction([...before, { ...ownerReply, data: {
    ...ownerReply.data, surface_role: "PROJECT_MANAGER",
  } } as StoredEvent])?.status, "OPEN");
  assert.equal(latestOwnerAction([...before, { ...ownerReply, data: {
    ...ownerReply.data, parent_message_id: "message:unrelated",
  } } as StoredEvent])?.status, "OPEN");

  const continuation = buildOwnerAnswerContinuationRoute(answered, {
    worker,
    resumeDecisionRequestId: packet.requestId,
    recordedAt: "2026-10-07T12:11:00.000Z",
  }, policy());
  assert.ok(continuation.data.type === "worker_message_recorded");
  const continuationPacket = JSON.parse(continuation.data.body.slice(inBandRequestRoutePrefix.length));
  const currentReceipt = { repository: policy().repository, issueNumber: policy().decisionIssueNumber,
    stageIssueNumber: policy().stageIssueNumber };
  assert.deepEqual(continuationPacket.githubReceipt, currentReceipt);
  assert.deepEqual(continuationPacket.factualPacket.supervisoryCycle.githubReceipt, currentReceipt);
  // A fresh continuation uses the current channel without rewriting historical authority or evidence.
  assert.equal(packet.githubReceipt.repository, originalPolicy.repository);
  assert.equal(JSON.parse(routeEvent.data.body.slice(inBandRequestRoutePrefix.length)).githubReceipt.repository, originalPolicy.repository);
  assert.notDeepEqual(continuationPacket.evidenceCapsule, packet.evidenceCapsule);
  assert.deepEqual(continuationPacket.ownerOutcome, packet.ownerOutcome);
  const recoveredFacts = JSON.parse(continuationPacket.factualPacket.exactFactualState);
  const recovered = recoveredFacts.recovered_source_bounds;
  const source = answered.find((event) => event.eventId === decisionReceiptEventId)!.data;
  assert.ok(source.type === "github_decision_receipt_ingested");
  assert.deepEqual(recovered.inputs, sourceBounds().inputs);
  assert.equal(recovered.workspace, sourceBounds().workspace);
  assert.equal(recovered.historical_execution_deadline, sourceBounds().deadline);
  assert.equal(recovered.historical_deadline_expired_at_recovery, true);
  assert.equal(recovered.historical_grant_is_not_renewed, true);
  assert.equal(recovered.fresh_execution_deadline_required, true);
  assert.equal(recovered.semantic_authority, false);
  assert.equal(recovered.existing_work_thread_id, workThreadId);
  assert.equal(recovered.source_dispatch_id, dispatchId);
  assert.equal(recovered.source_receipt_event_id, decisionReceiptEventId);
  assert.equal(recovered.canonical_envelope_sha256, source.canonical_envelope_sha256);
  assert.equal(recovered.bounded_execution_sha256, source.bounded_execution_sha256);
  assert.equal(recovered.canonical_receipt_url, source.github_receipt.immutable_url);
  assert.deepEqual(recovered.prior_evidence_capsule, packet.evidenceCapsule);
  assert.deepEqual(continuationPacket.factualPacket.evidenceRefs, [source.github_receipt.immutable_url]);
  assert.equal(continuationPacket.evidenceCapsule.sha256, sha256(continuationPacket.factualPacket.exactFactualState));
  assert.deepEqual(continuationPacket.factualPacket.supervisoryCycle.evidenceCapsule, continuationPacket.evidenceCapsule);
  assert.deepEqual(continuationPacket.continuationBinding.evidence_capsule, continuationPacket.evidenceCapsule);
  assert.match(continuationPacket.factualPacket.decisionRequested, /historical execution deadline is not renewed/);
  const { recovered_source_bounds: _recovered, ...preservedFacts } = recoveredFacts;
  assert.deepEqual(preservedFacts, JSON.parse(packet.factualPacket.exactFactualState));
  assert.equal(JSON.parse(routeEvent.data.body.slice(inBandRequestRoutePrefix.length)).factualPacket.exactFactualState, packet.factualPacket.exactFactualState);
  assert.equal(continuationPacket.destinationSupervisorId, supervisorId);
  assert.equal(continuationPacket.ownerRelayRequired, false);
  assert.equal(continuationPacket.continuationOwnerResponseExactText, "A");
  assert.equal(continuationPacket.continuationBinding.path, "DIRECT");
  assert.equal(continuationPacket.continuationBinding.decision_request_id, packet.requestId);
  // The relay names owner_action in the message for a route with these two markers (isWorkSupervisorQuestion).
  assert.equal(continuationPacket.producerId, "system:work-supervisor-question-router");
  assert.equal(JSON.parse(continuationPacket.factualPacket.exactFactualState).review_kind, "WORK_SUPERVISOR_QUESTION");
  const queued = { ...stored(11, continuation.event_id, continuation.data, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM"),
    occurredAt: continuation.occurred_at };
  assert.equal(workQuestionContextForRequest([...answered, queued], worker, continuationPacket.requestId)?.workThreadId, workThreadId);
  assert.equal(latestOwnerAction([...answered, queued])?.status, "COMPLETED");
  assert.equal(latestOwnerAction([...answered, { ...queued, producerId: "system:unrelated" }])?.status, "OPEN");
  const unrelated = JSON.parse(continuation.data.body.slice(inBandRequestRoutePrefix.length));
  unrelated.continuationBinding.supervisor_delivery.event_id = "owner-reply:other";
  unrelated.continuationBinding.owner_input.event_id = "owner-reply:other";
  delete unrelated.continuationBinding.continuation_id;
  unrelated.continuationBinding.continuation_id = continuationId(unrelated.continuationBinding);
  unrelated.continuationBindingSha256 = sha256(canonicalJson(unrelated.continuationBinding));
  assert.equal(latestOwnerAction([...answered, stored(11, "route:other", {
    ...continuation.data, body: inBandRequestRoutePrefix + canonicalJson(unrelated),
  }, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM")])?.status, "OPEN");

  await t.test("concurrent construction and retries preserve the durable owner-reply route identity", () => {
    const later = { worker, resumeDecisionRequestId: packet.requestId, recordedAt: "2026-10-07T12:20:00.000Z" };
    const concurrent = buildOwnerAnswerContinuationRoute(answered, later, policy());
    assert.equal(concurrent.event_id, continuation.event_id);
    assert.equal(concurrent.occurred_at, later.recordedAt); // An unqueued answer can still get a fresh valid window.
    assert.deepEqual(buildOwnerAnswerContinuationRoute([...answered, queued], later, policy()), continuation);
    // Replaying a queued continuation is read-only even if the configured channel moves again.
    assert.deepEqual(buildOwnerAnswerContinuationRoute([...answered, queued], later,
      { ...policy(), repository: "example/another-private-channel", decisionIssueNumber: 8, stageIssueNumber: 9 }), continuation);
  });

  await t.test("missing, altered or untrusted source proof cannot manufacture recovered context", () => {
    const corruptions: Array<(history: any[]) => void> = [
      (history) => { delete history.find((event) => event.data.type === "execution_directive_recorded").data.validated_decision_proof; },
      (history) => { history.find((event) => event.eventId === decisionReceiptEventId).producerId = "untrusted:source"; },
      (history) => { history.find((event) => event.eventId === decisionReceiptEventId).data.bounded_execution.inputs[0].sha256 = "f".repeat(64); },
      (history) => { history.find((event) => event.data.type === "execution_directive_recorded").data.execution_objective = "Unrelated objective"; },
      (history) => { history.find((event) => event.data.type === "chatgpt_work_cloud_dispatch_requested").data.source_body_sha256 = "f".repeat(64); },
      (history) => { history.find((event) => event.eventId === decisionReceiptEventId).data.github_receipt.immutable_url = "https://github.com/example/other/issues/4#issuecomment-123"; },
      (history) => {
        const event = history.find((event) => event.eventId === routeEvent.eventId);
        const root = JSON.parse(event.data.body.slice(inBandRequestRoutePrefix.length));
        root.factualPacket.exactFactualState += " ";
        event.data.body = inBandRequestRoutePrefix + canonicalJson(root);
      },
    ];
    for (const corrupt of corruptions) {
      const history = structuredClone(answered);
      corrupt(history);
      assert.throws(() => buildOwnerAnswerContinuationRoute(history, {
        worker, resumeDecisionRequestId: packet.requestId, recordedAt: "2026-10-07T12:11:00.000Z",
      }, policy()), /cannot verify the exact historical Work source bounds/);
    }
    const alteredSource = structuredClone(answered);
    corruptions[0]!(alteredSource);
    // Already-queued bytes are authoritative even when a later source check would fail.
    assert.deepEqual(buildOwnerAnswerContinuationRoute([...alteredSource, queued], {
      worker, resumeDecisionRequestId: packet.requestId, recordedAt: "2026-10-07T12:20:00.000Z",
    }, policy()), continuation);
  });

  await t.test("a settled legacy owner-continuation hold can receive verified source bounds on its fresh successor", () => {
    // Model an already-queued route from before source enrichment. Do not repair its stored bytes.
    const legacyPacket = structuredClone(continuationPacket);
    legacyPacket.evidenceCapsule = packet.evidenceCapsule;
    legacyPacket.factualPacket.exactFactualState = packet.factualPacket.exactFactualState;
    legacyPacket.factualPacket.evidenceRefs = packet.factualPacket.evidenceRefs;
    legacyPacket.factualPacket.supervisoryCycle.evidenceCapsule = packet.evidenceCapsule;
    legacyPacket.continuationBinding.evidence_capsule = packet.evidenceCapsule;
    legacyPacket.continuationBindingSha256 = sha256(canonicalJson(legacyPacket.continuationBinding));
    const legacyBody = inBandRequestRoutePrefix + canonicalJson(legacyPacket);
    const legacyQueued = stored(11, continuation.event_id, { ...continuation.data, body: legacyBody }, WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM");
    const secondQuestionId = "supervisor-owner-question:followup";
    const acceptedHold = stored(12, "github-decision:followup-hold", {
      ...source, bounded_execution: undefined, bounded_execution_sha256: undefined,
      request_id: legacyPacket.requestId, receipt_id: "github-comment:followup-hold",
      canonical_envelope_sha256: "e".repeat(64), owner_action: { kind: "DECISION_REQUIRED" },
    }, "system:github-decision-receipts", "SYSTEM");
    const secondQuestion = stored(13, secondQuestionId, {
      ...origin.data, message_id: secondQuestionId, thread_id: "provider-session:followup",
      decision_request_id: legacyPacket.requestId,
    }, "supervisor:" + supervisorId, "SUPERVISOR");
    const secondRequest = stored(14, "owner-decision-request:followup", {
      ...request.data, request_id: legacyPacket.requestId,
      source_decision_event_id: acceptedHold.eventId,
      owner_action: { ...ownerAction, decision_id: "decision:followup", subject_id: legacyPacket.requestId },
    }, "supervisor:" + supervisorId, "SUPERVISOR");
    const secondReply = stored(15, "owner-dashboard-reply:followup", {
      ...ownerReply.data, message_id: "owner-dashboard-reply:followup", thread_id: "provider-session:followup",
      decision_request_id: legacyPacket.requestId, parent_message_id: secondQuestionId,
    }, "owner:test", "OWNER_AUTHORITY");
    const history = [...answered, legacyQueued, acceptedHold, secondQuestion, secondRequest, secondReply];
    const next = buildOwnerAnswerContinuationRoute(history, {
      worker, resumeDecisionRequestId: legacyPacket.requestId, recordedAt: "2026-10-07T12:30:00.000Z",
    }, policy());
    assert.ok(next.data.type === "worker_message_recorded");
    const nextPacket = JSON.parse(next.data.body.slice(inBandRequestRoutePrefix.length));
    assert.notEqual(nextPacket.requestId, legacyPacket.requestId);
    assert.match(nextPacket.continuationBinding.decision_request_id, /^work-owner-continuation:/);
    assert.equal(nextPacket.continuationBinding.decision_request_id, legacyPacket.requestId);
    assert.equal(nextPacket.continuationBinding.originating_supervisor_message.message_id, secondQuestionId);
    assert.deepEqual(nextPacket.factualPacket.evidenceRefs, [source.github_receipt.immutable_url]);
    const nextFacts = JSON.parse(nextPacket.factualPacket.exactFactualState);
    assert.equal(nextFacts.recovered_source_bounds.historical_execution_deadline, sourceBounds().deadline);
    assert.equal(nextFacts.recovered_source_bounds.historical_grant_is_not_renewed, true);
    assert.equal(nextFacts.recovered_source_bounds.fresh_execution_deadline_required, true);
    assert.ok(legacyQueued.data.type === "worker_message_recorded");
    assert.equal(legacyQueued.data.body, legacyBody);
    assert.equal(workQuestionContextForRequest([...history, stored(16, next.event_id, next.data,
      WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM")], worker, nextPacket.requestId)?.workThreadId, workThreadId);
  });

  await t.test("a large historical directive is referenced without copying its full prompt into the bounded packet", () => {
    const large = { ...sourceBounds(), prompt: "Historical source prompt. ".repeat(700) };
    const largeHistory = [...baseEvents(large), ...answered.slice(6)];
    const next = buildOwnerAnswerContinuationRoute(largeHistory, {
      worker, resumeDecisionRequestId: packet.requestId, recordedAt: "2026-10-07T12:11:00.000Z",
    }, policy());
    assert.ok(next.data.type === "worker_message_recorded");
    assert.ok(next.data.body.length < 20_000);
    assert.equal(next.data.body.includes(large.prompt), false);
    assert.deepEqual(JSON.parse(next.data.body.slice(inBandRequestRoutePrefix.length)).factualPacket.evidenceRefs,
      [source.github_receipt.immutable_url]);
  });

  function recoveryStore() {
    const store = new EventStore(":memory:");
    const owner = { id: "owner:test", kind: "OWNER_AUTHORITY" as const, workerScopes: [worker], taskScopes: ["*"] };
    const put = (id: string, data: any, producer: AuthenticatedProducer, at = "2026-10-07T10:00:00.000Z") =>
      store.append({ schema_version: 2, event_id: id, mission_id: "mission-control-live", occurred_at: at, data }, at, producer);
    put("owner-source:alpha", {
      type: "owner_source_recorded", worker, receipt_id: "source:alpha", owner_request_id: "request:owner-alpha",
      canonical_locator: "owner:test", source_sha256: "b".repeat(64), worker_copy_sha256: null,
      capture_integrity: "VERIFIED", acquisition_mode: "OWNER_REATTESTED", receipt_capability: "OWNER_REATTESTED",
      comparison: "NOT_INDEPENDENT", freshness: "CURRENT", limitations: [],
    }, owner);
    for (const event of answered) {
      const data: any = structuredClone(event.data);
      let principal: AuthenticatedProducer = { id: event.producerId, kind: event.producerKind as AuthenticatedProducer["kind"], workerScopes: [worker], taskScopes: ["*"] };
      let at = "2026-10-07T10:00:00.000Z";
      if (data.type === "owner_outcome_recorded") {
        data.required_outcomes = [{ id: "outcome:one", text: "The bounded evidence exists.", terminal_required: true,
          status: "UNMET", direct_evidence_receipt_ids: [] }];
        principal = owner;
      } else if (data.type === "github_decision_receipt_ingested") {
        Object.assign(data, { nonce: "source-nonce:alpha", pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
          writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
          ingestion_method: "RECONCILIATION_POLL", ingested_at: at });
      } else if (data.type === "execution_directive_recorded") {
        principal = { ...principal, id: "system:github-decision-receipts", kind: "SYSTEM" };
      } else if (data.type === "chatgpt_work_cloud_dispatch_requested") {
        at = "2026-10-07T10:30:00.000Z";
        Object.assign(data, { mode: "CREATE", requested_surface: "CHATGPT_WORK_CLOUD", chatgpt_project_id: null,
          existing_work_thread_id: null, prompt_sha256: sha256("Original Work prompt"), approval_state: "NOT_REQUIRED",
          capability_evidence: { observed_at: at, app_version: "synthetic", create_thread_target_available: true,
            send_message_to_thread_available: true, native_surface_verification_available: true },
          requested_at: at, producer_id: "system:chatgpt-work-cloud-dispatch", source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY" });
        principal = { ...principal, id: data.producer_id, kind: "SYSTEM" };
      } else if (data.type === "chatgpt_work_cloud_dispatch_recorded") {
        at = "2026-10-07T10:31:00.000Z";
        Object.assign(data, { mode: "CREATE", requested_surface: "CHATGPT_WORK_CLOUD", app_tool: "create_thread",
          client_thread_id: null, approval_state: "ACCEPTED", native_surface_evidence: "TRUSTED_APP_EXECUTOR_CHATGPT_WORK_CLOUD_TARGET",
          host_id: null, error_code: null, recorded_at: at, producer_id: "system:chatgpt-work-cloud-dispatch",
          source: "TRUSTED_CHATGPT_APP_EXECUTOR_BOUNDARY" });
        principal = { ...principal, id: data.producer_id, kind: "SYSTEM" };
      } else if (data.type === "owner_decision_request_recorded") continue;
      else if (data.type === "worker_message_recorded") {
        const root = JSON.parse(data.body.slice(inBandRequestRoutePrefix.length));
        if (root.requestId === originalRequestId) principal = { ...principal, id: "worker:alpha", kind: "WORKER" };
        else at = now;
      } else if (data.type === "reasoning_message_recorded") at = data.sent_at_source ?? now;
      put(event.eventId, data, principal, at);
      if (data.type === "owner_outcome_recorded") put("task-contract:alpha", {
        type: "task_contract_recorded", worker, worker_name: "Alpha", contract_id: "contract:alpha", revision: 1,
        task_contract_sha256: "c".repeat(64), owner_outcome_id: "outcome:alpha", owner_outcome_epoch: 2,
        owner_outcome_sha256: outcomeSha, goal: "Collect exactly the source packet.", acceptance_criteria: ["A packet exists."],
        allowed_scope: ["Bound source evidence"], forbidden_scope: ["Spend or publish"], effective_finish_line: "One packet exists.",
        required_owner_outcome_ids: ["outcome:one"], omitted_owner_outcome_ids: [], weakened_owner_outcome_ids: [],
        proxy_substitutions: [], parent_outcome_remains_open: true,
      }, owner, at);
      if (event.eventId === routeEvent.eventId) {
        const hold: any = structuredClone(source);
        delete hold.bounded_execution; delete hold.bounded_execution_sha256;
        Object.assign(hold, { request_id: packet.requestId, receipt_id: "github-comment:owner-hold", nonce: packet.nonce,
          pro_decision_block: { used: false, model_mode: null, exact_text: null, sha256: null },
          writer_contract: { mode: "EXACT_COPY_OR_STRUCTURED_TRANSFORMATION_ONLY", reinterpretation_allowed: false },
          ingestion_method: "RECONCILIATION_POLL", ingested_at: now });
        put("github-decision:owner-hold", hold, { ...principal, id: "system:github-decision-receipts", kind: "SYSTEM" }, now);
      }
    }
    const legacy = structuredClone(continuationPacket);
    legacy.evidenceCapsule = packet.evidenceCapsule;
    legacy.factualPacket.exactFactualState = packet.factualPacket.exactFactualState;
    legacy.factualPacket.evidenceRefs = [];
    legacy.factualPacket.supervisoryCycle.evidenceCapsule = packet.evidenceCapsule;
    legacy.continuationBinding.evidence_capsule = packet.evidenceCapsule;
    legacy.continuationBindingSha256 = sha256(canonicalJson(legacy.continuationBinding));
    const body = inBandRequestRoutePrefix + canonicalJson(legacy);
    put(continuation.event_id, { ...continuation.data, body },
      { id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, kind: "SYSTEM", workerScopes: [worker], taskScopes: ["*"] }, continuation.occurred_at);
    return { store, legacy, body };
  }

  const noSend = (requestId: string) => ({ schemaVersion: 1 as const, requestId, pacingDomain: "chatgpt:test",
    ledgerValid: true, matchingStateSections: [], queueRecordCount: 0, admissionRecordCount: 0,
    provenUnsent: true, proofSha256: "f".repeat(64) });

  const relay: AuthenticatedProducer = { id: "collector:refresh-test", kind: "COLLECTOR", workerScopes: [worker], taskScopes: [taskId] };
  const recoveryAt = "2026-10-07T12:20:00.000Z";
  function authorityFor(store: EventStore) {
    return new SubmissionAuthorityRuntime(store, {
      NODE_ENV: "test", MISSION_CONTROL_SUPERVISOR_CHATS_JSON: JSON.stringify([{
        scope: "PROJECT_MANAGER", supervisorId, label: "Dedicated project manager", workerId: null,
        requiredApp: "Mission Control", registrationId: "registration:pm:test", ownership: "MISSION_CONTROL_ONLY",
        purpose: "Dedicated Mission Control supervision", accountAlias: "owner-account", workspaceAlias: "personal",
        privateLocatorRef: "owner-config:test:pm",
        registrationProvenance: { registeredBy: "OWNER", registeredAt: now, sourceRef: "owner:test" },
        bootstrapCapability: { chatId: "bootstrap:pm", url: "https://chatgpt.com/c/test-project-manager", challengeId: "challenge:pm" },
        consumerControls: { modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort",
          thinkingVisibleLabel: "Extra High", thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro",
          accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false },
      }]),
      MISSION_CONTROL_SUBMISSION_PACING_DOMAIN: "chatgpt:test",
      MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON: JSON.stringify({ schemaVersion: 1, leaseId: "lease:primary:1", epoch: 1,
        activeHostAlias: "primary-test", activeHostRole: "PRIMARY", issuedAt: now, expiresAt: "2026-10-07T15:00:00.000Z",
        splitBrainStatus: "SINGLE_ACTIVE_CONFIRMED", takeover: null }),
      MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON: JSON.stringify({ [relay.id]: {
        hostAlias: "primary-test", hostRole: "PRIMARY", automationWindowId: 101, ownedTargetIds: ["automation-owned-target"] } }),
      MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON: JSON.stringify({ [relay.id]: "attestor-test-" + "a".repeat(40) }),
      MISSION_CONTROL_INGEST_CREDENTIALS: JSON.stringify({ [relay.id]: { kind: "COLLECTOR", token: "relay-test-" + "b".repeat(40), workers: [worker], tasks: [taskId] } }),
    }, () => Date.parse(recoveryAt));
  }
  const admissionFor = (requestId: string) => ({ requestId, authorizationRef: taskId,
    queueKey: `request:${requestId}`, retryRootKey: `request:${requestId}`, sendPath: "SUPERVISOR_MESSAGE",
    hostAlias: "primary-test", hostRole: "PRIMARY", deploymentEpoch: 1, leaseId: "lease:primary:1",
    supervisorId, registrationId: "registration:pm:test", targetId: "automation-owned-target", automationWindowId: 101,
    targetKind: "REGISTERED_BOOTSTRAP", targetKey: "bootstrap:pm", expectedUrlSha256: sha256("https://chatgpt.com/c/test-project-manager"),
    bodySha256: "a".repeat(64) });
  const barrier = () => { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; };

  await t.test("real EventStore refresh retires one unexpired unsent legacy route and atomically queues exactly one source-bound successor", async () => {
    const { store, legacy, body } = recoveryStore();
    try {
      const originalCount = store.count();
      const refreshed = await refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId },
        async (id) => noSend(id), policy(), () => "2026-10-07T12:20:00.000Z");
      assert.equal(refreshed.duplicate, false);
      assert.equal(store.count(), originalCount + 2);
      assert.equal(store.eventByEventId(continuation.event_id)!.data.type, "worker_message_recorded");
      assert.equal((store.eventByEventId(continuation.event_id)!.data as any).body, body);
      const pending = pendingDecisionRequests(store.workerEvents(worker));
      assert.deepEqual(pending.map((item) => item.requestId), [refreshed.requestId]);
      assert.equal(workQuestionContextForRequest(store.workerEvents(worker), worker, refreshed.requestId)?.workThreadId, workThreadId);
      const next = JSON.parse((store.eventByEventId(refreshed.routeEventId)!.data as any).body.slice(inBandRequestRoutePrefix.length));
      assert.deepEqual(next.factualPacket.evidenceRefs, [source.github_receipt.immutable_url]);
      assert.equal(JSON.parse(next.factualPacket.exactFactualState).recovered_source_bounds.historical_execution_deadline, sourceBounds().deadline);
      assert.equal(next.continuationOwnerResponseExactText, "A");
      assert.doesNotMatch(next.factualPacket.decisionRequested, /separately attributed owner objective/);
      assert.match(next.factualPacket.decisionRequested, /unless the owner answer itself/);
      assert.equal(buildOwnerAnswerContinuationRoute(store.workerEvents(worker), {
        worker, resumeDecisionRequestId: packet.requestId, recordedAt: "2026-10-07T12:25:00.000Z",
      }, policy()).event_id, refreshed.routeEventId);
      assert.equal((await refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId },
        async () => { throw new Error("A duplicate must not re-prove or append."); }, policy())).requestId, refreshed.requestId);
      assert.equal(store.count(), originalCount + 2);
    } finally { store.close(); }
  });

  function putOwnerContext(store: EventStore, overrides: Record<string, unknown> = {}) {
    const data: any = {
      ...ownerReply.data, message_id: "owner-objective:alpha", surface_role: "PROJECT_MANAGER",
      exact_visible_body: "Keep the original comparison goal in view and reconcile any conflict with the historical scope.",
      immutable_provider_locator: "https://chatgpt.com/c/synthetic-owner-source",
      sent_at_source: "2026-10-07T12:19:00.000Z", received_at_mission_control: recoveryAt,
      parent_message_id: null, decision_request_id: null, owner_direction_id: null,
      limitations: ["Owner-attested context; no independent provider readback or execution grant."],
      ...overrides,
    };
    if (overrides.body_sha256 === undefined) data.body_sha256 = sha256(data.exact_visible_body);
    return store.append({ schema_version: 2, event_id: `owner-context:${data.message_id}`, mission_id: "mission-control-live",
      occurred_at: recoveryAt, data }, recoveryAt,
      { id: "owner:test", kind: "OWNER_AUTHORITY", workerScopes: [worker], taskScopes: ["*"] });
  }

  await t.test("stored detached owner objective is exact source-attributed context, with immutable owner choice and no grant", async () => {
    for (const nullableMetadata of [false, true]) {
      const { store, legacy, body } = recoveryStore();
      try {
        const context = putOwnerContext(store, nullableMetadata ? { immutable_provider_locator: null, sent_at_source: null } : {});
        assert.ok(context.data.type === "reasoning_message_recorded");
        const beforeCount = store.count();
        const input = { worker, requestId: legacy.requestId, ownerContextMessageId: context.data.message_id };
        const refreshed = await refreshUnsentWorkContinuation(store, input, async (id) => noSend(id), policy(), () => recoveryAt);
        const next = JSON.parse((store.eventByEventId(refreshed.routeEventId)!.data as any).body.slice(inBandRequestRoutePrefix.length));
        const facts = JSON.parse(next.factualPacket.exactFactualState);
        assert.deepEqual(facts.owner_objective_context, {
          source_event_id: context.eventId, message_id: context.data.message_id, exact_owner_text: context.data.exact_visible_body,
          body_sha256: context.data.body_sha256, source_locator: context.data.immutable_provider_locator,
          sent_at_source: context.data.sent_at_source, provider_surface: context.data.provider_surface, surface_role: "PROJECT_MANAGER",
          acquisition_method: "OWNER_ATTESTED", provenance_status: "OWNER_ATTESTED", limitations: context.data.limitations,
          existing_owner_outcome_unchanged: true, existing_owner_choice_unchanged: true,
          execution_or_deadline_authority: false, requires_supervisor_scope_reconciliation: true,
        });
        assert.equal(next.ownerContextMessageId, context.data.message_id);
        assert.match(next.factualPacket.decisionRequested, /Reconcile the separately attributed owner objective context/);
        assert.match(next.factualPacket.decisionRequested, /do not silently replace or expand that scope or treat context as an execution grant/);
        assert.match(next.factualPacket.decisionRequested, /owner answer or explicit owner objective context.*irreducible tradeoff/);
        assert.deepEqual(next.ownerOutcome, legacy.ownerOutcome);
        assert.equal(next.continuationOwnerResponseExactText, "A");
        for (const key of ["originating_supervisor_message", "owner_input", "supervisor_delivery"]) {
          assert.deepEqual(next.continuationBinding[key], legacy.continuationBinding[key]);
        }
        assert.equal(facts.recovered_source_bounds.historical_execution_deadline, sourceBounds().deadline);
        assert.equal(facts.recovered_source_bounds.fresh_execution_deadline_required, true);
        assert.deepEqual(next.githubReceipt, { repository: policy().repository, issueNumber: 4, stageIssueNumber: 4 });
        assert.deepEqual(next.factualPacket.supervisoryCycle.githubReceipt, next.githubReceipt);
        assert.deepEqual(next.factualPacket.evidenceRefs, [source.github_receipt.immutable_url]);
        assert.equal(next.evidenceCapsule.sha256, sha256(next.factualPacket.exactFactualState));
        assert.deepEqual(next.factualPacket.supervisoryCycle.evidenceCapsule, next.evidenceCapsule);
        assert.deepEqual(next.continuationBinding.evidence_capsule, next.evidenceCapsule);
        assert.equal(next.bounded_execution, undefined);
        assert.equal(facts.bounded_execution, undefined);
        assert.equal((store.eventByEventId(continuation.event_id)!.data as any).body, body);
        assert.equal(workQuestionContextForRequest(store.workerEvents(worker), worker, refreshed.requestId)?.workThreadId, workThreadId);
        assert.equal((await refreshUnsentWorkContinuation(store, input, async () => { throw new Error("No second proof"); }, policy())).duplicate, true);
        await assert.rejects(refreshUnsentWorkContinuation(store, { ...input, ownerContextMessageId: "owner-objective:different" },
          async () => { throw new Error("No second proof"); }, policy()), /different owner objective context/);
        assert.equal(store.count(), beforeCount + 2);
      } finally { store.close(); }
    }
  });

  await t.test("owner context rejects missing identity, different worker/supervisor, attached choice, role, provenance or corrupt body", async () => {
    for (const overrides of [
      { message_id: "other-owner-context" }, { worker: "other-worker" }, { stable_supervisor_id: "other-supervisor" },
      { parent_message_id: "some-parent" }, { decision_request_id: packet.requestId }, { owner_direction_id: "some-direction" },
      { author_role: "ASSISTANT" }, { provenance_status: "UNVERIFIED" },
      { acquisition_method: "GITHUB_SESSION_ATTESTED", provenance_status: "UNVERIFIED", sent_at_source: null },
    ]) {
      const { store, legacy } = recoveryStore();
      try {
        putOwnerContext(store, overrides);
        const count = store.count();
        await assert.rejects(refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId, ownerContextMessageId: "owner-objective:alpha" },
          async (id) => noSend(id), policy(), () => recoveryAt), /exact detached, source-attributed OWNER_ATTESTED/);
        assert.equal(store.count(), count);
      } finally { store.close(); }
    }
    const { store } = recoveryStore();
    try {
      const count = store.count();
      assert.throws(() => putOwnerContext(store, { body_sha256: "0".repeat(64) }), /body SHA-256 does not match/);
      assert.equal(store.count(), count);
    } finally { store.close(); }
  });

  await t.test("context refresh rejects queue/admission, sent/uncertain transport, decision and stale Work or owner state", async () => {
    for (const alter of [
      { ledgerValid: false }, { matchingStateSections: ["queueItems"] }, { queueRecordCount: 1 },
      { admissionRecordCount: 1 }, { provenUnsent: false }, { requestId: "work-owner-continuation:" + "0".repeat(32) },
    ]) {
      const { store, legacy } = recoveryStore();
      try {
        const count = store.count();
        await assert.rejects(refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId },
          async (id) => ({ ...noSend(id), ...alter }), policy(), () => recoveryAt), /did not prove/);
        assert.equal(store.count(), count);
      } finally { store.close(); }
    }
    for (const summary of ["MISSION_CONTROL_PROVIDER_SESSION_V1", "MISSION_CONTROL_IN_BAND_REQUEST_BINDING_PRE_SEND_V1"]) {
      const { store, legacy } = recoveryStore();
      try {
        store.append({ schema_version: 2, event_id: "transport:test", mission_id: "mission-control-live", occurred_at: recoveryAt,
          data: { type: "evidence_receipt_recorded", worker, receipt_id: "transport:test", producer_id: relay.id,
            producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT",
            exact_candidate_sha256: null, summary, refs: [`request:${legacy.requestId}`, "generation_state:UNKNOWN"],
            verified: true, changed_path_manifest: null } }, recoveryAt, relay);
        const count = store.count();
        await assert.rejects(refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId }, async (id) => noSend(id),
          policy(), () => recoveryAt), /transport, response, decision or retirement/);
        assert.equal(store.count(), count);
      } finally { store.close(); }
    }
    for (const sameRequest of [true, false]) {
      const { store, legacy } = recoveryStore();
      try {
        const receipt: any = structuredClone(store.workerEvents(worker).find((event) => event.data.type === "github_decision_receipt_ingested")!.data);
        delete receipt.bounded_execution; delete receipt.bounded_execution_sha256;
        receipt.request_id = sameRequest ? legacy.requestId : "another-review:alpha";
        receipt.receipt_id = "github-comment:newer";
        store.append({ schema_version: 2, event_id: "decision:newer", mission_id: "mission-control-live", occurred_at: recoveryAt, data: receipt },
          recoveryAt, { id: "system:github-decision-receipts", kind: "SYSTEM", workerScopes: [worker], taskScopes: [taskId] });
        const count = store.count();
        await assert.rejects(refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId }, async (id) => noSend(id),
          policy(), () => recoveryAt), /pending owner continuation|newer directive, Work dispatch or decision/);
        assert.equal(store.count(), count);
      } finally { store.close(); }
    }
    const { store, legacy } = recoveryStore();
    try {
      const outcome: any = structuredClone(store.workerEvents(worker).find((event) => event.data.type === "owner_outcome_recorded")!.data);
      Object.assign(outcome, { epoch: 3, supersedes: outcome.owner_outcome_id, supersedes_outcome_sha256: outcome.owner_outcome_sha256,
        owner_outcome_sha256: "e".repeat(64) });
      store.append({ schema_version: 2, event_id: "owner-outcome:amended", mission_id: "mission-control-live", occurred_at: recoveryAt, data: outcome },
        recoveryAt, { id: "owner:test", kind: "OWNER_AUTHORITY", workerScopes: [worker], taskScopes: [taskId] });
      await assert.rejects(refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId }, async (id) => noSend(id),
        policy(), () => recoveryAt), /stale against the current owner outcome/);
    } finally { store.close(); }
  });

  await t.test("real store rolls back retirement when successor append fails; a later exact retry succeeds once", async () => {
    const { store, legacy } = recoveryStore();
    const append = store.appendMany.bind(store);
    try {
      const count = store.count();
      store.appendMany = (items) => append(items.map((item, index) => index === 1
        ? { ...item, event: { ...(item.event as any), schema_version: 999 } } : item));
      await assert.rejects(refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId }, async (id) => noSend(id),
        policy(), () => recoveryAt));
      assert.equal(store.count(), count);
      assert.deepEqual(pendingDecisionRequests(store.workerEvents(worker)).map((item) => item.requestId), [legacy.requestId]);
      store.appendMany = append;
      const result = await refreshUnsentWorkContinuation(store, { worker, requestId: legacy.requestId }, async (id) => noSend(id),
        policy(), () => recoveryAt);
      assert.equal(result.duplicate, false);
      assert.equal(store.count(), count + 2);
    } finally { store.appendMany = append; store.close(); }
  });

  await t.test("an admission already in flight commits before refresh proof and makes refresh reject", async () => {
    const { store, legacy } = recoveryStore();
    const authority = authorityFor(store);
    try {
      await authority.status(relay);
      const stateStore = (authority as any).stateStore;
      const write = stateStore.write.bind(stateStore);
      const entered = barrier(); const release = barrier();
      stateStore.write = async (state: any) => {
        if (state.admissions.some((item: any) => item.requestId === legacy.requestId)) { entered.release(); await release.promise; }
        return write(state);
      };
      const send = authority.execute("admissions", admissionFor(legacy.requestId), relay);
      await entered.promise;
      const refresh = authority.refreshWorkContinuationContext({ worker, requestId: legacy.requestId }, policy());
      release.release();
      await send;
      await assert.rejects(refresh, /did not prove/);
      assert.equal((await authority.proveRequestUnsent(legacy.requestId)).provenUnsent, false);
      assert.deepEqual(pendingDecisionRequests(store.workerEvents(worker)).map((item) => item.requestId), [legacy.requestId]);
    } finally { store.close(); }
  });

  await t.test("refresh holds the proof/admission fence; a waiting old admission rejects after atomic retirement", async () => {
    const { store, legacy } = recoveryStore();
    const authority = authorityFor(store);
    try {
      await authority.status(relay);
      const prove = authority.proveRequestUnsent.bind(authority);
      const entered = barrier(); const release = barrier();
      authority.proveRequestUnsent = async (id) => { const proof = await prove(id); entered.release(); await release.promise; return proof; };
      const refresh = authority.refreshWorkContinuationContext({ worker, requestId: legacy.requestId }, policy());
      await entered.promise;
      const duplicateDuringProof = authority.refreshWorkContinuationContext({ worker, requestId: legacy.requestId }, policy());
      const send = authority.execute("admissions", admissionFor(legacy.requestId), relay);
      const refused = assert.rejects(send, (error: any) => error.code === "WORK_CONTINUATION_SOURCE_NOT_PENDING");
      release.release();
      const fresh = await refresh;
      const duplicate = await duplicateDuringProof;
      assert.equal(duplicate.requestId, fresh.requestId);
      assert.equal(duplicate.duplicate, true);
      await refused;
      assert.equal((await prove(legacy.requestId)).provenUnsent, true);
      assert.deepEqual(pendingDecisionRequests(store.workerEvents(worker)).map((item) => item.requestId), [fresh.requestId]);
      const [first, second] = await Promise.all([
        authority.refreshWorkContinuationContext({ worker, requestId: legacy.requestId }, policy()),
        authority.refreshWorkContinuationContext({ worker, requestId: legacy.requestId }, policy()),
      ]);
      assert.equal(first.requestId, fresh.requestId); assert.equal(second.requestId, fresh.requestId);
      assert.equal(first.duplicate, true); assert.equal(second.duplicate, true);
    } finally { store.close(); }
  });

  await t.test("owner-decision POST recovers failed appends and returns the existing route after a lost response", async (context) => {
    const names = ["MISSION_CONTROL_OWNER_TOKEN", "MISSION_CONTROL_INTERNAL_TOKEN", "MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON"] as const;
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const previousFetch = globalThis.fetch;
    const token = "owner-test-" + "o".repeat(40);
    process.env.MISSION_CONTROL_OWNER_TOKEN = token;
    process.env.MISSION_CONTROL_INTERNAL_TOKEN = "internal-test-" + "i".repeat(40);
    process.env.MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON = JSON.stringify(policy());
    // Mock the clock, not toISOString: the route derives expiry windows from real Date arithmetic.
    context.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-07T12:11:00.000Z") });
    const history = [...before];
    let failRoute = true;
    let routeWrites = 0;
    globalThis.fetch = async (_url, init) => {
      if (init?.method !== "POST") return Response.json({ events: history });
      const envelope = JSON.parse(String(init.body));
      if (envelope.data.type === "worker_message_recorded") {
        routeWrites++;
        if (failRoute) return Response.json({ error: "Unavailable" }, { status: 503 });
      }
      const producer = new Headers(init.headers);
      history.push(stored(history.length + 1, envelope.event_id, envelope.data,
        producer.get("x-mission-control-producer-id")!, producer.get("x-mission-control-producer-kind")!));
      return Response.json({ event: history.at(-1) });
    };
    try {
      const { POST } = await import("../app/api/workers/[worker]/owner-decision/route");
      const submit = (optionId = "A") => POST(new Request("https://mc.test.invalid/api/workers/alpha/owner-decision", {
        method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ decision_id: "decision:alpha", option_id: optionId }),
      }), { params: Promise.resolve({ worker }) });
      assert.equal((await submit()).status, 503);
      assert.equal(history.filter((event) => event.data.type === "reasoning_message_recorded" && event.data.author_role === "OWNER").length, 1);
      assert.equal(latestOwnerAction(history)?.status, "OPEN");
      failRoute = false;
      const first = await submit(); // Persisted, but the client loses this response.
      assert.equal(first.status, 200);
      const firstBody = await first.json();
      assert.equal(latestOwnerAction(history)?.status, "COMPLETED");
      context.mock.timers.setTime(Date.parse("2026-10-07T12:20:00.000Z"));
      const retry = await submit();
      assert.equal(retry.status, 200);
      assert.equal((await retry.json()).continuation_event_id, firstBody.continuation_event_id);
      assert.equal(routeWrites, 2); // One failed append and one durable append; retry is read-only.
      assert.equal(history.filter((event) => event.data.type === "worker_message_recorded"
        && event.data.body.includes('"actionBlockedOrRouted":"OWNER_RESPONSE_REVIEW"')).length, 1);
      assert.equal((await submit("B")).status, 409);
    } finally {
      globalThis.fetch = previousFetch;
      for (const name of names) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });
});
