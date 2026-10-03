import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { canonicalJson, sha256 } from "./canonical";
import { contractOwnerAlignmentSchema, outcomeAdvancementSchema, ownerActionTypeSchema, strategyEfficacySchema } from "./schema";
import type { JevShadowObservation } from "./jev-shadow";

export const JEV_NEXT_ACTIONS = ["hold_integrity", "stop_terminal", "notify_owner", "wait_external",
  "continue_mechanical", "route_reasoning", "no_action_healthy"] as const;
const expectations = {
  PROJECT_INTEGRITY_FAILURE: "hold_integrity", TERMINAL: "stop_terminal", OWNER_ACTION_REQUIRED: "notify_owner",
  BLOCKED_EXTERNAL: "wait_external", MECHANICAL_RECOVERY_ELIGIBLE: "continue_mechanical",
  REASONING_REVIEW_OVERDUE: "route_reasoning", STALLED_OR_REGRESSING: "route_reasoning",
  WORKER_DIRECTIVE_CONTINUITY_GAP: "route_reasoning", HEALTHY_ADVANCING: "no_action_healthy",
} as const;

const stateSchema = z.object({
  chain_valid: z.boolean(), queue_terminal: z.boolean(), owner_action_kind: ownerActionTypeSchema,
  open_blocker_present: z.boolean(), blocker_actor_kind: z.enum(["NONE", "OWNER", "WORKER", "SUPERVISOR", "SYSTEM", "EXTERNAL"]),
  delivery_status: z.enum(["NONE", "QUEUED", "DELIVERY_ATTEMPTED", "DELIVERED", "DELIVERY_FAILED", "EXPIRED", "SUPERSEDED"]),
  delivery_error_family: z.enum(["NONE", "PRE_SEND", "PROCESS", "RATE_LIMIT", "AUTH", "OTHER"]),
  contract_owner_alignment: contractOwnerAlignmentSchema, outcome_advancement: outcomeAdvancementSchema,
  strategy_efficacy: strategyEfficacySchema, correction_owner_action_type: ownerActionTypeSchema,
  pending_reasoning_review: z.boolean(), review_freshness: z.enum(["CURRENT", "OVERDUE", "UNKNOWN"]),
  active_directive_present: z.boolean(),
  execution_state: z.enum(["PARKED", "STOPPED_FOR_REASONING_REVIEW", "RUNNING_WITH_DIRECTIVE", "NOT_STARTED", "UNKNOWN_LEGACY_EXECUTION"]),
});
const probability = z.number().min(0).max(1);
const noul = z.object({ noul: z.union([probability, z.boolean()]) });
const actionProbabilities = z.object(Object.fromEntries(JEV_NEXT_ACTIONS.map((action) => [action, probability.optional()])));
const choice = z.object({
  choice: z.union([z.enum(JEV_NEXT_ACTIONS), actionProbabilities]),
  probabilities: actionProbabilities.optional(), confidence: probability.optional(),
});
export const jevShadowAnswersSchema = z.object({
  next_action: choice.optional(), owner_decision_required: noul.optional(),
  engineering_blocker: noul.optional(), stalled_or_regressing: noul.optional(),
  consequence_level: z.object({ score: z.number().finite(),
    probabilities: z.object({ "0": probability.optional(), "1": probability.optional(), "2": probability.optional(), "3": probability.optional() }).optional(),
    confidence: probability.optional(),
  }).optional(),
});
const observationSchema = z.object({
  status: z.enum(["DISABLED", "MISSING_API_KEY", "OK", "ERROR"]), authoritative: z.literal(false),
  deterministic_trigger: z.enum(Object.keys(expectations) as [keyof typeof expectations, ...Array<keyof typeof expectations>]),
  model: z.string().min(1).max(200), provider: z.string().min(1).max(200).optional(),
  response_id: z.string().min(1).max(300).optional(),
  error_code: z.enum(["STATE_BUILD_ERROR", "TIMEOUT", "HTTP_ERROR", "INVALID_RESPONSE", "TRANSPORT_ERROR", "HOOK_ERROR", "HOOK_TIMEOUT"]).optional(),
  state: stateSchema.optional(), answers: jevShadowAnswersSchema.optional(),
  latency_ms: z.number().finite().nonnegative().optional(),
  usage: z.object({ input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(), cost: z.number().finite().nonnegative().optional() }).optional(),
});

export interface JevShadowRecordInput {
  observedAt?: string;
  source: "LIVE" | "LOG_IMPORT";
  projectId?: string | null;
  observation: JevShadowObservation;
}

export function sanitizeJevShadowObservation(input: unknown): JevShadowObservation {
  return observationSchema.parse(input);
}

export function initializeJevShadowTelemetry(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS jev_shadow_observations (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    observed_at TEXT NOT NULL, source TEXT NOT NULL CHECK (source IN ('LIVE', 'LOG_IMPORT')),
    project_id TEXT, deterministic_trigger TEXT NOT NULL, status TEXT NOT NULL, error_code TEXT,
    model TEXT NOT NULL, provider TEXT, response_id TEXT, latency_ms REAL,
    input_tokens INTEGER, output_tokens INTEGER, cost_usd REAL,
    jev_next_action TEXT, jev_owner_decision_required INTEGER, expected_next_action TEXT NOT NULL,
    agrees INTEGER, expected_owner_decision_required INTEGER,
    state_fingerprint TEXT, state_json TEXT, answers_json TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS jev_shadow_response_id
    ON jev_shadow_observations(response_id) WHERE response_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS jev_shadow_without_response_id_v2
    ON jev_shadow_observations(observed_at, deterministic_trigger, status, COALESCE(error_code, ''),
      COALESCE(project_id, ''), model, COALESCE(provider, ''), COALESCE(state_fingerprint, ''), COALESCE(answers_json, ''))
    WHERE response_id IS NULL;
  DROP INDEX IF EXISTS jev_shadow_without_response_id;
  CREATE INDEX IF NOT EXISTS jev_shadow_observed_at ON jev_shadow_observations(observed_at);`);
}

export function recordJevShadowObservation(db: DatabaseSync, input: JevShadowRecordInput): boolean {
  // Reconstruct allowlisted JSON at the persistence boundary, including imports.
  const observation = observationSchema.parse(input.observation);
  if (observation.status === "DISABLED") return false;
  const observedAt = input.observedAt ?? new Date().toISOString();
  z.string().datetime({ offset: true }).parse(observedAt);
  if (input.source !== "LIVE" && input.source !== "LOG_IMPORT") throw new TypeError("Invalid Jev telemetry source.");
  const state = observation.state;
  const answers = observation.answers;
  const selectedAction = answers?.next_action?.choice;
  const actionScores = Object.entries(typeof selectedAction === "object" ? selectedAction : {})
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(([left, a], [right, b]) => b - a || left.localeCompare(right));
  const jevAction = typeof selectedAction === "string" ? selectedAction : actionScores[0]?.[0] ?? null;
  const ownerScore = answers?.owner_decision_required?.noul;
  const jevOwner = typeof ownerScore === "boolean" ? ownerScore : typeof ownerScore === "number" ? ownerScore >= 0.5 : null;
  const expectedOwner = state ? ["DECISION_REQUIRED", "MANUAL_INTERVENTION_REQUIRED"].includes(state.owner_action_kind)
    || state.open_blocker_present && state.blocker_actor_kind === "OWNER"
    || state.correction_owner_action_type === "DECISION_REQUIRED" : null;
  const expectedAction = expectations[observation.deterministic_trigger];
  const stateJson = state ? canonicalJson(state) : null;
  const bit = (value: boolean | null) => value === null ? null : Number(value);
  const changed = db.prepare(`INSERT OR IGNORE INTO jev_shadow_observations (
    observed_at, source, project_id, deterministic_trigger, status, error_code, model, provider, response_id,
    latency_ms, input_tokens, output_tokens, cost_usd, jev_next_action, jev_owner_decision_required,
    expected_next_action, agrees, expected_owner_decision_required, state_fingerprint, state_json, answers_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    observedAt, input.source, input.source === "LIVE" ? input.projectId ?? null : null,
    observation.deterministic_trigger, observation.status, observation.error_code ?? null, observation.model,
    observation.provider ?? null, observation.response_id ?? null, input.source === "LIVE" ? observation.latency_ms ?? null : null,
    observation.usage?.input_tokens ?? null, observation.usage?.output_tokens ?? null, observation.usage?.cost ?? null,
    jevAction, bit(jevOwner), expectedAction, observation.status === "OK" && jevAction !== null ? Number(jevAction === expectedAction) : null,
    bit(expectedOwner), stateJson === null ? null : sha256(stateJson), stateJson, answers ? canonicalJson(answers) : null,
  );
  return Number(changed.changes) === 1;
}

interface SummaryRow {
  observed_at: string; source: string; deterministic_trigger: string; status: string; error_code: string | null;
  latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; cost_usd: number | null;
  jev_next_action: string | null; jev_owner_decision_required: number | null;
  agrees: number | null; expected_owner_decision_required: number | null; state_fingerprint: string | null;
}

export function jevShadowSummary(db: DatabaseSync) {
  // Read only comparison metadata; never load state or answer bodies for summaries.
  const rows = db.prepare(`SELECT observed_at, source, deterministic_trigger, status, error_code,
    latency_ms, input_tokens, output_tokens, cost_usd, jev_next_action, jev_owner_decision_required,
    agrees, expected_owner_decision_required, state_fingerprint
    FROM jev_shadow_observations ORDER BY julianday(observed_at), observed_at, sequence`).all() as unknown as SummaryRow[];
  const bySource: Record<string, number> = { LIVE: 0, LOG_IMPORT: 0 };
  const byStatus: Record<string, number> = { OK: 0, ERROR: 0, MISSING_API_KEY: 0 };
  const byErrorCode: Record<string, number> = {};
  const byTrigger: Record<string, { n: number; agreeing: number; rate: number }> = {};
  const pairs = new Map<string, { trigger: string; jevAction: string | null; count: number }>();
  const states = new Set<string>();
  const latencies: number[] = [];
  const checkpoints = [25, 100, 500].map((n) => ({ n, okComparisonsReachedAt: null as string | null, distinctStatesReachedAt: null as string | null }));
  let ok = 0, agreeing = 0, expectedTrue = 0, falsePositives = 0, misses = 0, ownerComparisons = 0;
  let totalUsd = 0, inputTokens = 0, outputTokens = 0;
  const increment = (counts: Record<string, number>, key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  for (const row of rows) {
    increment(bySource, row.source); increment(byStatus, row.status); increment(byErrorCode, row.error_code ?? "NONE");
    totalUsd += row.cost_usd ?? 0; inputTokens += row.input_tokens ?? 0; outputTokens += row.output_tokens ?? 0;
    if (row.expected_owner_decision_required === 1) expectedTrue += 1;
    if (row.status === "OK" && row.expected_owner_decision_required !== null && row.jev_owner_decision_required !== null) {
      ownerComparisons += 1;
      if (row.expected_owner_decision_required === 0 && row.jev_owner_decision_required === 1) falsePositives += 1;
      if (row.expected_owner_decision_required === 1 && row.jev_owner_decision_required === 0) misses += 1;
    }
    if (row.status === "OK" && row.source === "LIVE" && row.latency_ms !== null) latencies.push(row.latency_ms);
    if (row.status !== "OK" || row.jev_next_action === null || row.agrees === null) continue;
    ok += 1; agreeing += row.agrees ?? 0;
    const trigger = byTrigger[row.deterministic_trigger] ??= { n: 0, agreeing: 0, rate: 0 };
    trigger.n += 1; trigger.agreeing += row.agrees ?? 0; trigger.rate = trigger.agreeing / trigger.n;
    if (!row.agrees) {
      const key = JSON.stringify([row.deterministic_trigger, row.jev_next_action]);
      const pair = pairs.get(key) ?? { trigger: row.deterministic_trigger, jevAction: row.jev_next_action, count: 0 };
      pair.count += 1; pairs.set(key, pair);
    }
    if (row.state_fingerprint) states.add(row.state_fingerprint);
    for (const checkpoint of checkpoints) {
      if (ok >= checkpoint.n && checkpoint.okComparisonsReachedAt === null) checkpoint.okComparisonsReachedAt = row.observed_at;
      if (states.size >= checkpoint.n && checkpoint.distinctStatesReachedAt === null) checkpoint.distinctStatesReachedAt = row.observed_at;
    }
  }
  latencies.sort((a, b) => a - b);
  const percentile = (p: number) => latencies.length ? latencies[Math.ceil(p * latencies.length) - 1] : null;
  return {
    firstObservedAt: rows[0]?.observed_at ?? null, lastObservedAt: rows.at(-1)?.observed_at ?? null,
    counts: { total: rows.length, bySource, byStatus, byErrorCode },
    okComparisons: ok, distinctStateFingerprints: states.size,
    agreement: { n: ok, agreeing, rate: ok ? agreeing / ok : null, byTrigger,
      disagreeingPairs: [...pairs.values()].sort((a, b) => a.trigger.localeCompare(b.trigger) || (a.jevAction ?? "").localeCompare(b.jevAction ?? "")) },
    ownerSignals: { comparisons: ownerComparisons, expectedTrue, falsePositives, misses },
    latency: { count: latencies.length, p50: percentile(0.5), p90: percentile(0.9), p99: percentile(0.99), max: latencies.at(-1) ?? null,
      timeoutCount: (byErrorCode.TIMEOUT ?? 0) + (byErrorCode.HOOK_TIMEOUT ?? 0),
      providerErrorCount: (byErrorCode.HTTP_ERROR ?? 0) + (byErrorCode.TRANSPORT_ERROR ?? 0) + (byErrorCode.INVALID_RESPONSE ?? 0) },
    cost: { totalUsd, per1000CallsUsd: rows.length ? totalUsd / rows.length * 1000 : null,
      calls: rows.length, inputTokens, outputTokens },
    checkpoints,
  };
}
