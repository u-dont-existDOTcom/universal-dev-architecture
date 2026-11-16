/**
 * Private, read-only export of Mission Control's distinct real Jev control states for the independent V2 test
 * (docs/JEV-INDEPENDENT-V2-EVALUATION.md). It opens the database read-only, so it can run inside the live container
 * next to the daemon without taking the writer lock. JSON lines on stdout, one "kind" per line:
 *   blind           case_id, state_fingerprint, cohort, prompt_version, state (the 15 allowlisted facts)
 *   packet          case_id, jev_request (V2 questions: no deterministic answer key or trigger)
 *   reconciliation  case_id, deterministic triggers and actions, historical V1 counts; read only after gold
 *                   labels are frozen
 *   summary         counts only
 * It prints no project identifier, prompt, answer body or per-observation time, and makes no provider call.
 * Every case is CONFIRMATION: the V2 questions are frozen at JEV_INDEPENDENT_EVAL_VERSION and no case tunes them.
 */
import { DatabaseSync } from "node:sqlite";
import { buildIndependentJevRequest, JEV_INDEPENDENT_EVAL_VERSION, sanitizeIndependentJevState } from "../lib/jev-independent-eval";
import type { JevShadowState } from "../lib/jev-shadow";
import { JEV_DETERMINISTIC_ACTION_BY_TRIGGER } from "../lib/jev-shadow-telemetry";

const STATE_FIELDS = ["chain_valid", "queue_terminal", "owner_action_kind", "open_blocker_present", "blocker_actor_kind",
  "delivery_status", "delivery_error_family", "contract_owner_alignment", "outcome_advancement", "strategy_efficacy",
  "correction_owner_action_type", "pending_reasoning_review", "review_freshness", "active_directive_present",
  "execution_state"] as const;

interface Row { deterministic_trigger: string; status: string; jev_next_action: string | null; state_fingerprint: string; state_json: string }

export function exportJevV2Cases(db: DatabaseSync): Array<Record<string, unknown>> {
  const rows = db.prepare(`SELECT deterministic_trigger, status, jev_next_action, state_fingerprint, state_json
    FROM jev_shadow_observations WHERE state_fingerprint IS NOT NULL AND state_json IS NOT NULL
    ORDER BY sequence`).all() as unknown as Row[];
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.state_fingerprint, [...(groups.get(row.state_fingerprint) ?? []), row]);
  const out: Array<Record<string, unknown>> = [];
  let ambiguousBaseline = 0;
  for (const [fingerprint, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = JSON.parse(group[0].state_json) as Record<string, unknown>;
    if (STATE_FIELDS.some((field) => !(field in parsed))) throw new Error("A stored state lacks an allowlisted field.");
    if (group.some((row) => row.state_json !== group[0].state_json)) throw new Error("One fingerprint maps to two states.");
    const state = sanitizeIndependentJevState(parsed as unknown as JevShadowState);
    const caseId = "state:" + fingerprint.slice(0, 16);
    const triggers = [...new Set(group.map((row) => row.deterministic_trigger))].sort();
    const actions = [...new Set(triggers.map((trigger) =>
      (JEV_DETERMINISTIC_ACTION_BY_TRIGGER as Record<string, string>)[trigger] ?? "UNKNOWN_TRIGGER"))].sort();
    if (actions.length !== 1) ambiguousBaseline++;
    const v1 = new Map<string, number>();
    for (const row of group) {
      const key = row.status + ":" + (row.jev_next_action ?? "none");
      v1.set(key, (v1.get(key) ?? 0) + 1);
    }
    out.push({ kind: "blind", case_id: caseId, state_fingerprint: fingerprint, cohort: "CONFIRMATION",
      prompt_version: JEV_INDEPENDENT_EVAL_VERSION, state });
    out.push({ kind: "packet", case_id: caseId, jev_request: buildIndependentJevRequest(state) });
    out.push({ kind: "reconciliation", case_id: caseId, state_fingerprint: fingerprint, deterministic_triggers: triggers,
      deterministic_actions: actions, historical_v1: Object.fromEntries([...v1.entries()].sort()),
      historical_observations: group.length });
  }
  out.push({ kind: "summary", distinct_states: groups.size, observations_with_state: rows.length,
    states_with_more_than_one_deterministic_action: ambiguousBaseline, prompt_version: JEV_INDEPENDENT_EVAL_VERSION,
    provider_calls: 0 });
  return out;
}

function main() {
  if (process.argv.length > 3) throw new Error("Usage: jev-v2-export.ts [database]");
  const db = new DatabaseSync(process.argv[2] ?? process.env.MISSION_CONTROL_DB ?? "/data/mission-control.db", { readOnly: true });
  try {
    for (const line of exportJevV2Cases(db)) process.stdout.write(JSON.stringify(line) + "\n");
  } finally {
    db.close();
  }
}

if (process.argv[1] && /jev-v2-export\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch {
    // Never echo stored content, paths or SQLite errors.
    process.stderr.write("Jev V2 export failed: check the database path and that it holds Jev shadow telemetry.\n");
    process.exitCode = 1;
  }
}
