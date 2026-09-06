import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFinalResponseAdmission } from "../lib/final-response-gate";
import type { WorkerState } from "../lib/projection";
import { internalSupervisorRoutePrefix } from "../lib/supervision-admission-runtime";

function worker(overrides: Record<string, unknown> = {}): WorkerState {
  const base = {
    status: "working",
    nextSteps: [],
    terminal: {
      stateVectorSha256: "a".repeat(64),
      rootTerminalizationAllowed: false,
      decision: "CONTINUE_WORK",
      unresolvedOwnerObligation: false,
      requiredDirective: "Continue the next safe in-scope action.",
    },
    executionSupervision: {
      codexExecutionState: "RUNNING_WITH_DIRECTIVE",
      pendingReasoningReview: false,
    },
    channel: {
      queue: [],
      blockers: [],
      messages: [],
    },
    timeline: [],
  };
  return deepMerge(base, overrides) as unknown as WorkerState;
}

function queueItem(ordinal: number, status = "READY") {
  return {
    worker: "askrigor-mast",
    directionId: "direction:askrigor",
    queueRevisionId: "queue:askrigor:1",
    revision: 1,
    projectId: "askrigor",
    taskId: "askrigor-external-evaluation-contribution-v1",
    itemId: `ordinal:${ordinal}`,
    title: `Run evaluator ordinal ${ordinal}`,
    detail: `Execute the already scheduled evaluator ordinal ${ordinal}.`,
    status,
    priority: "P1",
    ordinal,
    dependsOn: [],
    createdAt: "2026-09-02T22:00:00.000Z",
    updatedAt: "2026-09-02T22:00:00.000Z",
  };
}

function blocker(overrides: Record<string, unknown> = {}) {
  return {
    blockerId: "blocker:provider",
    directionId: "direction:askrigor",
    queueItemId: null,
    status: "OPEN",
    severity: "MATERIAL",
    title: "External provider unavailable",
    description: "The provider is unavailable for this required step.",
    impact: "Required provider-bound work cannot run yet.",
    blockingScope: ["provider-bound-evaluation"],
    workaround: null,
    requiredActor: { kind: "EXTERNAL_PROVIDER", id: "provider:chatgpt" },
    evidenceRefs: ["receipt:provider-unavailable"],
    reportedBy: "worker:askrigor-mast",
    needsOwner: false,
    reportedAt: "2026-09-02T22:00:00.000Z",
    ...overrides,
  };
}

function routeEvent(sequence: number) {
  return {
    sequence,
    data: {
      type: "worker_message_recorded",
      message_kind: "QUESTION",
      body: `${internalSupervisorRoutePrefix}{"packetKind":"FACTUAL_STATE_ONLY"}`,
    },
  };
}

function receiptEvent(sequence: number) {
  return { sequence, data: { type: "execution_receipt_recorded" } };
}

function blockerEvent(sequence: number, blockerId = "blocker:provider") {
  return { sequence, data: { type: "structured_blocker_recorded", blocker_id: blockerId } };
}

test("ordinal 29 checkpoint cannot terminally hand off when ordinal 30 is already scheduled", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: ["Run evaluator ordinal 30."],
    channel: { queue: [queueItem(30)] },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.mustContinue, true);
  assert.equal(result.decision, "REJECT_SAFE_WORK_REMAINS");
  assert.match(result.requiredNextAction, /ordinal 30/i);
});

test("routine durable checkpoint with a known next step is recovery state, not terminal state", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: ["Resume from the next unprocessed ledger ordinal."],
    channel: { queue: [] },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_SAFE_WORK_REMAINS");
  assert.ok(result.reasonCodes.some((reason) => /checkpoint|context pressure/i.test(reason)));
});

test("a bare blocked checkpoint cannot self-authorize a final response", () => {
  const result = evaluateFinalResponseAdmission(worker({
    status: "blocked",
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_UNVERIFIED_BLOCKED_STATE");
});

test("directive stop for reasoning cannot hand off terminally until a post-receipt internal route is durable", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    executionSupervision: { codexExecutionState: "STOPPED_FOR_REASONING_REVIEW", pendingReasoningReview: true },
    timeline: [receiptEvent(20), routeEvent(10)],
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_UNROUTED_REASONING_STOP");
  assert.ok(result.reasonCodes.some((reason) => /stale route/i.test(reason)));
});

test("a routed directive stop may end only the current execution turn while the root task remains open", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    executionSupervision: { codexExecutionState: "STOPPED_FOR_REASONING_REVIEW", pendingReasoningReview: true },
    timeline: [routeEvent(30), receiptEvent(20)],
  }));
  assert.equal(result.terminalResponseAllowed, true);
  assert.equal(result.mustContinue, false);
  assert.equal(result.decision, "ALLOW_REASONING_HANDOFF_PAUSE");
  assert.match(result.requiredNextAction, /task remains open|resume automatically/i);
});

test("an external blocker with a recorded workaround cannot terminalize the task", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    channel: { blockers: [blocker({ workaround: "Use the already admitted secondary browser session." })] },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_BLOCKER_WITH_WORKAROUND");
});

test("cooldown and provider retry waits are recovery events, not terminal conditions", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    channel: { blockers: [blocker({
      title: "Provider cooldown",
      description: "Temporary rate limit; retry after the configured cooldown.",
      impact: "One provider-bound action waits for retry.",
    })] },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_RECOVERABLE_WAIT_TERMINALIZATION");
  assert.match(result.requiredNextAction, /independent safe|checking/i);
});

test("a genuine external blocker may pause only when no independent safe work or workaround remains", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    channel: { blockers: [blocker()] },
  }));
  assert.equal(result.terminalResponseAllowed, true);
  assert.equal(result.decision, "ALLOW_EXTERNAL_BLOCKED_PAUSE");
  assert.match(result.requiredNextAction, /task open|resume automatically/i);
});

test("a blocker owned by the execution worker is unfinished work rather than an external terminal boundary", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    channel: { blockers: [blocker({ requiredActor: { kind: "WORKER", id: "worker:askrigor-mast" } })] },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_SELF_OWNED_BLOCKER");
});

test("a worker blocker cannot manufacture owner-decision authority", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE", unresolvedOwnerObligation: false },
    channel: { blockers: [blocker({ needsOwner: true, requiredActor: { kind: "OWNER", id: "owner:joel" } })] },
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_OWNER_DECISION_AUTHORITY_MISSING");
});

test("a reasoning blocker requires a route later than the current blocker record", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    channel: { blockers: [blocker({ requiredActor: { kind: "SUPERVISOR", id: "chat:askrigor" } })] },
    timeline: [blockerEvent(20), routeEvent(10)],
  }));
  assert.equal(result.terminalResponseAllowed, false);
  assert.equal(result.decision, "REJECT_UNROUTED_REASONING_STOP");
});

test("a current routed reasoning blocker may pause the execution turn without closing the task", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE" },
    channel: { blockers: [blocker({ requiredActor: { kind: "SUPERVISOR", id: "chat:askrigor" } })] },
    timeline: [routeEvent(30), blockerEvent(20)],
  }));
  assert.equal(result.terminalResponseAllowed, true);
  assert.equal(result.decision, "ALLOW_EXTERNAL_BLOCKED_PAUSE");
});

test("a current owner obligation with no safe independent work admits a bounded owner-decision pause", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { decision: "HOLD_COMPLETION_EVIDENCE", unresolvedOwnerObligation: true },
  }));
  assert.equal(result.terminalResponseAllowed, true);
  assert.equal(result.decision, "ALLOW_OWNER_DECISION_PAUSE");
});

test("source-bound root completion remains an admitted terminal response", () => {
  const result = evaluateFinalResponseAdmission(worker({
    nextSteps: [],
    terminal: { rootTerminalizationAllowed: true, decision: "ALLOW_ROOT_CLOSE" },
  }));
  assert.equal(result.terminalResponseAllowed, true);
  assert.equal(result.decision, "ALLOW_ROOT_CLOSE");
});

function deepMerge(left: unknown, right: unknown): unknown {
  if (!left || typeof left !== "object" || Array.isArray(left)
    || !right || typeof right !== "object" || Array.isArray(right)) return right ?? left;
  const output: Record<string, unknown> = { ...(left as Record<string, unknown>) };
  for (const [key, value] of Object.entries(right as Record<string, unknown>)) {
    const prior = output[key];
    output[key] = prior && typeof prior === "object" && !Array.isArray(prior)
      && value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(prior, value)
      : value;
  }
  return output;
}
