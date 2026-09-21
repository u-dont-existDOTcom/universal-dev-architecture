import type { WorkerState } from "./projection";
import { receiptHasTrustedSetterEvidence } from "./work-task-creation-evidence";
import { internalSupervisorRoutePrefix, supervisoryCycleRoutePrefix } from "./supervision-admission-runtime";
import { requestBoundRoutePrefix } from "./request-bound-supervision";
import { launchSelectionFor, workExecutionProfilesEqual } from "./work-execution-profile";

export type FinalResponseGateDecision =
  | "ALLOW_ROOT_CLOSE"
  | "ALLOW_OWNER_CANCELLATION"
  | "ALLOW_REASONING_HANDOFF_PAUSE"
  | "ALLOW_OWNER_DECISION_PAUSE"
  | "ALLOW_EXTERNAL_BLOCKED_PAUSE"
  | "REJECT_SAFE_WORK_REMAINS"
  | "REJECT_RECOVERABLE_WAIT_TERMINALIZATION"
  | "REJECT_UNROUTED_REASONING_STOP"
  | "REJECT_SELF_OWNED_BLOCKER"
  | "REJECT_BLOCKER_WITH_WORKAROUND"
  | "REJECT_OWNER_DECISION_AUTHORITY_MISSING"
  | "REJECT_UNVERIFIED_BLOCKED_STATE"
  | "REJECT_TERMINAL_PROOF_MISSING"
  | "WORK_EXECUTION_PROFILE_MISMATCH"
  | "WORK_EXECUTION_PROFILE_UNVERIFIABLE"
  | "REJECT_INVALID_EXECUTION_DIRECTIVE_PROVENANCE"
  | "REJECT_MISSING_WORK_EXECUTION_PROFILE"
  | "REJECT_UNAUTHORIZED_WORK_EXECUTION_PROFILE_ESCALATION";

export interface FinalResponseGateResult {
  allowed: boolean;
  terminalResponseAllowed: boolean;
  mustContinue: boolean;
  decision: FinalResponseGateDecision;
  reasonCodes: string[];
  requiredNextAction: string;
  terminalStateVectorSha256: string;
}

const executableQueueStatuses = new Set(["READY", "IN_PROGRESS"]);
const selfExecutionActors = new Set(["WORKER", "CODEX", "WORK", "AUTHORIZED_EXECUTOR"]);
const recoverableWaitPattern = /cooldown|rate[ -]?limit|provider wait|retry|backoff|temporary|transient/i;

/**
 * Deterministic pre-final gate for Mission Control-managed execution workers.
 *
 * This does not decide scientific, product, policy, or owner intent. It only
 * prevents a worker from converting routine response/session closure into task
 * terminalization while durable Mission Control state still says work can
 * continue.
 */
export function evaluateFinalResponseAdmission(worker: WorkerState): FinalResponseGateResult {
  const terminalHash = worker.terminal.stateVectorSha256;

  if (worker.terminal.decision !== "ALLOW_OWNER_CANCELLATION") {
    const profileRejection = executionProfileRejection(worker, terminalHash);
    if (profileRejection) return profileRejection;
  }

  if (worker.terminal.rootTerminalizationAllowed) {
    return allow(
      worker.terminal.decision === "ALLOW_OWNER_CANCELLATION" ? "ALLOW_OWNER_CANCELLATION" : "ALLOW_ROOT_CLOSE",
      worker.terminal.decision === "ALLOW_OWNER_CANCELLATION"
        ? ["Mission Control has a current source-bound owner cancellation terminal state."]
        : ["Mission Control has a current source-bound root completion terminal state."],
      "Return the terminal response using the already-admitted completion or cancellation state; do not broaden the claim.",
      terminalHash,
    );
  }

  const activeQueue = worker.channel.queue.filter((item) => executableQueueStatuses.has(item.status));
  const timeline = worker.timeline ?? [];
  const latestInternalRouteEvent = timeline
    .filter((event) => (
      event.data.type === "worker_message_recorded"
        && event.data.message_kind === "QUESTION"
        && (event.data.body.startsWith(internalSupervisorRoutePrefix)
          || event.data.body.startsWith(supervisoryCycleRoutePrefix)
          || event.data.body.startsWith(requestBoundRoutePrefix))
      || event.data.type === "reasoning_review_route_recorded"
        && event.data.body.startsWith(requestBoundRoutePrefix)
    ))
    .sort((left, right) => right.sequence - left.sequence)[0];
  const latestExecutionReceiptEvent = timeline
    .filter((event) => event.data.type === "execution_receipt_recorded"
      || event.data.type === "chatgpt_work_cloud_execution_receipt_recorded")
    .sort((left, right) => right.sequence - left.sequence)[0];
  const reasoningStopped = ["STOPPED_FOR_REASONING_REVIEW", "PARKED"].includes(worker.executionSupervision.codexExecutionState)
    && worker.executionSupervision.pendingReasoningReview;
  const currentReasoningRoute = Boolean(latestInternalRouteEvent
    && (!latestExecutionReceiptEvent || latestInternalRouteEvent.sequence > latestExecutionReceiptEvent.sequence));

  if (reasoningStopped) {
    if (!currentReasoningRoute) {
      return reject(
        "REJECT_UNROUTED_REASONING_STOP",
        [
          "Execution stopped for a required reasoning review, but no current post-receipt internal supervisor route is durably recorded.",
          "A prior/stale route cannot satisfy a new reasoning stop.",
          "A stop boundary is a control-plane handoff, not permission to hand the unfinished task back to the owner.",
        ],
        "Route the exact factual receipt to the configured reasoning chat automatically, then remain resumable for the next source-bound directive.",
        terminalHash,
      );
    }
    return allow(
      "ALLOW_REASONING_HANDOFF_PAUSE",
      [
        "The current directive-bound execution has stopped for reasoning review.",
        "A post-receipt factual route is durably recorded in the internal supervisor channel.",
      ],
      "End only the current execution turn while the task remains open; resume automatically when the next admitted directive arrives.",
      terminalHash,
    );
  }

  if (worker.terminal.unresolvedOwnerObligation && activeQueue.length === 0) {
    return allow(
      "ALLOW_OWNER_DECISION_PAUSE",
      ["Mission Control has a current unresolved owner obligation and no independently executable queued work remains."],
      "Ask only for the exact owner decision already identified by Mission Control; preserve all other task state as open.",
      terminalHash,
    );
  }

  const blocker = worker.channel.blockers[0];
  if (blocker) {
    if (blocker.workaround?.trim()) {
      return reject(
        "REJECT_BLOCKER_WITH_WORKAROUND",
        [
          `Open blocker ${blocker.blockerId} declares an available workaround.`,
          "A blocker with an admitted workaround is not a terminal condition.",
        ],
        `Continue with the recorded workaround: ${blocker.workaround}`,
        terminalHash,
      );
    }
    if (activeQueue.length > 0) {
      return reject(
        "REJECT_SAFE_WORK_REMAINS",
        [
          `Open blocker ${blocker.blockerId} exists, but ${activeQueue.length} READY/IN_PROGRESS queue item(s) remain executable.`,
          "Independent safe work must advance before a blocked return is admitted.",
        ],
        queueNextAction(activeQueue),
        terminalHash,
      );
    }
    const actorKind = blocker.requiredActor.kind.toUpperCase();
    if (selfExecutionActors.has(actorKind)) {
      return reject(
        "REJECT_SELF_OWNED_BLOCKER",
        [
          `Open blocker ${blocker.blockerId} is still owned by execution actor ${blocker.requiredActor.kind}.`,
          "A worker-owned implementation problem is unfinished work, not an external terminal boundary.",
        ],
        "Continue bounded diagnosis/repair or route a genuinely semantic decision to the reasoning chat.",
        terminalHash,
      );
    }
    if (recoverableWaitPattern.test(`${blocker.title} ${blocker.description} ${blocker.impact}`) && !blocker.needsOwner) {
      return reject(
        "REJECT_RECOVERABLE_WAIT_TERMINALIZATION",
        [
          `Open blocker ${blocker.blockerId} is a recoverable provider/cooldown/retry condition.`,
          "Cooldowns, provider waits, backoff, and temporary tool limits are recovery events rather than task terminal states.",
        ],
        "Advance any independent safe in-scope work and keep checking the admitted wait condition at the configured interval/horizon.",
        terminalHash,
      );
    }
    if (blocker.needsOwner && !worker.terminal.unresolvedOwnerObligation) {
      return reject(
        "REJECT_OWNER_DECISION_AUTHORITY_MISSING",
        [
          `Open blocker ${blocker.blockerId} asserts that the owner is needed, but the authoritative terminal projection has no current owner obligation.`,
          "A worker-authored blocker cannot manufacture owner-decision authority.",
        ],
        "Route the exact factual ambiguity to the authorized reasoning surface or continue other admitted work; do not ask the owner yet.",
        terminalHash,
      );
    }
    const reasoningActor = /CHAT|SUPERVISOR|PROJECT_MANAGER/.test(actorKind);
    if (reasoningActor) {
      const blockerEvent = timeline.find((event) => event.data.type === "structured_blocker_recorded"
        && event.data.blocker_id === blocker.blockerId);
      const routeAfterBlocker = Boolean(latestInternalRouteEvent && blockerEvent
        && latestInternalRouteEvent.sequence > blockerEvent.sequence);
      if (!routeAfterBlocker) {
        return reject(
          "REJECT_UNROUTED_REASONING_STOP",
          [
            `Open blocker ${blocker.blockerId} requires ${blocker.requiredActor.kind}, but no later durable internal supervisor route is recorded.`,
            "A stale route from an earlier reasoning cycle cannot satisfy the current blocker.",
          ],
          "Route the exact blocker facts automatically to the configured reasoning chat before ending the execution turn.",
          terminalHash,
        );
      }
    }
    return allow(
      blocker.needsOwner ? "ALLOW_OWNER_DECISION_PAUSE" : "ALLOW_EXTERNAL_BLOCKED_PAUSE",
      [
        `Open blocker ${blocker.blockerId} is owned by ${blocker.requiredActor.kind}, not by the execution worker.`,
        "No independently executable READY/IN_PROGRESS queue item or admitted workaround remains.",
      ],
      blocker.needsOwner
        ? "Return only the exact owner action required by the current Mission Control owner obligation; keep the task open."
        : "End only the current execution turn with the source-bound blocker recorded; keep the task open and resume automatically when the blocking condition clears.",
      terminalHash,
    );
  }

  const durableNextStepKnown = worker.nextSteps.some((step) => step.trim().length > 0);
  if (activeQueue.length > 0 || durableNextStepKnown || worker.terminal.decision === "CONTINUE_WORK") {
    return reject(
      "REJECT_SAFE_WORK_REMAINS",
      [
        ...(activeQueue.length > 0 ? [`${activeQueue.length} READY/IN_PROGRESS queue item(s) remain.`] : []),
        ...(durableNextStepKnown ? ["The durable worker checkpoint still declares one or more next steps."] : []),
        ...(worker.terminal.decision === "CONTINUE_WORK" ? ["The current Mission Control terminal comparator says CONTINUE_WORK."] : []),
        "Context pressure, response closure, checkpoint commits, browser cleanup, and similar recovery boundaries cannot substitute for task completion.",
      ],
      activeQueue.length > 0 ? queueNextAction(activeQueue) : worker.nextSteps[0] ?? worker.terminal.requiredDirective,
      terminalHash,
    );
  }

  if (worker.status === "blocked") {
    return reject(
      "REJECT_UNVERIFIED_BLOCKED_STATE",
      [
        "The worker checkpoint says blocked, but no current structured blocker, owner obligation, or routed directive stop proves a legitimate terminal pause.",
      ],
      "Reconcile the active-task lock, current-state checkpoint, and live artifact ledger; record the exact blocker or continue the next safe action.",
      terminalHash,
    );
  }

  return reject(
    "REJECT_TERMINAL_PROOF_MISSING",
    [
      "No Mission Control terminal proof, authoritative blocker, routed reasoning stop, or owner obligation permits a terminal response.",
    ],
    "Reconcile durable task state and continue automatically from the next safe in-scope action.",
    terminalHash,
  );
}

function executionProfileRejection(
  worker: WorkerState,
  terminalHash: string,
): FinalResponseGateResult | null {
  const timeline = worker.timeline ?? [];
  const directiveEvent = timeline.find((event) => event.data.type === "execution_directive_recorded");
  const directive = directiveEvent?.data;
  if (!directive || directive.type !== "execution_directive_recorded" || directive.directive_schema_version !== 3) return null;
  if (directive.execution_surface === "CHATGPT_WORK_CLOUD") {
    const dispatchResult = [...timeline].reverse().find((event) => event.data.type === "chatgpt_work_cloud_dispatch_recorded"
      && event.data.directive_id === directive.directive_id
      && event.data.directive_revision === directive.directive_revision)?.data;
    const workReceipt = [...timeline].reverse().find((event) => event.data.type === "chatgpt_work_cloud_execution_receipt_recorded"
      && event.data.directive_id === directive.directive_id
      && event.data.directive_revision === directive.directive_revision)?.data;
    if (dispatchResult?.type !== "chatgpt_work_cloud_dispatch_recorded"
      || dispatchResult.status !== "READY"
      || !["VERIFIED_NATIVE_WORK", "SOURCE_ATTESTED_NATIVE_WORK"].includes(dispatchResult.surface_verification)
      || workReceipt?.type !== "chatgpt_work_cloud_execution_receipt_recorded"
      || workReceipt.work_thread_id !== dispatchResult.work_thread_id) {
      return reject(
        "REJECT_TERMINAL_PROOF_MISSING",
        ["The current native ChatGPT Work directive has no exact ready dispatch plus source-bound native Work execution receipt."],
        "Wait for or repair the exact native Work dispatch/execution receipt before finalization.",
        terminalHash,
      );
    }
    return null;
  }
  const receiptEvent = timeline.find((event) => event.data.type === "execution_receipt_recorded"
    && event.data.directive_id === directive.directive_id
    && event.data.directive_revision === directive.directive_revision);
  const receipt = receiptEvent?.data;
  if (!receipt || receipt.type !== "execution_receipt_recorded"
    || receipt.receipt_schema_version !== 3
    || receipt.work_execution === "LEGACY_MODEL_PROFILE_UNSPECIFIED") {
    return reject(
      "REJECT_MISSING_WORK_EXECUTION_PROFILE",
      ["The current version 3 execution directive has no version 3 receipt with a Work execution profile binding."],
      "Record the exact requested, authorized, observed, preflight, and final Work profile facts before finalization.",
      terminalHash,
    );
  }
  const binding = receipt.work_execution;
  if (!receiptEvent || !receiptHasTrustedSetterEvidence(receiptEvent, timeline)) {
    return reject("WORK_EXECUTION_PROFILE_UNVERIFIABLE",
      ["TRUSTED_TASK_CREATION_SETTER_EVIDENCE_REQUIRED"],
      "Worker self-report cannot prove task-creation setters reached the provider boundary.", terminalHash);
  }
  const authorizationEvent = timeline.find((event) => event.data.type === "work_execution_profile_authorized"
    && event.data.authorization_id === binding.authorization_id);
  const authorization = authorizationEvent?.data;
  if (!authorization || authorization.type !== "work_execution_profile_authorized"
    || directive.directive_artifact_sha256 === null
    || directive.source_message_id === null
    || directive.source_body_sha256 === null
    || authorization.directive_id !== directive.directive_id
    || authorization.directive_revision !== directive.directive_revision
    || authorization.task_id !== directive.task_id
    || authorization.directive_artifact_sha256 !== directive.directive_artifact_sha256
    || authorization.source_message_id !== directive.source_message_id
    || authorization.source_body_sha256 !== directive.source_body_sha256
    || !workExecutionProfilesEqual(authorization.authorized_profile, binding.authorized_profile)) {
    return reject(
      "REJECT_INVALID_EXECUTION_DIRECTIVE_PROVENANCE",
      ["The receipt authorization does not bind the current durable directive artifact, source-message provenance, identity, revision, task, and profile."],
      "Do not finalize from a worker-supplied digest; repair the current execution_directive_recorded provenance binding.",
      terminalHash,
    );
  }
  const requiredSelection = launchSelectionFor(binding.authorized_profile);
  const applicationMismatch = (
    (binding.observability.model === "SET_ONLY" || binding.observability.model === "SET_AND_VERIFY")
      && binding.applied_selection?.model !== requiredSelection.model
  ) || (
    (binding.observability.effort === "SET_ONLY" || binding.observability.effort === "SET_AND_VERIFY")
      && binding.applied_selection?.thinking !== requiredSelection.thinking
  ) || (
    binding.applied_selection?.fastModeRequest !== requiredSelection.fastModeRequest
  );
  const observedMismatch = (
    binding.observed_profile.model !== null
      && binding.observed_profile.model !== binding.authorized_profile.model
  ) || (
    binding.observed_profile.effort !== null
      && binding.observed_profile.effort !== binding.authorized_profile.effort
  ) || (
    binding.observed_profile.fastMode !== null
      && binding.observed_profile.fastMode !== (binding.authorized_profile.fastModeRequest === "ENABLE_FAST")
  );
  if (!workExecutionProfilesEqual(binding.requested_profile, binding.authorized_profile)
    || applicationMismatch
    || observedMismatch
    || binding.preflight === "MISMATCH"
    || binding.preflight_decision === "WORK_EXECUTION_PROFILE_MISMATCH"
    || !binding.final_profile
    || !workExecutionProfilesEqual(
      binding.final_profile,
      binding.escalations.at(-1)?.to_profile ?? binding.authorized_profile,
    )
    || binding.fast_mode_observed !== binding.observed_profile.fastMode) {
    return reject(
      "WORK_EXECUTION_PROFILE_MISMATCH",
      ["The execution receipt proves a requested/authorized/observed/final Work profile mismatch."],
      "Do not claim successful bounded execution; obtain a new exact source-bound profile and rerun preflight.",
      terminalHash,
    );
  }
  const missingObservableReadback = (
    (binding.observability.model === "VERIFY_ONLY" || binding.observability.model === "SET_AND_VERIFY")
      && binding.observed_profile.model === null
  ) || (
    (binding.observability.effort === "VERIFY_ONLY" || binding.observability.effort === "SET_AND_VERIFY")
      && binding.observed_profile.effort === null
  ) || (
    (binding.observability.fastMode === "VERIFY_ONLY" || binding.observability.fastMode === "SET_AND_VERIFY")
      && binding.observed_profile.fastMode === null
  );
  if (binding.preflight === "UNVERIFIABLE"
    || binding.preflight_decision === "WORK_EXECUTION_PROFILE_UNVERIFIABLE"
    || missingObservableReadback
    || binding.authorized_profile.assuranceRequirement === "INDEPENDENT_READBACK_REQUIRED"
      && !["SET_AND_VERIFIED", "INDEPENDENTLY_VERIFIED"].includes(binding.model_identity_evidence)) {
    return reject(
      "WORK_EXECUTION_PROFILE_UNVERIFIABLE",
      ["At least one materially required Work profile field was not independently verifiable."],
      "Keep the execution closed and record the exact product-surface limitation; do not infer a model, effort, or Fast state.",
      terminalHash,
    );
  }
  for (const escalation of binding.escalations) {
    const authorization = timeline.find((event) => event.data.type === "work_execution_profile_authorized"
      && event.data.authorization_id === escalation.authorization_id)?.data;
    if (!authorization || authorization.type !== "work_execution_profile_authorized"
      || !workExecutionProfilesEqual(authorization.authorized_profile, escalation.to_profile)) {
      return reject(
        "REJECT_UNAUTHORIZED_WORK_EXECUTION_PROFILE_ESCALATION",
        ["A model/effort change lacks a new source-bound Chat authorization."],
        "Stop at the current authorized profile and route the failure evidence to Chat; Work cannot self-escalate.",
        terminalHash,
      );
    }
  }
  return null;
}

function queueNextAction(items: WorkerState["channel"]["queue"]): string {
  const next = [...items].sort((left, right) => left.ordinal - right.ordinal)[0];
  return next ? `Continue queue item ${next.ordinal}: ${next.title}` : "Continue the next admitted in-scope action.";
}

function allow(
  decision: FinalResponseGateDecision,
  reasonCodes: string[],
  requiredNextAction: string,
  terminalStateVectorSha256: string,
): FinalResponseGateResult {
  return {
    allowed: true,
    terminalResponseAllowed: true,
    mustContinue: false,
    decision,
    reasonCodes,
    requiredNextAction,
    terminalStateVectorSha256,
  };
}

function reject(
  decision: FinalResponseGateDecision,
  reasonCodes: string[],
  requiredNextAction: string,
  terminalStateVectorSha256: string,
): FinalResponseGateResult {
  return {
    allowed: false,
    terminalResponseAllowed: false,
    mustContinue: true,
    decision,
    reasonCodes,
    requiredNextAction,
    terminalStateVectorSha256,
  };
}
