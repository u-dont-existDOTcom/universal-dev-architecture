import type { WorkerState } from "./projection";
import { internalSupervisorRoutePrefix, supervisoryCycleRoutePrefix } from "./supervision-admission-runtime";

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
  | "REJECT_UNVERIFIED_BLOCKED_STATE"
  | "REJECT_TERMINAL_PROOF_MISSING";

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
  const latestInternalRoute = [...worker.channel.messages].reverse().find((message) =>
    message.author === "WORKER"
      && message.kind === "QUESTION"
      && (message.body.startsWith(internalSupervisorRoutePrefix) || message.body.startsWith(supervisoryCycleRoutePrefix)));
  const reasoningStopped = ["STOPPED_FOR_REASONING_REVIEW", "PARKED"].includes(worker.executionSupervision.codexExecutionState)
    && worker.executionSupervision.pendingReasoningReview;

  if (reasoningStopped) {
    if (!latestInternalRoute) {
      return reject(
        "REJECT_UNROUTED_REASONING_STOP",
        [
          "Execution stopped for a required reasoning review, but no current internal supervisor route is durably recorded.",
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
        "The factual state has already been routed through the durable internal supervisor channel.",
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
    const reasoningActor = /CHAT|SUPERVISOR|PROJECT_MANAGER/.test(actorKind);
    if (reasoningActor && !latestInternalRoute) {
      return reject(
        "REJECT_UNROUTED_REASONING_STOP",
        [
          `Open blocker ${blocker.blockerId} requires ${blocker.requiredActor.kind}, but no durable internal supervisor route is recorded.`,
        ],
        "Route the exact blocker facts automatically to the configured reasoning chat before ending the execution turn.",
        terminalHash,
      );
    }
    return allow(
      blocker.needsOwner ? "ALLOW_OWNER_DECISION_PAUSE" : "ALLOW_EXTERNAL_BLOCKED_PAUSE",
      [
        `Open blocker ${blocker.blockerId} is owned by ${blocker.requiredActor.kind}, not by the execution worker.`,
        "No independently executable READY/IN_PROGRESS queue item or admitted workaround remains.",
      ],
      blocker.needsOwner
        ? "Return only the exact owner action required by the structured blocker; keep the task open."
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
