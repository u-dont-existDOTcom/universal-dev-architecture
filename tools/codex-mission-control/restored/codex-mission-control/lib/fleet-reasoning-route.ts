import { canonicalJson, sha256 } from "./canonical";
import { CANONICAL_PROJECT_MANAGER_ID, loadConfiguredSupervisorChats } from "./configured-supervisor-chats";
import { parseGitHubReceiptPolicy } from "./github-decision-receipts";
import { inBandRequestRoutePrefix } from "./in-band-request-binding";
import { FLEET_SUPERVISOR_ROUTER_PRODUCER_ID } from "./fleet-router-producer";
import { fleetTaskEvidenceBoundary, sameFleetEvidenceBoundary, trustedFleetRoutes } from "./fleet-evidence-boundary";
import { evaluateSupervisionAdmission } from "./supervision-admission-runtime";
import type { StoredEvent } from "./schema";
import type { EventStore, FleetSupervisorWatchRecord } from "./store";
import type { FleetSupervisorDecision } from "./fleet-supervisor";

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

  const boundary = fleetTaskEvidenceBoundary(events, watch.worker, watch.taskId);
  const routes = trustedFleetRoutes(events, watch.worker, watch.taskId);
  const currentRoutes = [...routes].reverse().filter(route => sameFleetEvidenceBoundary(route.boundary, boundary));
  const routeReceipt = (route: (typeof currentRoutes)[number]) => events.find(e =>
    e.data.type === "github_decision_receipt_ingested"
      && e.data.request_id === route.requestId && e.data.task_id === watch.taskId);
  const routeDirective = (route: (typeof currentRoutes)[number]) => events.find(e =>
    e.data.type === "execution_directive_recorded"
      && e.data.task_id === watch.taskId && e.data.validated_decision_proof?.request_id === route.requestId);

  // A validated directive closes this exact evidence boundary even if a later follow-up
  // review was already queued between receipt ingestion and directive persistence.
  const reviewed = currentRoutes.find(route => {
    const receipt = routeReceipt(route);
    return receipt?.data.type === "github_decision_receipt_ingested" && Boolean(routeDirective(route));
  });
  if (reviewed) return { status: "BOUNDARY_REVIEWED", requestId: reviewed.requestId, event: reviewed.event };

  // Prefer the newest still-pending trusted route. This is the idempotency fence for
  // receipt-without-directive follow-up reviews: once queued, later ticks wait on it.
  const pending = currentRoutes.find(route => !routeReceipt(route));
  if (pending) return { status: Date.parse(pending.expiresAt) <= Date.parse(now)
    ? "HANDOFF_BLOCKED" : "WAITING_FOR_REASONING_REVIEW", requestId: pending.requestId, event: pending.event };

  const unresolvedRoute = currentRoutes.find(route =>
    routeReceipt(route)?.data.type === "github_decision_receipt_ingested") ?? null;
  if (unresolvedRoute?.reasoningLane === "PRO_ESCALATED") {
    return { status: "HANDOFF_BLOCKED_PRO_REVIEW_NO_DIRECTIVE", requestId: unresolvedRoute.requestId,
      event: unresolvedRoute.event };
  }
  const unresolvedPrior = unresolvedRoute ? routeReceipt(unresolvedRoute) ?? null : null;

  const stalePending = [...routes].reverse().find(route => !sameFleetEvidenceBoundary(route.boundary, boundary)
    && !events.some(e => e.data.type === "github_decision_receipt_ingested"
      && e.data.request_id === route.requestId && e.data.task_id === watch.taskId));
  if (stalePending) {
    return { status: "HANDOFF_BLOCKED_EVIDENCE_ADVANCED", requestId: stalePending.requestId, event: stalePending.event };
  }

  const lane = pro || unresolvedPrior ? "PRO_ESCALATED" : "EXTRA_HIGH_DIRECT";
  const owner = { id: outcome.owner_outcome_id, epoch: outcome.epoch, sha256: outcome.owner_outcome_sha256 };
  const factual = canonicalJson({ trigger: decision.trigger, project_id: watch.projectId,
    task_id: watch.taskId, worker: watch.worker, source_receipt_id: source.receipt_id,
    runtime_blocker_codes: events.flatMap(e => e.data.type === "live_worker_evidence_observed"
      && e.data.task_id === watch.taskId && e.data.blocker_code ? [e.data.blocker_code] : []).slice(-1),
    owner_outcome: owner, boundary,
    ...(unresolvedPrior ? { unresolved_review_receipt_event_id: unresolvedPrior.eventId } : {}),
    automatic_replay_allowed: false, worker_semantic_authority: false, private_payloads_included: false });
  const requestId = `fleet-watch:${sha256(canonicalJson({ factual, lane, supervisorId })).slice(0, 32)}`;

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
        + "through the executor rather than inventing facts or asking the owner to relay messages. Return "
        + "machine-actionable bounded_execution whenever any same-task local work remains. Evidence collection "
        + "must itself be encoded as bounded_execution. If a genuine owner-only gate is discovered, bounded_execution "
        + "may only record/surface that exact gate; it may not decide it. A review with no bounded_execution is not "
        + "treated as task continuation and will be routed for structured follow-up. Preserve unknown-submission "
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
  const body = result.routeEnvelope.data.type === "worker_message_recorded"
    ? result.routeEnvelope.data.body : null;
  if (!body?.startsWith(inBandRequestRoutePrefix)) throw new Error("FLEET_REASONING_ROUTE_NOT_V6");
  const route = JSON.parse(body.slice(inBandRequestRoutePrefix.length)) as Record<string, unknown>;
  route.producerId = FLEET_SUPERVISOR_ROUTER_PRODUCER_ID;
  const trustedEnvelope = {
    ...result.routeEnvelope,
    data: { ...result.routeEnvelope.data, body: inBandRequestRoutePrefix + JSON.stringify(route) },
  };
  const trustedProducer = { id: FLEET_SUPERVISOR_ROUTER_PRODUCER_ID, kind: "SYSTEM" as const,
    workerScopes: [watch.worker], taskScopes: [watch.taskId] };
  const event = store.append(trustedEnvelope, undefined, trustedProducer);
  return { status: "QUEUED_FOR_PROVIDER_RELAY", requestId, event };
}
