import { projectWorker } from "./projection";
import type { StoredEvent } from "./schema";

export const DEFAULT_JEV_SHADOW_MODEL = "typesafe/jev-1.13";
export const OPENROUTER_JEV_DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

export type JevShadowStatus = "DISABLED" | "MISSING_API_KEY" | "OK" | "ERROR";

export interface JevShadowState {
  chain_valid: boolean;
  queue_terminal: boolean;
  owner_action_kind: string;
  open_blocker_present: boolean;
  blocker_actor_kind: string;
  delivery_status: string;
  delivery_error_family: string;
  contract_owner_alignment: string;
  outcome_advancement: string;
  strategy_efficacy: string;
  correction_owner_action_type: string;
  pending_reasoning_review: boolean;
  review_freshness: string;
  active_directive_present: boolean;
  execution_state: string;
}
export interface JevShadowObservation {
  status: JevShadowStatus;
  authoritative: false;
  model: string;
  deterministic_trigger: string;
  state?: JevShadowState;
  answers?: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  provider?: string;
  response_id?: string;
  error_code?: "STATE_BUILD_ERROR" | "TIMEOUT" | "HTTP_ERROR" | "INVALID_RESPONSE" | "TRANSPORT_ERROR" | "HOOK_ERROR";
}

interface JevDecisionRequest {
  model: string;
  state: JevShadowState;
  questions: Record<string, unknown>;
  provider: { allow_fallbacks: boolean };
}

export type JevShadowTransport = (input: {
  apiKey: string;
  body: JevDecisionRequest;
  signal: AbortSignal;
}) => Promise<unknown>;

export interface JevShadowOptions {
  env?: Readonly<Record<string, string | undefined>>;
  transport?: JevShadowTransport;
}
export const MISSION_CONTROL_JEV_QUESTIONS = {
  owner_decision_required: {
    type: "noul",
    instructions: "Does this control state require a substantive owner decision or unavoidable owner-only action before authorized progress can continue?",
    criteria: {
      true: "owner_action_kind is DECISION_REQUIRED or MANUAL_INTERVENTION_REQUIRED; or open_blocker_present is true with blocker_actor_kind OWNER; or correction_owner_action_type is DECISION_REQUIRED.",
      false: "None of those owner-only conditions is present. VERIFY_RESULT alone does not mean a substantive owner decision is required.",
    },
  },
  engineering_blocker: {
    type: "noul",
    instructions: "Is the current nonterminal problem primarily a recoverable engineering or execution-control blocker rather than an owner decision?",
    criteria: {
      true: "The state shows failed/recoverable execution, missing continuity, stale review, or ineffective strategy without an owner-only gate.",
      false: "The state is healthy, terminal, externally blocked, integrity-invalid, or explicitly owner-gated.",
    },
  },
  stalled_or_regressing: {
    type: "noul",
    instructions: "Does the state show stalled, flat, regressing, failed, exhausted, or replacement-required progress?",
    criteria: {
      true: "Outcome advancement or strategy efficacy indicates lack of useful progress.",
      false: "Progress is advancing or the state is terminal/healthy without strategy failure.",
    },
  },
  next_action: {
    type: "choice",
    instructions: "Apply this ordered control policy exactly. First choose hold_integrity if chain_valid is false, contract_owner_alignment is SOURCE_MISSING, or outcome_advancement is UNKNOWN. Otherwise choose stop_terminal if queue_terminal is true. Otherwise choose notify_owner if owner_action_kind is DECISION_REQUIRED or MANUAL_INTERVENTION_REQUIRED, or if open_blocker_present is true and blocker_actor_kind is OWNER. Otherwise choose wait_external if open_blocker_present is true and blocker_actor_kind is EXTERNAL. Otherwise choose continue_mechanical if delivery_status is DELIVERY_FAILED and delivery_error_family is PRE_SEND or PROCESS. Otherwise choose route_reasoning if pending_reasoning_review is true or review_freshness is OVERDUE. Otherwise choose route_reasoning if outcome_advancement is FLAT or REGRESSING, or strategy_efficacy is FAILED, REPLACEMENT_REQUIRED, or EXHAUSTED. Otherwise choose route_reasoning if active_directive_present is false and execution_state is not PARKED. Otherwise choose no_action_healthy.",
    criteria: {
      no_action_healthy: "Healthy authorized progress; no intervention is needed.",
      continue_mechanical: "A bounded mechanical recovery can continue under existing authority.",
      route_reasoning: "The existing reasoning supervisor should review strategy, continuity, or stale reasoning evidence.",
      notify_owner: "A real owner decision or unavoidable owner-only action is required.",
      wait_external: "Progress is blocked on an external actor and no unauthorized retry should occur.",
      stop_terminal: "The project is terminal and periodic supervision should stop.",
      hold_integrity: "Control-plane integrity or owner-outcome validity is indeterminate or invalid.",
    },
  },
  consequence_level: {
    type: "score",
    instructions: "How consequential would acting on the current state be without additional review?",
    criteria: [
      "Observation only or healthy no-op.",
      "Reversible mechanical continuation inside existing authority.",
      "Reasoning or strategy intervention that remains internally supervised.",
      "Owner-gated, external, integrity-sensitive, paid, published, or otherwise consequential action.",
    ],
  },
} as const;

export function buildJevShadowState(events: readonly StoredEvent[], chain: { valid: boolean }): JevShadowState {
  const queue = events.findLast((event) => event.data.type === "work_queue_published")?.data;
  const queueTerminal = queue?.type === "work_queue_published" && queue.items.length > 0
    && queue.items.every((item) => ["DONE", "SUPERSEDED", "CANCELED"].includes(item.status));
  const ownerAction = [...events].reverse()
    .find((event) => "owner_action" in event.data && event.data.owner_action.status === "OPEN")?.data;
  const blocker = events.findLast((event) =>
    event.data.type === "structured_blocker_recorded" && event.data.status === "OPEN")?.data;
  const delivery = events.findLast((event) => event.data.type === "outbound_delivery_lifecycle_recorded")?.data;
  const worker = projectWorker([...events]);

  return {
    chain_valid: chain.valid,
    queue_terminal: Boolean(queueTerminal),
    owner_action_kind: ownerAction && "owner_action" in ownerAction ? ownerAction.owner_action.kind : "NONE",
    open_blocker_present: blocker?.type === "structured_blocker_recorded",
    blocker_actor_kind: blocker?.type === "structured_blocker_recorded" ? blocker.required_actor.kind : "NONE",
    delivery_status: delivery?.type === "outbound_delivery_lifecycle_recorded" ? delivery.status : "NONE",
    delivery_error_family: delivery?.type === "outbound_delivery_lifecycle_recorded"
      ? deliveryErrorFamily(delivery.error_code) : "NONE",
    contract_owner_alignment: worker.contractToOwnerAlignment,
    outcome_advancement: worker.progress.outcomeAdvancement,
    strategy_efficacy: worker.progress.strategyEfficacy,
    correction_owner_action_type: worker.correction.ownerActionType,
    pending_reasoning_review: worker.executionSupervision.pendingReasoningReview,
    review_freshness: worker.executionSupervision.reviewFreshness,
    active_directive_present: Boolean(worker.executionSupervision.activeDirectiveId),
    execution_state: worker.executionSupervision.codexExecutionState,
  };
}
export async function observeFleetSupervisorWithJev(
  deterministicTrigger: string,
  events: readonly StoredEvent[],
  chain: { valid: boolean },
  options: JevShadowOptions = {},
): Promise<JevShadowObservation> {
  const env = options.env ?? process.env;
  const model = env.MISSION_CONTROL_JEV_SHADOW_MODEL?.trim() || DEFAULT_JEV_SHADOW_MODEL;
  if (env.MISSION_CONTROL_JEV_SHADOW_ENABLED !== "1") {
    return { status: "DISABLED", authoritative: false, model, deterministic_trigger: deterministicTrigger };
  }
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return { status: "MISSING_API_KEY", authoritative: false, model, deterministic_trigger: deterministicTrigger };
  }
  let state: JevShadowState;
  try {
    state = buildJevShadowState(events, chain);
  } catch {
    return {
      status: "ERROR", authoritative: false, model, deterministic_trigger: deterministicTrigger,
      error_code: "STATE_BUILD_ERROR",
    };
  }
  const timeoutMs = parseTimeout(env.MISSION_CONTROL_JEV_SHADOW_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const transport = options.transport ?? openRouterJevTransport;

  try {
    const raw = await transport({
      apiKey,
      signal: controller.signal,
      body: { model, state, questions: MISSION_CONTROL_JEV_QUESTIONS, provider: { allow_fallbacks: false } },
    });
    const response = parseJevResponse(raw);
    return {
      status: "OK", authoritative: false, model, deterministic_trigger: deterministicTrigger, state,
      answers: response.answers, usage: response.usage, provider: response.provider, response_id: response.id,
    };
  } catch (error) {
    const errorCode = error instanceof JevHttpError ? "HTTP_ERROR"
      : isAbortError(error) ? "TIMEOUT"
      : error instanceof JevResponseError ? "INVALID_RESPONSE"
      : "TRANSPORT_ERROR";
    return {
      status: "ERROR", authoritative: false, model, deterministic_trigger: deterministicTrigger,
      state, error_code: errorCode,
    };
  } finally {
    clearTimeout(timer);
  }
}

class JevHttpError extends Error {}
class JevResponseError extends Error {}

async function openRouterJevTransport(input: {
  apiKey: string; body: JevDecisionRequest; signal: AbortSignal;
}): Promise<unknown> {
  const response = await fetch(OPENROUTER_JEV_DECISIONS_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
    signal: input.signal,
  });
  if (!response.ok) throw new JevHttpError(`OpenRouter Decisions returned HTTP ${response.status}.`);
  return response.json();
}

function parseJevResponse(raw: unknown): {
  answers: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
  provider?: string;
  id?: string;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new JevResponseError("Response is not an object.");
  const record = raw as Record<string, unknown>;
  if (!record.answers || typeof record.answers !== "object" || Array.isArray(record.answers)) {
    throw new JevResponseError("Response answers are missing.");
  }
  const usage = record.usage && typeof record.usage === "object" && !Array.isArray(record.usage)
    ? record.usage as Record<string, unknown> : undefined;
  return {
    answers: record.answers as Record<string, unknown>,
    usage: usage ? {
      input_tokens: numberOrUndefined(usage.input_tokens),
      output_tokens: numberOrUndefined(usage.output_tokens),
      cost: numberOrUndefined(usage.cost),
    } : undefined,
    provider: typeof record.provider === "string" ? record.provider : undefined,
    id: typeof record.id === "string" ? record.id : undefined,
  };
}

function deliveryErrorFamily(code: string | null): string {
  if (!code) return "NONE";
  if (/^PRE_SEND_/.test(code)) return "PRE_SEND";
  if (/^PROCESS_/.test(code)) return "PROCESS";
  if (/RATE_LIMIT|TOO_MANY/i.test(code)) return "RATE_LIMIT";
  if (/AUTH|TOKEN|CREDENTIAL/i.test(code)) return "AUTH";
  return "OTHER";
}

function parseTimeout(raw: string | undefined): number {
  const value = Number(raw ?? 1500);
  return Number.isInteger(value) && value >= 100 && value <= 10_000 ? value : 1500;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
