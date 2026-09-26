import { canonicalJson, sha256 } from "./canonical";
import { CANONICAL_PROJECT_MANAGER_ID, loadConfiguredSupervisorChats } from "./configured-supervisor-chats";
import { parseGitHubReceiptPolicy, pendingDecisionRequests } from "./github-decision-receipts";
import { requestRouteEventId } from "./request-bound-supervision";
import { evaluateSupervisionAdmission } from "./supervision-admission-runtime";
import type { StoredEvent } from "./schema";
import type { EventStore, FleetSupervisorWatchRecord } from "./store";
import type { FleetSupervisorDecision } from "./fleet-supervisor";

const BOUNDARY_FAMILIES = new Set([
  "task_contract_recorded", "execution_directive_recorded", "execution_receipt_recorded",
  "chatgpt_work_cloud_execution_receipt_recorded", "worker_checkpoint_recorded",
  "live_worker_evidence_observed", "structured_blocker_recorded", "outcome_progress_recorded", "reasoning_supervision_recorded",
]);
export function routeFleetReasoning(store: EventStore, watch: FleetSupervisorWatchRecord,
  decision: FleetSupervisorDecision, history: readonly StoredEvent[], now: string) {
  const events = history.filter(e => e.worker === watch.worker);
  const outcome = events.findLast(e => e.data.type === "owner_outcome_recorded")?.data;
  if (outcome?.type !== "owner_outcome_recorded" || outcome.gap_status !== "OPEN") {
    throw new Error("FLEET_CURRENT_OWNER_OUTCOME_REQUIRED");
  }
  const source = events.findLast(e => e.data.type === "owner_source_recorded"
    && e.data.receipt_id === outcome.source_receipt_id)?.data;
  if (source?.type !== "owner_source_recorded" || source.freshness !== "CURRENT"
    || source.capture_integrity !== "VERIFIED" || source.source_sha256 !== outcome.owner_source_sha256) {
    throw new Error("FLEET_CURRENT_OWNER_SOURCE_REQUIRED");
  }
  const policy = parseGitHubReceiptPolicy();
  if (!policy?.requestBound?.enabled) throw new Error("FLEET_BOUND_RELAY_CONFIGURATION_REQUIRED");
  const directory = loadConfiguredSupervisorChats();
  const prior = events.findLast(e => e.data.type === "github_decision_receipt_ingested"
    && e.data.task_id === watch.taskId)?.data;
  const supervisorId = prior?.type === "github_decision_receipt_ingested" && prior.supervisor_id
    ? prior.supervisor_id : CANONICAL_PROJECT_MANAGER_ID;
  const supervisor = directory.entries.find(e => e.supervisorId === supervisorId
    && (e.scope === "PROJECT_MANAGER" || e.workerId === watch.worker));
  if (!supervisor) throw new Error("FLEET_REGISTERED_SUPERVISOR_REQUIRED");
  const review = events.findLast(e => e.producerKind === "SUPERVISOR"
    && e.data.type === "reasoning_supervision_recorded")?.data;
  const pro = review?.type === "reasoning_supervision_recorded"
    && review.owner_outcome_id === outcome.owner_outcome_id
    && review.owner_outcome_epoch === outcome.epoch
    && review.owner_outcome_sha256 === outcome.owner_outcome_sha256
    && ["PENDING", "ACTIVE"].includes(review.pro_escalation_state);
  const lane = pro ? "PRO_ESCALATED" : "EXTRA_HIGH_DIRECT";
  const latest = new Map<string, StoredEvent>();
  for (const event of events) {
    if (!BOUNDARY_FAMILIES.has(event.data.type)) continue;
    if ("task_id" in event.data && event.data.task_id !== watch.taskId) continue;
    const suffix = event.data.type === "structured_blocker_recorded" ? event.data.blocker_id : "";
    latest.set(`${event.data.type}:${suffix}`, event);
  }
  const boundary = [...latest.values()].map(e => ({ event_id: e.eventId, event_hash: e.eventHash }));
  const owner = { id: outcome.owner_outcome_id, epoch: outcome.epoch, sha256: outcome.owner_outcome_sha256 };
  const factual = canonicalJson({ trigger: decision.trigger, project_id: watch.projectId,
    task_id: watch.taskId, worker: watch.worker, source_receipt_id: source.receipt_id,
    runtime_blocker_codes: [...latest.values()].flatMap(e => e.data.type === "live_worker_evidence_observed"
      && e.data.blocker_code ? [e.data.blocker_code] : []),
    owner_outcome: owner, boundary, automatic_replay_allowed: false,
    worker_semantic_authority: false, private_payloads_included: false });
  const requestId = `fleet-watch:${sha256(canonicalJson({ factual, lane, supervisorId })).slice(0, 32)}`;
  // One unresolved logical fleet request survives ticks and daemon restarts.
  // A timeout is not proof of non-submission and cannot authorize another send.
  const priorRoutes = events.filter(event => event.data.type === "worker_message_recorded"
    && event.eventId === requestRouteEventId(requestId, 6));
  for (const event of priorRoutes) {
    const exact = pendingDecisionRequests([event]).find(route => route.requestId === requestId
      && route.routeSchemaVersion === 6 && route.worker === watch.worker && route.taskId === watch.taskId);
    if (!exact) throw new Error("FLEET_EXISTING_ROUTE_IDENTITY_CONFLICT");
    const answered = events.some(e => e.data.type === "github_decision_receipt_ingested"
      && e.data.request_id === requestId && e.data.task_id === watch.taskId);
    return { status: answered ? "BOUNDARY_REVIEWED"
      : Date.parse(exact.expiresAt) <= Date.parse(now) ? "HANDOFF_BLOCKED" : "WAITING_FOR_REASONING_REVIEW",
      requestId, event };
  }
  const pending = pendingDecisionRequests(events).find(route => route.routeSchemaVersion === 6
    && route.worker === watch.worker && route.taskId === watch.taskId && route.requestId.startsWith("fleet-watch:"));
  if (pending) return { status: Date.parse(pending.expiresAt) <= Date.parse(now)
    ? "HANDOFF_BLOCKED" : "WAITING_FOR_REASONING_REVIEW", requestId: pending.requestId };
  const windowMs = Number(process.env.MISSION_CONTROL_FLEET_REVIEW_WINDOW_MS ?? 21_600_000);
  if (!Number.isInteger(windowMs) || windowMs < 60_000 || windowMs > 86_400_000) {
    throw new Error("FLEET_REVIEW_WINDOW_INVALID");
  }
  const producer = { id: `worker:${watch.worker}`, kind: "WORKER" as const,
    workerScopes: [watch.worker], taskScopes: [watch.taskId] };
  const result = evaluateSupervisionAdmission(watch.worker, producer, {
    request: { requestId, action: "ROUTE_INTERNAL_SUPERVISOR", actor: "WORK", sourceReceipt: null,
      boundedExecution: true, taskRequiresExecutionOutsideChat: true, executionScope: "SUPERVISORY_REASONING",
      spend: null, internalRoute: { destination: supervisor.scope === "PROJECT_MANAGER"
        ? "PROJECT_MANAGER_CHAT" : "SPECIALIST_SUPERVISOR_CHAT", destinationChatId: supervisorId,
        standingOwnerAuthorization: true, ownerRelayRequested: false, actionTimeConfirmationRequested: false },
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: null } },
    factualPacket: { packetId: `packet:${requestId}`, taskId: watch.taskId, exactFactualState: factual,
      evidenceRefs: boundary.map(e => e.event_id),
      decisionRequested: "Review this blocked or overdue execution boundary against the current owner outcome. "
        + "Extra High is the default; request Pro for a decision that requires it. Request scoped missing evidence "
        + "through the executor rather than inventing facts or asking the owner to relay messages. Return a bound "
        + "next directive, evidence request, Pro escalation, or genuine owner gate. Preserve unknown-submission "
        + "fences, privacy, zero-spend restrictions, and existing acceptance criteria. Queuing is not delivery.",
      supervisoryCycle: { bindingProtocol: "IN_BAND_REQUEST_BINDING_V1",
        executionContext: { task_id: watch.taskId }, nonce: `fleet-nonce:${sha256(requestId).slice(0, 32)}`,
        evidenceCapsule: { id: `fleet-evidence:${sha256(factual).slice(0, 32)}`, sha256: sha256(factual) },
        ownerOutcome: owner, reasoningLane: lane,
        githubReceipt: { repository: policy.repository, issueNumber: policy.decisionIssueNumber,
          stageIssueNumber: policy.stageIssueNumber }, expiresAt: new Date(Date.parse(now) + windowMs).toISOString() }
    }
  }, now, undefined, null, "IN_BAND_REQUEST_BINDING_V1");
  if (!result.routeEnvelope) throw new Error("FLEET_REASONING_ROUTE_REJECTED");
  const event = store.append(result.routeEnvelope, undefined, producer);
  return { status: "QUEUED_FOR_PROVIDER_RELAY", requestId, event };
}
