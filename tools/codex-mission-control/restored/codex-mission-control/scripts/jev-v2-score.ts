/**
 * Score the independent V2 test (docs/JEV-INDEPENDENT-V2-EVALUATION.md) once the gold labels are frozen.
 *
 *   tsx scripts/jev-v2-score.ts --gold <adjudicated.jsonl> --reconciliation <export.jsonl> --ledger <budget.json>
 *     [--stronger <blinded-stronger.jsonl>]
 *
 * gold:           one line per case: case_id, state_fingerprint, gold_action, evidence_ref, cohort (frozen first)
 * reconciliation: the export's "reconciliation" lines (other kinds are ignored)
 * ledger:         the USD 1.00 runner ledger; its typed answers are the Jev observations, per model version
 * stronger:       optional blinded comparison: case_id, action
 * Prints one score per Jev version. A case whose recorded triggers map to more than one deterministic action has no
 * single baseline and is reported apart, never guessed. No provider call is made.
 */
import { readFileSync } from "node:fs";
import {
  JEV_INDEPENDENT_ACTIONS, scoreJevIndependentValue, type JevIndependentAction, type JevJudgedObservation,
} from "../lib/jev-independent-eval";

type Json = Record<string, unknown>;
const isAction = (value: unknown): value is JevIndependentAction =>
  typeof value === "string" && (JEV_INDEPENDENT_ACTIONS as readonly string[]).includes(value);

export function scoreJevV2(input: { gold: Json[]; reconciliation: Json[]; ledger: Json; stronger?: Json[] }) {
  const baseline = new Map<string, unknown[]>();
  for (const row of input.reconciliation) {
    if (row.kind !== undefined && row.kind !== "reconciliation") continue;
    baseline.set(String(row.case_id), Array.isArray(row.deterministic_actions) ? row.deterministic_actions : []);
  }
  const stronger = new Map((input.stronger ?? []).map((row) => [String(row.case_id), row.action]));
  const entries = (Array.isArray(input.ledger.entries) ? input.ledger.entries : []) as Json[];
  const models = [...new Set(entries.filter((entry) => String(entry.case_id).startsWith("state:"))
    .map((entry) => String(entry.model)))].sort();
  const seenCases = new Set<string>();
  const noSingleBaseline: string[] = [];
  const usable: Array<{ gold: Json; deterministic: JevIndependentAction }> = [];
  for (const gold of input.gold) {
    const caseId = String(gold.case_id ?? "");
    if (seenCases.has(caseId)) throw new Error("A case has two gold labels: " + caseId);
    seenCases.add(caseId);
    if (!isAction(gold.gold_action) || typeof gold.evidence_ref !== "string" || !gold.evidence_ref.trim()) {
      throw new Error("Every gold label needs a valid action and its evidence: " + caseId);
    }
    const actions = baseline.get(caseId);
    if (!actions) throw new Error("A gold case is missing from the reconciliation file: " + caseId);
    if (actions.length !== 1 || !isAction(actions[0])) { noSingleBaseline.push(caseId); continue; }
    usable.push({ gold, deterministic: actions[0] });
  }
  const scores = Object.fromEntries(models.map((model) => {
    const rows: JevJudgedObservation[] = [];
    for (const { gold, deterministic } of usable) {
      const common = {
        case_id: String(gold.case_id), state_fingerprint: String(gold.state_fingerprint),
        cohort: gold.cohort === "DEVELOPMENT" ? "DEVELOPMENT" as const : "CONFIRMATION" as const,
        evidence_ref: String(gold.evidence_ref), gold_action: gold.gold_action as JevIndependentAction,
        deterministic_action: deterministic,
        ...(isAction(stronger.get(String(gold.case_id))) ? { stronger_action: stronger.get(String(gold.case_id)) as JevIndependentAction } : {}),
      };
      const observed = entries.filter((entry) => entry.case_id === gold.case_id && entry.model === model);
      if (!observed.length) { rows.push({ ...common, provider_status: "NOT_RUN" }); continue; }
      for (const entry of observed) {
        const answers = entry.typed_answers as Json | undefined;
        const choice = (answers?.next_action as Json | undefined)?.choice;
        const ok = entry.status === "OK" && isAction(choice);
        rows.push({ ...common, provider_status: ok ? "OK" : "ERROR",
          ...(ok ? { jev_action: choice as JevIndependentAction } : {}),
          ...(typeof entry.response_id === "string" ? { response_id: entry.response_id }
            : { fallback_identity: String(entry.call_identity) }),
          ...(typeof entry.latency_ms === "number" ? { latency_ms: entry.latency_ms } : {}),
          cost_usd: Number(entry.final_usd ?? entry.reserved_usd ?? 0) });
      }
    }
    return [model, scoreJevIndependentValue(rows)];
  }));
  return { gold_cases: input.gold.length, scored_cases: usable.length, cases_without_single_baseline: noSingleBaseline,
    by_model: scores, provider_calls: 0 };
}

function lines(path: string): Json[] {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line) as Json);
}

function main() {
  const args = new Map<string, string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--gold", "--reconciliation", "--ledger", "--stronger"].includes(argv[i]) || !argv[i + 1]) {
      throw new Error("Usage: jev-v2-score.ts --gold F --reconciliation F --ledger F [--stronger F]");
    }
    args.set(argv[i], argv[i + 1]);
  }
  if (!args.has("--gold") || !args.has("--reconciliation") || !args.has("--ledger")) throw new Error("Missing input.");
  const result = scoreJevV2({ gold: lines(args.get("--gold")!), reconciliation: lines(args.get("--reconciliation")!),
    ledger: JSON.parse(readFileSync(args.get("--ledger")!, "utf8")) as Json,
    stronger: args.has("--stronger") ? lines(args.get("--stronger")!) : undefined });
  process.stdout.write(JSON.stringify(result, null, 1) + "\n");
}

if (process.argv[1] && /jev-v2-score\.ts$/.test(process.argv[1])) main();
