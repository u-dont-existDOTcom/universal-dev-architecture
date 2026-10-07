import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type RuleGraphMode = "legacy" | "shadow" | "graph";
export type RuleGraphEnvironment = { MISSION_CONTROL_RULE_GRAPH_MODE?: string };
// Fail-closed bound against runaway contract growth. A ChatGPT Work prompt is not subject to
// Codex's 32 KiB AGENTS.md discovery limit, so this bound comes from the measured contract:
// regressions keep at least WORK_DIRECTIVE_RESERVE_BYTES of it for the wrapper and directive.
export const WORK_PROMPT_MAX_BYTES = 48 * 1024;
export const WORK_DIRECTIVE_RESERVE_BYTES = 8 * 1024;
export const WORK_PROMPT_BUDGET_LABEL = `${WORK_PROMPT_MAX_BYTES / 1024} KiB instruction budget`;

export interface RuleGraphWorkHandoffProjection {
  mode: RuleGraphMode;
  loaded: boolean;
  inject: boolean;
  contractSha256: string | null;
  renderedContract: string | null;
  error: string | null;
}

const CONTRACT_PATH = fileURLToPath(new URL("../generated/rule-graph/work-handoff-contract.json", import.meta.url));

export function ruleGraphMode(env: RuleGraphEnvironment = process.env as RuleGraphEnvironment): RuleGraphMode {
  const raw = (env.MISSION_CONTROL_RULE_GRAPH_MODE ?? "shadow").trim().toLowerCase();
  if (raw === "legacy" || raw === "shadow" || raw === "graph") return raw;
  throw new Error("MISSION_CONTROL_RULE_GRAPH_MODE must be legacy, shadow, or graph.");
}

export function workHandoffRuleGraphProjection(
  env: RuleGraphEnvironment = process.env as RuleGraphEnvironment,
  contractPath = CONTRACT_PATH,
): RuleGraphWorkHandoffProjection {
  const mode = ruleGraphMode(env);
  if (mode === "legacy") return { mode, loaded: false, inject: false, contractSha256: null, renderedContract: null, error: null };
  try {
    const parsed = JSON.parse(readFileSync(contractPath, "utf8")) as Record<string, unknown>;
    const sha = parsed.content_sha256;
    const rendered = parsed.rendered_contract;
    const usable = parsed.usable;
    const selected = parsed.selected_rules;
    if (usable !== true || typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha)
      || typeof rendered !== "string" || !rendered.trim() || !Array.isArray(selected) || selected.length === 0) {
      throw new Error("compiled Work handoff contract is invalid or unusable");
    }
    // Deliver exact normative sources once. Their redundant behavior summaries
    // stay in selected_rules; acceptance, non-substitutes and all boundary data
    // travel here, with repeated provenance/lifecycle values shared losslessly.
    const values: (string | number)[] = [];
    const ref = (value: string | number): number => {
      const existing = values.indexOf(value);
      if (existing >= 0) return existing;
      return values.push(value) - 1;
    };
    const sourceKeys = ["path", "repository_revision", "git_blob_sha1", "extracted_utf8_bytes", "extracted_sha256"];
    const lines = [
      "# Active Lesson Contract — Work projection",
      "Exact source clauses supply required behavior. Binding rows retain acceptance and non-substitutes; numeric references resolve in Shared values below.",
      "Rule binding: [authority_owner#, authority_domain#, source#[]]. Source order: " + sourceKeys.join(", ") + ".",
      "Obligation: [obligation_id, due_phase#, destination#, acceptance_evidence, non_substitutes, carry_through#, repair#, enforcement#, mechanical_check, not_applicable_allowed, independent_review_required].",
    ];
    for (const rule of selected) {
      lines.push("", `### ${rule.rule_id} @ r${rule.revision}`,
        JSON.stringify([ref(rule.authority_owner), ref(rule.authority_domain), sourceKeys.map((key) => ref(rule.source[key]))]),
        rule.source_text);
      for (const ob of rule.obligations) {
        lines.push(JSON.stringify([
          ob.obligation_id, ref(ob.due_phase), ref(ob.destination), ob.acceptance_evidence,
          ob.non_substitutes, ref(ob.carry_through), ref(ob.repair), ref(ob.enforcement),
          ob.mechanical_check, ob.not_applicable_allowed ?? false, ob.independent_review_required ?? false,
        ]));
      }
    }
    lines.push("", "## Shared values", JSON.stringify(values));
    return {
      mode,
      loaded: true,
      inject: mode === "graph",
      contractSha256: sha,
      renderedContract: lines.join("\n"),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (mode === "shadow") {
      return { mode, loaded: false, inject: false, contractSha256: null, renderedContract: null, error: message };
    }
    throw new Error("Rule-graph Work handoff contract unavailable in graph mode: " + message);
  }
}

export function ruleGraphPromptBlock(projection: RuleGraphWorkHandoffProjection): string[] {
  if (!projection.inject || !projection.renderedContract || !projection.contractSha256) return [];
  const block = [
    "ACTIVE_LESSON_CONTRACT_GRAPH_V1_BEGIN",
    "Contract SHA-256: " + projection.contractSha256,
    projection.renderedContract.trimEnd(),
    "ACTIVE_LESSON_CONTRACT_GRAPH_V1_END",
    "The contract above constrains execution but does not expand Work authority beyond the exact bounded directive below.",
  ];
  if (Buffer.byteLength(block.join("\n"), "utf8") > WORK_PROMPT_MAX_BYTES) {
    throw new Error(`Rule-graph Work handoff block exceeds the ${WORK_PROMPT_BUDGET_LABEL}.`);
  }
  return block;
}
