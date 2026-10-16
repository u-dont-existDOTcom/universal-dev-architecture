import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256 } from "../lib/canonical";
import { workerTransportSnapshotFromEvents } from "../lib/dashboard-data";
import {
  pendingDecisionRequests,
  retiredAfterSendRequests,
  retiredUnsentRequests,
  supervisoryRequestRetiredAfterSendSummary,
  supervisoryRequestRetiredUnsentSummary,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";
import { inBandRequestRoutePrefix } from "../lib/in-band-request-binding";
import { producerMayEmit, type AuthenticatedProducer } from "../lib/ingestion-auth";
import {
  buildWorkSupervisorQuestionRoute,
  workQuestionContextForRequest,
  workQuestionRequestIdForDispatch,
  WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID,
  workSupervisorQuestionCollector,
} from "../lib/owner-question-route";
import type { AppendEnvelope, StoredEvent } from "../lib/schema";
import {
  FLEET_REQUEST_RETIREMENT_PRODUCER_ID,
  WORK_QUESTION_RETIREMENT_PRODUCER_ID,
  type ProvenUnsentSubmissionState,
  type SettledSendSubmissionState,
} from "../lib/unsent-request-proof";
import {
  assertNoDecisionCommentFor,
  buildExpiredWorkQuestionReissue,
  buildSentWorkQuestionResend,
  DiscardReconciliationError,
  expiredPendingWorkQuestions,
  reconcileBeforeDiscard,
  reissueExpiredWorkQuestion,
  resendSentWorkQuestion,
  workQuestionReissueProducers,
} from "../lib/work-question-reissue";

const worker = "alpha";
const taskId = "task:alpha";
const dispatchId = "work-cloud:alpha";
const workThreadId = "work-thread:alpha";
const supervisorId = "mc-project-manager";
const outcomeSha = "a".repeat(64);
const asked = "2026-10-08T12:00:00.000Z";
const later = "2026-10-14T05:00:00.000Z";
const question = "Should the guard be repaired before retrying the same unsent request?";

function policy(): GitHubReceiptPolicy {
  return {
    repository: "owner/private-receipts",
    decisionIssueNumber: 4,
    capabilityIssueNumber: 4,
    stageIssueNumber: 4,
    authorizedWriterLogins: ["owner"],
    ownerDirectionWriterLogins: ["owner"],
    capabilityChallenges: [],
    requestBound: { enabled: true, relayProducerIds: ["collector:relay"] },
  };
}

function stored(sequence: number, eventId: string, data: any, producerId = "fixture",
  producerKind: StoredEvent["producerKind"] = "SYSTEM", occurredAt = asked): StoredEvent {
  return {
    id: sequence, sequence, eventId, schemaVersion: 2, missionId: "mission-control-live",
    worker: data.worker ?? null, type: data.type, occurredAt, receivedAt: occurredAt,
    previousHash: sequence === 1 ? null : "0".repeat(64), eventHash: String(sequence).padStart(64, "0"),
    producerId, producerKind, data,
  } as unknown as StoredEvent;
}

function append(events: StoredEvent[], envelope: AppendEnvelope, producer: AuthenticatedProducer): StoredEvent[] {
  return [...events, stored(events.length + 1, envelope.event_id, envelope.data, producer.id, producer.kind, envelope.occurred_at)];
}

function baseEvents(): StoredEvent[] {
  const originRoute = inBandRequestRoutePrefix + canonicalJson({
    schemaVersion: 6, executionContext: { task_id: taskId }, packetKind: "PROVIDER_SESSION_SUPERVISORY_CYCLE",
    requestId: "fleet-review:" + "1".repeat(32), worker, producerId: "system:fleet-supervisor",
    destination: "PROJECT_MANAGER_CHAT", destinationSupervisorId: supervisorId, factualPacket: { taskId },
    queuedAt: "2026-10-08T09:00:00.000Z", expiresAt: "2026-10-08T10:00:00.000Z",
  });
  return [
    stored(1, "owner-outcome:alpha", {
      type: "owner_outcome_recorded", worker, owner_outcome_id: "outcome:alpha", owner_request_id: "request:owner-alpha",
      epoch: 2, owner_outcome_sha256: outcomeSha, source_receipt_id: "source:alpha", owner_source_sha256: "b".repeat(64),
      verbatim_owner_request: ["Keep Work and supervisor direct."], normalized_result: "Direct loop.", required_outcomes: [],
      non_satisfying_proxies: [], current_gap: "Work needs supervisor reasoning.", gap_status: "OPEN", supersedes: null,
    }),
    stored(2, "origin-route:alpha", {
      type: "worker_message_recorded", worker, message_id: "message:origin-route", thread_id: "thread:supervisor-alpha",
      message_kind: "QUESTION", body: originRoute, reply_to_message_id: null, direction_id: null,
    }, "system:fleet-supervisor", "SYSTEM"),
    stored(3, "github-decision-receipt:alpha", {
      type: "github_decision_receipt_ingested", worker, task_id: taskId, receipt_id: "github-comment:alpha",
      request_id: "fleet-review:" + "1".repeat(32), supervisor_id: supervisorId, owner_outcome_id: "outcome:alpha",
      owner_outcome_epoch: 2, owner_outcome_sha256: outcomeSha, reasoning_lane: "EXTRA_HIGH_DIRECT",
    }),
    stored(4, "directive:alpha:event", {
      type: "execution_directive_recorded", worker, directive_id: "directive:alpha", directive_revision: 1, task_id: taskId,
      execution_surface: "CHATGPT_WORK_CLOUD",
      validated_decision_proof: { authority_path: "VALIDATED_GITHUB_SUPERVISORY_DECISION", receipt_event_id: "github-decision-receipt:alpha" },
    }),
    stored(5, "dispatch-request:alpha", {
      type: "chatgpt_work_cloud_dispatch_requested", worker, dispatch_id: dispatchId, directive_id: "directive:alpha",
      directive_revision: 1, task_id: taskId, source_chat_title: "Supervisor",
      source_chat_url: "chatgpt-conversation://supervisor-alpha", requested_work_title: "Work", requested_at: asked,
    }),
    stored(6, "dispatch-result:alpha", {
      type: "chatgpt_work_cloud_dispatch_recorded", worker, dispatch_id: dispatchId, directive_id: "directive:alpha",
      directive_revision: 1, task_id: taskId, status: "READY", surface_verification: "VERIFIED_NATIVE_WORK",
      work_thread_id: workThreadId,
    }),
  ];
}

/** The base history plus one Work question routed to its supervisor at `asked` (one-hour window). */
function askedEvents(questionId = "question:alpha", exactQuestion = question, at = asked): { events: StoredEvent[]; requestId: string } {
  const events = baseEvents();
  const built = buildWorkSupervisorQuestionRoute(events, {
    worker, sourceDispatchId: dispatchId, workThreadId, questionId, exactQuestion,
    factualState: "The request is proven unsent and the failure is a transport guard mismatch.",
    evidenceRefs: ["event:sealed-failure"], recordedAt: at,
  }, policy());
  const system: AuthenticatedProducer = { id: WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, kind: "SYSTEM", workerScopes: [worker], taskScopes: [taskId, `task:${worker}`] };
  const withRoute = append(append(events, built.route, system), built.provenance, workSupervisorQuestionCollector);
  const root = JSON.parse((built.route.data as { body: string }).body.slice(inBandRequestRoutePrefix.length));
  return { events: withRoute, requestId: root.requestId };
}

function proof(requestId: string, overrides: Partial<ProvenUnsentSubmissionState> = {}): ProvenUnsentSubmissionState {
  return { schemaVersion: 1, requestId, pacingDomain: "chatgpt:test", ledgerValid: true, matchingStateSections: [],
    queueRecordCount: 0, admissionRecordCount: 0, provenUnsent: true, proofSha256: "c".repeat(64), ...overrides };
}

function rootOf(envelope: AppendEnvelope | StoredEvent): Record<string, any> {
  const data = "data" in envelope ? envelope.data : (envelope as AppendEnvelope).data;
  assert.equal(data.type, "worker_message_recorded");
  return JSON.parse((data as { body: string }).body.slice(inBandRequestRoutePrefix.length));
}

function applied(events: StoredEvent[], built: ReturnType<typeof buildExpiredWorkQuestionReissue>): StoredEvent[] {
  const producers = workQuestionReissueProducers(worker, built.taskId);
  return append(append(append(events, built.retirement, producers.retirement), built.route, producers.route),
    built.provenance, producers.provenance);
}

test("an expired, never-sent Work question is retired and reissued with the same question, thread and window", () => {
  const { events, requestId } = askedEvents();
  assert.deepEqual(pendingDecisionRequests(events).map((request) => request.requestId), [requestId]);
  assert.deepEqual(expiredPendingWorkQuestions(events, worker, later), [requestId]);
  assert.deepEqual(expiredPendingWorkQuestions(events, worker, asked), []);

  const built = buildExpiredWorkQuestionReissue(events, { worker, requestId, recordedAt: later }, proof(requestId), policy());
  assert.equal(built.retiredRequestId, requestId);
  assert.equal(built.taskId, taskId);
  assert.match(built.requestId, /^work-question:[a-f0-9]{32}$/);
  assert.notEqual(built.requestId, requestId);
  assert.equal(built.queuedAt, later);
  assert.equal(Date.parse(built.expiresAt) - Date.parse(later), 60 * 60_000);

  const original = rootOf(events.find((event) => event.eventId === `supervision-request-v6:${sha256(requestId)}`) ?? events[6]!);
  const successor = rootOf(built.route);
  assert.equal(successor.requestId, built.requestId);
  assert.notEqual(successor.nonce, original.nonce);
  assert.equal(successor.factualPacket.supervisoryCycle.nonce, successor.nonce);
  assert.equal(successor.factualPacket.supervisoryCycle.expiresAt, built.expiresAt);
  const strip = (root: Record<string, any>) => {
    const { requestId: _r, nonce: _n, queuedAt: _q, expiresAt: _e, githubReceipt: _g, factualPacket, ...rest } = root;
    const { packetId: _p, supervisoryCycle, ...packet } = factualPacket;
    const { nonce: _sn, expiresAt: _se, githubReceipt: _sg, ...cycle } = supervisoryCycle;
    return { ...rest, factualPacket: { ...packet, supervisoryCycle: cycle } };
  };
  assert.deepEqual(strip(successor), strip(original));
  assert.deepEqual(successor.githubReceipt, original.githubReceipt);
  assert.equal(JSON.parse(successor.factualPacket.exactFactualState).exact_question, question);

  const retirementRefs = (built.retirement.data as { refs: string[] }).refs;
  for (const ref of [`request:${requestId}`, `successor_request:${built.requestId}`, "retirement_reason:REQUEST_EXPIRED",
    "lifecycle_status:RETIRED_UNSENT", "provider_send_boundary:NOT_CROSSED", "submission_authority_queue_records:0",
    "submission_authority_admission_records:0", "provider_transport_evidence_records:0"]) {
    assert.ok(retirementRefs.includes(ref), ref);
  }
  const producers = workQuestionReissueProducers(worker, built.taskId);
  assert.equal(producerMayEmit(producers.retirement, built.retirement.data), true);
  assert.equal(producerMayEmit(producers.route, built.route.data), true);
  assert.equal(producerMayEmit(producers.provenance, built.provenance.data), true);

  const after = applied(events, built);
  assert.deepEqual(pendingDecisionRequests(after).map((request) => request.requestId), [built.requestId]);
  assert.equal(retiredUnsentRequests(after).get(requestId), "REQUEST_EXPIRED");
  assert.deepEqual(workQuestionContextForRequest(after, worker, built.requestId), workQuestionContextForRequest(events, worker, requestId));
  assert.equal(workQuestionRequestIdForDispatch(after, worker, dispatchId), built.requestId);
  assert.throws(() => buildExpiredWorkQuestionReissue(after, { worker, requestId, recordedAt: later }, proof(requestId), policy()),
    /not pending/);
});

test("the relay sees the reissued question once the expired one has stopped counting", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(later) + 60_000 });
  const fixture = askedEvents();
  const requestId = fixture.requestId;
  // A legacy objective makes the fixture worker projectable, as every live worker is.
  const events = [...fixture.events, stored(fixture.events.length + 1, "objective:alpha", {
    type: "objective_created", worker, worker_name: "Alpha worker", goal: "Answer the Work question",
    acceptance_criteria: ["The supervisor answers"], allowed_scope: ["alpha/**"], forbidden_scope: [],
    supervisor_chat_url: "https://chatgpt.com/c/alpha-supervisor", supervisor_chat_label: "Alpha supervisor",
  })];
  const before = workerTransportSnapshotFromEvents(events, worker)!;
  assert.deepEqual(before.worker.authoritativePendingRequestIds, []);
  const built = buildExpiredWorkQuestionReissue(events, { worker, requestId, recordedAt: later }, proof(requestId), policy());
  const after = workerTransportSnapshotFromEvents(applied(events, built), worker)!;
  assert.deepEqual(after.worker.authoritativePendingRequestIds, [built.requestId]);

  // The relay itself (dry run: sending off) selects the reissued question, and nothing before it.
  const relayCore = await import(new URL("../../../vps-browser-relay/src/core.mjs", import.meta.url).href);
  const { RelayRuntime } = await import(new URL("../../../vps-browser-relay/src/relay.mjs", import.meta.url).href);
  const consume = async (transport: NonNullable<ReturnType<typeof workerTransportSnapshotFromEvents>>) => {
    let state = relayCore.defaultState();
    const runtime = new RelayRuntime({
      config: { browser: { profileDir: "/tmp/test-profile" }, memory: { profile: "AUTO", overrides: {} },
        runtime: { chats: [projectManagerChat()], submitEnabled: false, requestBoundEnabled: true, maxHotTabs: 3, retryDelayMs: 300_000 } },
      missionControl: { fetchFleet: async () => ({ workers: [transport.worker] }) },
      browser: { listTargets: async () => [], doctor: async () => ({}) },
      stateStore: { read: async () => state, write: async (next: typeof state) => { state = next; return state; }, writeStatus: async () => undefined },
      submissionPacer: { remoteStatus: async () => ({}), status: () => ({}) },
      memoryReader: async () => ({ totalMb: 8_000, availableMb: 6_000, usedMb: 2_000, swapTotalMb: 2_000, swapUsedMb: 0, browserRssMb: 0 }),
    });
    return runtime.cycle();
  };
  assert.equal((await consume(before)).status, "AUTHORITATIVE_PENDING_ROUTE_UNAVAILABLE");
  // The retirement reaches the relay, whose own list of questions drops the retired one.
  const queued = (transport: NonNullable<ReturnType<typeof workerTransportSnapshotFromEvents>>) =>
    relayCore.extractQueuedRoutes({ workers: [transport.worker] }, [projectManagerChat()], relayCore.defaultState())
      .map((route: { requestId: string }) => route.requestId);
  assert.deepEqual(queued(before), [requestId]);
  assert.deepEqual(queued(after), [built.requestId]);
  const ready = await consume(after);
  assert.equal(ready.status, "DRY_RUN_ROUTE_READY", JSON.stringify(ready).slice(0, 400));
  assert.equal(ready.route.requestId, built.requestId);
});

function projectManagerChat() {
  return {
    scope: "PROJECT_MANAGER", supervisorId, label: "MC project manager", workerId: null, requiredApp: "Mission Control",
    registrationId: "registration:test:mc-project-manager", ownership: "MISSION_CONTROL_ONLY",
    purpose: "Dedicated Mission Control reasoning supervisor", accountAlias: "owner-account", workspaceAlias: "personal",
    privateLocatorRef: "owner-config:test:mc-project-manager",
    registrationProvenance: { registeredBy: "OWNER", registeredAt: "2026-09-20T00:00:00.000Z", sourceRef: "owner:test" },
    consumerControls: {
      modelSelectionPolicy: "TOP_VISIBLE_SELECTABLE_MODEL", thinkingControlLabel: "Thinking effort", thinkingVisibleLabel: "Extra High",
      thinkingOrdinal: "4 of 5", accountPlanLabel: "Pro", accountPlanRole: "PROVENANCE_METADATA_ONLY", accountPlanIsReasoningMode: false,
    },
    bootstrapCapability: { chatId: "bootstrap:pm", url: "https://chatgpt.com/c/test-project-manager", challengeId: "challenge:pm" },
  };
}

test("reissue refuses anything but one expired, provably unsent, current Work question", () => {
  const { events, requestId } = askedEvents();
  const build = (history: StoredEvent[], overrides: Partial<{ requestId: string; recordedAt: string }> = {},
    submission: ProvenUnsentSubmissionState | undefined = proof(overrides.requestId ?? requestId), receiptPolicy = policy()) =>
    buildExpiredWorkQuestionReissue(history, { worker, requestId, recordedAt: later, ...overrides }, submission, receiptPolicy);

  assert.throws(() => build(events, { recordedAt: "2026-10-08T12:30:00.000Z" }), /has not expired/);
  assert.throws(() => buildExpiredWorkQuestionReissue(events, { worker, requestId, recordedAt: later }, undefined, policy()), /did not prove/);
  for (const invalid of [proof(requestId, { provenUnsent: false }), proof(requestId, { admissionRecordCount: 1 }),
    proof(requestId, { queueRecordCount: 1 }), proof(requestId, { matchingStateSections: ["queueItems"] }),
    proof(requestId, { ledgerValid: false }), proof("work-question:" + "d".repeat(32))]) {
    assert.throws(() => build(events, {}, invalid), /did not prove/);
  }
  assert.throws(() => build(events, { requestId: "fleet-review:" + "1".repeat(32) }), /exact work-question/);
  assert.throws(() => build(events, {}, proof(requestId), { ...policy(), requestBound: { enabled: false, relayProducerIds: [] } }), /request-bound/);

  const sendEvidence = [...events, stored(events.length + 1, "send-evidence", {
    type: "evidence_receipt_recorded", worker, receipt_id: "send-evidence", producer_id: "collector:relay",
    producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT",
    exact_candidate_sha256: null, summary: "MISSION_CONTROL_PROVIDER_SESSION_V1", refs: [`request:${requestId}`],
    verified: true, changed_path_manifest: null,
  }, "collector:relay", "COLLECTOR")];
  assert.throws(() => build(sendEvidence), /send, delivery, response, decision or retirement evidence/);

  const answered = [...events, stored(events.length + 1, "answer:alpha", {
    type: "github_decision_receipt_ingested", worker, task_id: taskId, receipt_id: "github-comment:answer", request_id: requestId,
    supervisor_id: supervisorId, owner_outcome_id: "outcome:alpha", owner_outcome_epoch: 2, owner_outcome_sha256: outcomeSha,
    reasoning_lane: "EXTRA_HIGH_DIRECT",
  })];
  assert.throws(() => build(answered), /not pending/);

  const changedOutcome = [...events, stored(events.length + 1, "owner-outcome:alpha:3", {
    ...events[0]!.data, epoch: 3, owner_outcome_sha256: "e".repeat(64),
  })];
  assert.throws(() => build(changedOutcome), /stale against the current owner outcome/);

  const newerDirective = [...events, stored(events.length + 1, "directive:alpha:2", {
    ...events[3]!.data, directive_id: "directive:alpha:2",
  })];
  assert.throws(() => build(newerDirective), /newer directive, Work dispatch or supervisor decision/);
  const newerDecision = [...events, stored(events.length + 1, "decision:other", {
    ...events[2]!.data, receipt_id: "github-comment:other", request_id: "fleet-review:" + "3".repeat(32),
  })];
  assert.throws(() => build(newerDecision), /newer directive, Work dispatch or supervisor decision/);

  const newer = askedEvents("question:newer", "Which bounded repair is permitted now?", "2026-10-08T12:10:00.000Z");
  const twoQuestions = [...events, ...newer.events.slice(6).map((event, index) => ({ ...event, sequence: events.length + 1 + index, id: events.length + 1 + index }))];
  assert.throws(() => build(twoQuestions), /newer question exists/);
});

test("the reissued question points the supervisor at today's decision channel", () => {
  const { events, requestId } = askedEvents();
  const moved = { ...policy(), repository: "owner/new-receipts", decisionIssueNumber: 9, stageIssueNumber: 10 };
  const built = buildExpiredWorkQuestionReissue(events, { worker, requestId, recordedAt: later }, proof(requestId), moved);
  const root = rootOf(built.route);
  const channel = { repository: "owner/new-receipts", issueNumber: 9, stageIssueNumber: 10 };
  assert.deepEqual(root.githubReceipt, channel);
  assert.deepEqual(root.factualPacket.supervisoryCycle.githubReceipt, channel);
  const [request] = pendingDecisionRequests(applied(events, built));
  assert.equal(request!.requestId, built.requestId);
  assert.deepEqual([request!.repository, request!.issueNumber, request!.stageIssueNumber], ["owner/new-receipts", 9, 10]);
});

test("a reissue that another call completed while the proof was read reports that one and appends nothing", async () => {
  const { events, requestId } = askedEvents();
  let history = events;
  let batches = 0;
  const store = {
    workerEvents: (selected: string) => history.filter((event) => event.worker === selected),
    appendMany: (items: Array<{ event: unknown; producer?: AuthenticatedProducer }>) => {
      batches += 1;
      const appended = items.map((item, index) => {
        const envelope = item.event as AppendEnvelope;
        return stored(history.length + 1 + index, envelope.event_id, envelope.data, item.producer!.id, item.producer!.kind, envelope.occurred_at);
      });
      history = [...history, ...appended];
      return appended;
    },
  };
  let concurrent: Awaited<ReturnType<typeof reissueExpiredWorkQuestion>> | null = null;
  const slowProof = async (id: string) => {
    concurrent ??= await reissueExpiredWorkQuestion(store as never, { worker, requestId: id }, async (inner) => proof(inner), policy(), () => later);
    return proof(id);
  };
  const result = await reissueExpiredWorkQuestion(store as never, { worker, requestId }, slowProof, policy(), () => later);
  assert.equal(concurrent!.status, "WORK_QUESTION_REISSUED");
  assert.equal(result.status, "WORK_QUESTION_ALREADY_REISSUED");
  assert.equal(result.requestId, concurrent!.requestId);
  assert.equal(batches, 1);
});

test("reissue appends the retirement, the route and its provenance together, and a repeat appends nothing", async () => {
  const { events, requestId } = askedEvents();
  let history = events;
  const batches: Array<Array<{ event: unknown; producer?: AuthenticatedProducer }>> = [];
  const store = {
    workerEvents: (selected: string) => history.filter((event) => event.worker === selected),
    appendMany: (items: Array<{ event: unknown; producer?: AuthenticatedProducer }>) => {
      batches.push(items);
      const appended = items.map((item, index) => {
        const envelope = item.event as AppendEnvelope;
        return stored(history.length + 1 + index, envelope.event_id, envelope.data, item.producer!.id, item.producer!.kind, envelope.occurred_at);
      });
      history = [...history, ...appended];
      return appended;
    },
  };
  const proved: string[] = [];
  const prove = async (id: string) => { proved.push(id); return proof(id); };

  const first = await reissueExpiredWorkQuestion(store as never, { worker }, prove, policy(), () => later);
  assert.equal(first.status, "WORK_QUESTION_REISSUED");
  assert.equal(first.retiredRequestId, requestId);
  assert.deepEqual(proved, [requestId]);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0]!.map((item) => [item.producer!.id, item.producer!.kind]), [
    [WORK_QUESTION_RETIREMENT_PRODUCER_ID, "VERIFIER"],
    [WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM"],
    [workSupervisorQuestionCollector.id, "COLLECTOR"],
  ]);
  assert.deepEqual(pendingDecisionRequests(history).map((request) => request.requestId), [first.requestId]);

  const repeat = await reissueExpiredWorkQuestion(store as never, { worker, requestId }, prove, policy(), () => later);
  assert.equal(repeat.status, "WORK_QUESTION_ALREADY_REISSUED");
  assert.equal(repeat.requestId, first.requestId);
  assert.equal(repeat.duplicate, true);
  assert.equal(batches.length, 1);
  assert.deepEqual(proved, [requestId]);

  await assert.rejects(reissueExpiredWorkQuestion(store as never, { worker }, prove, policy(), () => later),
    /0 expired pending Work questions/);
  await assert.rejects(reissueExpiredWorkQuestion(store as never, { worker, requestId: "fleet-review:" + "1".repeat(32) }, prove, policy(), () => later),
    /exact work-question/);
  assert.deepEqual(proved, [requestId]);
});

test("a retirement counts only from the verifier allowed to retire that kind of request", () => {
  const { events, requestId } = askedEvents();
  const retirement = (id: string, producerId: string, sequence: number) => stored(sequence, `retirement:${sequence}`, {
    type: "evidence_receipt_recorded", worker, receipt_id: `retirement:${sequence}`, producer_id: producerId,
    producer_role: "VERIFIER", evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT",
    exact_candidate_sha256: "c".repeat(64), summary: supervisoryRequestRetiredUnsentSummary,
    refs: [`request:${id}`, "retirement_reason:REQUEST_EXPIRED", "lifecycle_status:RETIRED_UNSENT", "provider_send_boundary:NOT_CROSSED",
      "submission_authority_queue_records:0", "submission_authority_admission_records:0", "provider_transport_evidence_records:0"],
    verified: true, changed_path_manifest: null,
  }, producerId, "VERIFIER");
  const fleetId = "fleet-review:" + "2".repeat(32);
  const crossed = [...events, retirement(requestId, FLEET_REQUEST_RETIREMENT_PRODUCER_ID, events.length + 1),
    retirement(fleetId, WORK_QUESTION_RETIREMENT_PRODUCER_ID, events.length + 2)];
  assert.equal(retiredUnsentRequests(crossed).size, 0);
  assert.deepEqual(pendingDecisionRequests(crossed).map((request) => request.requestId), [requestId]);
  const matching = [...events, retirement(requestId, WORK_QUESTION_RETIREMENT_PRODUCER_ID, events.length + 1)];
  assert.equal(retiredUnsentRequests(matching).get(requestId), "REQUEST_EXPIRED");
  assert.deepEqual(pendingDecisionRequests(matching), []);
});

function settledSend(requestId: string, overrides: Partial<SettledSendSubmissionState> = {}): SettledSendSubmissionState {
  return { schemaVersion: 1, requestId, pacingDomain: "chatgpt:test", ledgerValid: true,
    admissions: [{ admissionId: "send-admission:sent-question", status: "BOUNDARY_RECORDED", boundaryKind: "CLICKED" }],
    openAdmissionCount: 0, openQueueRecordCount: 0, crossedAdmissionCount: 1, settled: true, proofSha256: "d".repeat(64), ...overrides };
}

/** The asked question, sent: the relay recorded a provider session for it, and no answer came back. */
function sentEvents(): { events: StoredEvent[]; requestId: string } {
  const { events, requestId } = askedEvents();
  return {
    requestId,
    events: [...events, stored(events.length + 1, "send-evidence", {
      type: "evidence_receipt_recorded", worker, receipt_id: "send-evidence", producer_id: "collector:relay",
      producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT",
      exact_candidate_sha256: null, summary: "MISSION_CONTROL_PROVIDER_SESSION_V1", refs: [`request:${requestId}`],
      verified: true, changed_path_manifest: null,
    }, "collector:relay", "COLLECTOR", "2026-10-08T12:01:00.000Z")],
  };
}

const resendInput = (requestId: string) => ({ worker, requestId, recordedAt: later, authorizedBy: "owner:primary" });

test("the owner re-sends a sent Work question whose window closed, once, as the same question on the same thread", () => {
  const { events, requestId } = sentEvents();
  // The unsent reissue refuses it: it was sent.
  assert.throws(() => buildExpiredWorkQuestionReissue(events, { worker, requestId, recordedAt: later }, proof(requestId), policy()),
    /send, delivery, response, decision or retirement evidence/);

  const built = buildSentWorkQuestionResend(events, resendInput(requestId), settledSend(requestId), policy());
  assert.equal(built.retiredRequestId, requestId);
  assert.match(built.requestId, /^work-question:[a-f0-9]{32}$/);
  assert.notEqual(built.requestId, requestId);
  assert.equal(Date.parse(built.expiresAt) - Date.parse(later), 60 * 60_000);
  const successor = rootOf(built.route);
  assert.equal(successor.requestId, built.requestId);
  assert.equal(successor.factualPacket.supervisoryCycle.expiresAt, built.expiresAt);
  assert.equal(JSON.parse(successor.factualPacket.exactFactualState).exact_question, question);

  const data = built.retirement.data as { summary: string; producer_id: string; exact_candidate_sha256: string; refs: string[] };
  assert.equal(data.summary, supervisoryRequestRetiredAfterSendSummary);
  assert.equal(data.producer_id, WORK_QUESTION_RETIREMENT_PRODUCER_ID);
  assert.equal(data.exact_candidate_sha256, "d".repeat(64));
  for (const ref of [`request:${requestId}`, `successor_request:${built.requestId}`,
    "retirement_reason:REQUEST_EXPIRED_WITHOUT_ACCEPTED_ANSWER", "lifecycle_status:RETIRED_AFTER_SEND",
    "provider_send_boundary:CROSSED", "submission_authority_admission_records:1", "submission_authority_crossed_admissions:1",
    "submission_authority_open_records:0", "decision_receipts_ingested:0", "authorization:OWNER_EXPLICIT_ONE_RESEND",
    "authorized_by:owner:primary", "historical_request_preserved:true"]) {
    assert.ok(data.refs.includes(ref), ref);
  }
  assert.ok(!data.refs.includes("lifecycle_status:RETIRED_UNSENT"));
  const producers = workQuestionReissueProducers(worker, built.taskId);
  assert.equal(producerMayEmit(producers.retirement, built.retirement.data), true);
  assert.equal(producerMayEmit(producers.route, built.route.data), true);
  assert.equal(producerMayEmit(producers.provenance, built.provenance.data), true);

  const after = applied(events, built);
  // No late answer to the original can be accepted: it is no longer pending.
  assert.deepEqual(pendingDecisionRequests(after).map((request) => request.requestId), [built.requestId]);
  assert.ok(retiredAfterSendRequests(after).has(requestId));
  assert.equal(retiredUnsentRequests(after).size, 0);
  assert.deepEqual(workQuestionContextForRequest(after, worker, built.requestId), workQuestionContextForRequest(events, worker, requestId));
  assert.equal(workQuestionRequestIdForDispatch(after, worker, dispatchId), built.requestId);
  assert.throws(() => buildSentWorkQuestionResend(after, resendInput(requestId), settledSend(requestId), policy()), /not pending/);

  const unproven = buildSentWorkQuestionResend(events, resendInput(requestId), settledSend(requestId, {
    admissions: [{ admissionId: "send-admission:aborted", status: "ABORTED_BEFORE_BOUNDARY", boundaryKind: null }],
    crossedAdmissionCount: 0,
  }), policy());
  assert.ok((unproven.retirement.data as { refs: string[] }).refs.includes("provider_send_boundary:NOT_PROVEN_UNSENT"));
});

test("the re-send refuses anything but one expired, settled, current Work question named by the owner", () => {
  const { events, requestId } = sentEvents();
  const build = (history: StoredEvent[], overrides: Partial<ReturnType<typeof resendInput> & { discardFinishedReply: boolean }> = {},
    submission: SettledSendSubmissionState | undefined = settledSend(overrides.requestId ?? requestId), receiptPolicy = policy()) =>
    buildSentWorkQuestionResend(history, { ...resendInput(requestId), ...overrides }, submission, receiptPolicy);

  assert.throws(() => build(events, { recordedAt: "2026-10-08T12:30:00.000Z" }), /has not expired/);
  assert.throws(() => buildSentWorkQuestionResend(events, resendInput(requestId), undefined, policy()), /did not show/);
  for (const invalid of [settledSend(requestId, { settled: false }), settledSend(requestId, { admissions: [], crossedAdmissionCount: 0 }),
    settledSend(requestId, { openAdmissionCount: 1 }), settledSend(requestId, { openQueueRecordCount: 1 }),
    settledSend(requestId, { ledgerValid: false }), settledSend(requestId, { crossedAdmissionCount: 2 }),
    settledSend(requestId, { proofSha256: "not-a-digest" }), settledSend("work-question:" + "d".repeat(32))]) {
    assert.throws(() => build(events, {}, invalid), /did not show/);
  }
  assert.throws(() => build(events, { authorizedBy: "" }), /authorizing owner identity/);
  assert.equal(build(events, { authorizedBy: "owner/primary" }).retiredRequestId, requestId);

  // A reply the relay saw finish, or one read back, can still be accepted after the window: no re-send.
  const completion = (refs: string[], summary: string) => [...events, stored(events.length + 1, `completion:${summary}`, {
    type: "evidence_receipt_recorded", worker, receipt_id: `completion:${summary}`, producer_id: "collector:relay",
    producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT",
    exact_candidate_sha256: null, summary, refs: [`request:${requestId}`, ...refs], verified: true, changed_path_manifest: null,
  }, "collector:relay", "COLLECTOR", "2026-10-08T12:20:00.000Z")];
  for (const finished of [completion(["generation_state:COMPLETE"], "MISSION_CONTROL_RELAY_STAGE_V1"),
    completion(["lifecycle_status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_V1"),
    completion(["status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_APP_READBACK_V1"),
    completion(["status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_BROWSER_DOM_READBACK_V1")]) {
    assert.throws(() => build(finished), /finished or was read back/);
  }
  assert.equal(build(completion(["generation_state:STARTED"], "MISSION_CONTROL_RELAY_STAGE_V1")).retiredRequestId, requestId);

  // The owner may discard a finished reply that nothing read back; a readback, which can still carry it in, stops it.
  for (const finished of [completion(["generation_state:COMPLETE"], "MISSION_CONTROL_RELAY_STAGE_V1"),
    completion(["lifecycle_status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_V1")]) {
    const discarded = build(finished, { discardFinishedReply: true });
    assert.equal(discarded.finishedReplyDiscarded, true);
    const refs = (discarded.retirement.data as { refs: string[] }).refs;
    for (const ref of ["finished_reply:DISCARDED_BY_OWNER", "finished_reply_readback:NONE", "authorization:OWNER_EXPLICIT_ONE_RESEND"]) {
      assert.ok(refs.includes(ref), ref);
    }
    assert.ok(retiredAfterSendRequests(applied(finished, discarded)).has(requestId), "the discarding retirement still counts");
    assert.deepEqual(pendingDecisionRequests(applied(finished, discarded)).map((request) => request.requestId), [discarded.requestId]);
  }
  for (const readBack of [completion(["status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_APP_READBACK_V1"),
    completion(["status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_BROWSER_DOM_READBACK_V1"),
    completion(["status:COMPLETE"], "MISSION_CONTROL_PROVIDER_SESSION_MACHINE_TRANSFORM_V1")]) {
    const both = [...completion(["generation_state:COMPLETE"], "MISSION_CONTROL_RELAY_STAGE_V1"), readBack.at(-1)!];
    assert.throws(() => build(both, { discardFinishedReply: true }), /was read back; it may still be accepted, so it is not discarded/);
  }
  const plain = build(events, { discardFinishedReply: true });
  assert.equal(plain.finishedReplyDiscarded, false, "nothing to discard: an ordinary re-send");
  assert.ok(!(plain.retirement.data as { refs: string[] }).refs.some((ref) => ref.startsWith("finished_reply")));
  assert.throws(() => build(events, { requestId: "fleet-review:" + "1".repeat(32) }), /exact work-question/);
  assert.throws(() => build(events, {}, settledSend(requestId), { ...policy(), requestBound: { enabled: false, relayProducerIds: [] } }), /request-bound/);

  const answered = [...events, stored(events.length + 1, "answer:alpha", {
    type: "github_decision_receipt_ingested", worker, task_id: taskId, receipt_id: "github-comment:answer", request_id: requestId,
    supervisor_id: supervisorId, owner_outcome_id: "outcome:alpha", owner_outcome_epoch: 2, owner_outcome_sha256: outcomeSha,
    reasoning_lane: "EXTRA_HIGH_DIRECT",
  })];
  assert.throws(() => build(answered), /not pending/);
  const changedOutcome = [...events, stored(events.length + 1, "owner-outcome:alpha:3", {
    ...events[0]!.data, epoch: 3, owner_outcome_sha256: "e".repeat(64),
  })];
  assert.throws(() => build(changedOutcome), /stale against the current owner outcome/);
  const newerDirective = [...events, stored(events.length + 1, "directive:alpha:2", {
    ...events[3]!.data, directive_id: "directive:alpha:2",
  })];
  assert.throws(() => build(newerDirective), /newer directive, Work dispatch or supervisor decision/);
});

test("the re-send appends its three events together once; repeats and an unsent reissue report the same successor", async () => {
  const { events, requestId } = sentEvents();
  let history = events;
  const batches: Array<Array<{ event: unknown; producer?: AuthenticatedProducer }>> = [];
  const store = {
    workerEvents: (selected: string) => history.filter((event) => event.worker === selected),
    appendMany: (items: Array<{ event: unknown; producer?: AuthenticatedProducer }>) => {
      batches.push(items);
      const appended = items.map((item, index) => {
        const envelope = item.event as AppendEnvelope;
        return stored(history.length + 1 + index, envelope.event_id, envelope.data, item.producer!.id, item.producer!.kind, envelope.occurred_at);
      });
      history = [...history, ...appended];
      return appended;
    },
  };
  const proved: string[] = [];
  const prove = async (id: string) => { proved.push(id); return settledSend(id); };
  const input = { worker, requestId, authorizedBy: "owner:primary" };

  const first = await resendSentWorkQuestion(store as never, input, prove, policy(), () => later);
  assert.equal(first.status, "WORK_QUESTION_RESENT");
  assert.equal(first.originalSendBoundary, "CROSSED");
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0]!.map((item) => [item.producer!.id, item.producer!.kind]), [
    [WORK_QUESTION_RETIREMENT_PRODUCER_ID, "VERIFIER"],
    [WORK_SUPERVISOR_QUESTION_ROUTER_PRODUCER_ID, "SYSTEM"],
    [workSupervisorQuestionCollector.id, "COLLECTOR"],
  ]);
  assert.deepEqual(pendingDecisionRequests(history).map((request) => request.requestId), [first.requestId]);

  const repeat = await resendSentWorkQuestion(store as never, input, prove, policy(), () => later);
  assert.equal(repeat.status, "WORK_QUESTION_ALREADY_REISSUED");
  assert.equal(repeat.requestId, first.requestId);
  assert.equal(repeat.duplicate, true);
  // The unsent reissue never reports a re-sent question as unsent: it is simply no longer pending.
  await assert.rejects(reissueExpiredWorkQuestion(store as never, { worker, requestId }, async (id) => proof(id), policy(), () => later),
    /not pending/);
  assert.equal(batches.length, 1);
  assert.deepEqual(proved, [requestId]);
  await assert.rejects(resendSentWorkQuestion(store as never, { ...input, requestId: "fleet-review:" + "1".repeat(32) }, prove, policy(), () => later),
    /exact work-question/);
});

test("the owner's discard goes through the async re-send once, and a readback alone still refuses it", async () => {
  const { events, requestId } = sentEvents();
  const evidence = (id: string, summary: string, refs: string[]) => stored(events.length + 1, id, {
    type: "evidence_receipt_recorded", worker, receipt_id: id, producer_id: "collector:relay", producer_role: "COLLECTOR",
    evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT", exact_candidate_sha256: null,
    summary, refs: [`request:${requestId}`, ...refs], verified: true, changed_path_manifest: null,
  }, "collector:relay", "COLLECTOR", "2026-10-08T12:20:00.000Z");
  const harness = (history: StoredEvent[]) => {
    const batches: unknown[][] = [];
    const proved: string[] = [];
    const store = {
      workerEvents: (selected: string) => history.filter((event) => event.worker === selected),
      appendMany: (items: Array<{ event: unknown; producer?: AuthenticatedProducer }>) => {
        batches.push(items);
        const appended = items.map((item, index) => {
          const envelope = item.event as AppendEnvelope;
          return stored(history.length + 1 + index, envelope.event_id, envelope.data, item.producer!.id, item.producer!.kind, envelope.occurred_at);
        });
        history = [...history, ...appended];
        return appended;
      },
    };
    const prove = async (id: string) => { proved.push(id); return settledSend(id); };
    return { store, batches, proved, prove, history: () => history };
  };
  const finished = [...events, evidence("stage-complete", "MISSION_CONTROL_RELAY_STAGE_V1", ["generation_state:COMPLETE"])];
  const input = { worker, requestId, authorizedBy: "owner:primary" };

  const refused = harness(finished);
  await assert.rejects(resendSentWorkQuestion(refused.store as never, input, refused.prove, policy(), () => later), /finished or was read back/);
  assert.equal(refused.batches.length, 0);

  const unreconciled = harness(finished);
  await assert.rejects(resendSentWorkQuestion(unreconciled.store as never, { ...input, discardFinishedReply: true }, unreconciled.prove, policy(),
    () => later, async () => { throw new DiscardReconciliationError("reconciliation failed"); }), DiscardReconciliationError);
  assert.equal(unreconciled.batches.length, 0, "nothing is retired when the reconciliation before a discard fails");
  assert.deepEqual(unreconciled.proved, [requestId], "the reconciliation is the last await, after the send proof");

  const owner = harness(finished);
  let reconciled = 0;
  const order: string[] = [];
  const reconcile = async () => { reconciled += 1; order.push(`reconcile after ${owner.proved.length} proof(s)`); };
  const first = await resendSentWorkQuestion(owner.store as never, { ...input, discardFinishedReply: true }, owner.prove, policy(), () => later, reconcile);
  assert.equal(reconciled, 1);
  assert.deepEqual(order, ["reconcile after 1 proof(s)"]);
  assert.equal(first.status, "WORK_QUESTION_RESENT");
  assert.equal(first.finishedReplyDiscarded, true);
  assert.equal(owner.batches.length, 1);
  const retirement = owner.history().find((event) => event.eventId === first.retirementEventId)!;
  assert.ok((retirement.data as { refs: string[] }).refs.includes("finished_reply:DISCARDED_BY_OWNER"));
  assert.deepEqual(pendingDecisionRequests(owner.history()).map((request) => request.requestId), [first.requestId]);
  // A repeat of the recorded re-send is answered without waiting for reconciliation, even when it is unavailable.
  const repeat = await resendSentWorkQuestion(owner.store as never, { ...input, discardFinishedReply: true }, owner.prove, policy(), () => later,
    async () => { throw new DiscardReconciliationError("reconciliation unavailable"); });
  assert.equal(repeat.status, "WORK_QUESTION_ALREADY_REISSUED");
  assert.equal(repeat.requestId, first.requestId);
  assert.equal(repeat.finishedReplyDiscarded, null, "a repeat only reports the earlier re-send");
  assert.equal(owner.batches.length, 1);
  assert.deepEqual(owner.proved, [requestId]);

  const readBackOnly = harness([...events, evidence("app-readback", "MISSION_CONTROL_PROVIDER_SESSION_APP_READBACK_V1", ["status:COMPLETE"])]);
  await assert.rejects(resendSentWorkQuestion(readBackOnly.store as never, { ...input, discardFinishedReply: true }, readBackOnly.prove, policy(), () => later,
    reconcile), /was read back; it may still be accepted, so it is not discarded/);
  const noReconciliation = harness(finished);
  await assert.rejects(resendSentWorkQuestion(noReconciliation.store as never, { ...input, discardFinishedReply: true }, noReconciliation.prove, policy(),
    () => later), /needs a GitHub reconciliation first/);
  assert.equal(noReconciliation.batches.length, 0);
  assert.equal(readBackOnly.batches.length, 0);
});

test("a discard waits for one completed GitHub reconciliation of its own, and stops on anything else", async () => {
  const waits: number[] = [];
  const wait = async (ms: number) => { waits.push(ms); };
  const coordinator = (statuses: Array<"COMPLETED" | "ALREADY_RUNNING" | "THROW">) => {
    const calls: string[] = [];
    return { calls, run: async (trigger: "OWNER_RECOVERY") => {
      calls.push(trigger);
      const next = statuses.shift() ?? "ALREADY_RUNNING";
      if (next === "THROW") throw new Error("GitHub unavailable");
      return { status: next };
    } };
  };
  const busyThenDone = coordinator(["ALREADY_RUNNING", "ALREADY_RUNNING", "COMPLETED"]);
  await reconcileBeforeDiscard(busyThenDone, wait);
  assert.deepEqual(busyThenDone.calls, ["OWNER_RECOVERY", "OWNER_RECOVERY", "OWNER_RECOVERY"]);
  assert.deepEqual(waits, [3_000, 3_000]);
  await assert.rejects(reconcileBeforeDiscard(null, wait), DiscardReconciliationError);
  await assert.rejects(reconcileBeforeDiscard(null, wait), /not configured/);
  await assert.rejects(reconcileBeforeDiscard(coordinator(["THROW"]), wait), /failed, so nothing was discarded/);
  const alwaysBusy = coordinator([]);
  await assert.rejects(reconcileBeforeDiscard(alwaysBusy, wait, 4), /stayed busy, so nothing was discarded/);
  assert.equal(alwaysBusy.calls.length, 4);
});

test("the discard's last step reads the decision issue and stops on any comment naming the question", async () => {
  const requestId = "work-question:" + "c".repeat(32);
  const seen: string[] = [];
  const pages = (bodies: string[][], status = 200) => (async (url: string | URL | Request) => {
    seen.push(String(url));
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return new Response(JSON.stringify((bodies[page - 1] ?? []).map((body, index) => ({ id: page * 1000 + index, body }))), { status });
  }) as typeof fetch;
  const options = (fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}) => ({
    repository: "owner/decisions", decisionIssueNumber: 4, requestId, since: "2026-10-16T16:28:00.000Z",
    tokenProvider: async () => "token", fetchImpl, ...overrides,
  });
  const unrelated = Array.from({ length: 100 }, (_, index) => `Unrelated ${index}`);
  await assertNoDecisionCommentFor(options(pages([unrelated, ["Another unrelated comment"]])));
  assert.equal(seen.length, 2);
  assert.equal(new URL(seen[0]!).searchParams.get("since"), "2026-10-16T16:28:00.000Z");
  await assert.rejects(assertNoDecisionCommentFor(options(pages([unrelated, [`MISSION_CONTROL_CANONICAL_DECISION_V1\n{"request_id":"${requestId}"}`]]))),
    /names this question, so its reply is not discarded/);
  await assert.rejects(assertNoDecisionCommentFor(options(pages([[]], 502))), /could not be read on GitHub, so nothing was discarded/);
  await assert.rejects(assertNoDecisionCommentFor(options(pages([[]]), { tokenProvider: null })), /no GitHub reader is configured/);
  await assert.rejects(assertNoDecisionCommentFor(options(pages([unrelated, unrelated, unrelated]), { maxPages: 2 })), /too many comments/);
  await assert.rejects(assertNoDecisionCommentFor(options((async () => { throw new Error("network down"); }) as typeof fetch)),
    DiscardReconciliationError);
});

test("a re-send retirement counts only from the Work-question verifier with the owner's one-time authorization", () => {
  const { events, requestId } = sentEvents();
  const refs = (id: string) => [`request:${id}`, "lifecycle_status:RETIRED_AFTER_SEND", "authorization:OWNER_EXPLICIT_ONE_RESEND",
    "submission_authority_open_records:0", "decision_receipts_ingested:0"];
  const retirement = (sequence: number, producerId: string, refList: string[]) => stored(sequence, `retirement:${sequence}`, {
    type: "evidence_receipt_recorded", worker, receipt_id: `retirement:${sequence}`, producer_id: producerId,
    producer_role: "VERIFIER", evidence_class: "ARTIFACT", independence: "INDEPENDENT", freshness: "CURRENT",
    exact_candidate_sha256: "d".repeat(64), summary: supervisoryRequestRetiredAfterSendSummary, refs: refList,
    verified: true, changed_path_manifest: null,
  }, producerId, "VERIFIER");
  const fleetId = "fleet-review:" + "2".repeat(32);
  const rejected = [...events,
    retirement(events.length + 1, FLEET_REQUEST_RETIREMENT_PRODUCER_ID, refs(requestId)),
    retirement(events.length + 2, WORK_QUESTION_RETIREMENT_PRODUCER_ID, refs(requestId).filter((ref) => !ref.startsWith("authorization:"))),
    retirement(events.length + 3, WORK_QUESTION_RETIREMENT_PRODUCER_ID, refs(requestId).filter((ref) => !ref.startsWith("submission_authority_open_records:"))),
    retirement(events.length + 4, WORK_QUESTION_RETIREMENT_PRODUCER_ID, refs(fleetId))];
  assert.equal(retiredAfterSendRequests(rejected).size, 0);
  assert.deepEqual(pendingDecisionRequests(rejected).map((request) => request.requestId), [requestId]);
  const matching = [...events, retirement(events.length + 1, WORK_QUESTION_RETIREMENT_PRODUCER_ID, refs(requestId))];
  assert.ok(retiredAfterSendRequests(matching).has(requestId));
  assert.deepEqual(pendingDecisionRequests(matching), []);
});

test("the relay drops a re-sent question and sends its successor", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(later) + 60_000 });
  const fixture = sentEvents();
  const requestId = fixture.requestId;
  const events = [...fixture.events, stored(fixture.events.length + 1, "objective:alpha", {
    type: "objective_created", worker, worker_name: "Alpha worker", goal: "Answer the Work question",
    acceptance_criteria: ["The supervisor answers"], allowed_scope: ["alpha/**"], forbidden_scope: [],
    supervisor_chat_url: "https://chatgpt.com/c/alpha-supervisor", supervisor_chat_label: "Alpha supervisor",
  })];
  const before = workerTransportSnapshotFromEvents(events, worker)!;
  const built = buildSentWorkQuestionResend(events, resendInput(requestId), settledSend(requestId), policy());
  const after = workerTransportSnapshotFromEvents(applied(events, built), worker)!;
  assert.deepEqual(after.worker.authoritativePendingRequestIds, [built.requestId]);

  const relayCore = await import(new URL("../../../vps-browser-relay/src/core.mjs", import.meta.url).href);
  const { RelayRuntime } = await import(new URL("../../../vps-browser-relay/src/relay.mjs", import.meta.url).href);
  const queued = (transport: NonNullable<ReturnType<typeof workerTransportSnapshotFromEvents>>) =>
    relayCore.extractQueuedRoutes({ workers: [transport.worker] }, [projectManagerChat()], relayCore.defaultState())
      .map((route: { requestId: string }) => route.requestId);
  assert.deepEqual(queued(before), [requestId]);
  assert.deepEqual(queued(after), [built.requestId]);
  let state = relayCore.defaultState();
  const runtime = new RelayRuntime({
    config: { browser: { profileDir: "/tmp/test-profile" }, memory: { profile: "AUTO", overrides: {} },
      runtime: { chats: [projectManagerChat()], submitEnabled: false, requestBoundEnabled: true, maxHotTabs: 3, retryDelayMs: 300_000 } },
    missionControl: { fetchFleet: async () => ({ workers: [after.worker] }) },
    browser: { listTargets: async () => [], doctor: async () => ({}) },
    stateStore: { read: async () => state, write: async (next: typeof state) => { state = next; return state; }, writeStatus: async () => undefined },
    submissionPacer: { remoteStatus: async () => ({}), status: () => ({}) },
    memoryReader: async () => ({ totalMb: 8_000, availableMb: 6_000, usedMb: 2_000, swapTotalMb: 2_000, swapUsedMb: 0, browserRssMb: 0 }),
  });
  const ready = await runtime.cycle();
  assert.equal(ready.status, "DRY_RUN_ROUTE_READY", JSON.stringify(ready).slice(0, 400));
  assert.equal(ready.route.requestId, built.requestId);
});

test("reissuing a reissued question names only its own source and retirement", () => {
  const { events, requestId } = askedEvents();
  const first = buildExpiredWorkQuestionReissue(events, { worker, requestId, recordedAt: later }, proof(requestId), policy());
  const reissued = applied(events, first);
  const resendAt = "2026-10-14T07:00:00.000Z";
  const sent = [...reissued, stored(reissued.length + 1, "send-evidence:successor", {
    type: "evidence_receipt_recorded", worker, receipt_id: "send-evidence:successor", producer_id: "collector:relay",
    producer_role: "COLLECTOR", evidence_class: "ARTIFACT", independence: "SAME_PROVENANCE", freshness: "CURRENT",
    exact_candidate_sha256: null, summary: "MISSION_CONTROL_PROVIDER_SESSION_V1", refs: [`request:${first.requestId}`],
    verified: true, changed_path_manifest: null,
  }, "collector:relay", "COLLECTOR", later)];
  const second = buildSentWorkQuestionResend(sent, { worker, requestId: first.requestId, recordedAt: resendAt, authorizedBy: "owner:primary" },
    settledSend(first.requestId), policy());
  const provenanceRefs = (second.provenance.data as { refs: string[] }).refs;
  for (const prefix of ["route_event:", "reissue_of_request_route:", "retirement_event:"]) {
    assert.equal(provenanceRefs.filter((ref) => ref.startsWith(prefix)).length, 1, prefix);
  }
  assert.ok(provenanceRefs.includes(`reissue_of_request_route:${first.route.event_id}`));
  assert.ok(provenanceRefs.includes(`retirement_event:${second.retirement.event_id}`));
  const after = applied(sent, second);
  assert.deepEqual(pendingDecisionRequests(after).map((request) => request.requestId), [second.requestId]);
  assert.equal(workQuestionRequestIdForDispatch(after, worker, dispatchId), second.requestId);
});
