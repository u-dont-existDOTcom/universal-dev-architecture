import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type RuleGraphMode = "legacy" | "shadow" | "graph";

export interface RuleGraphWorkHandoffProjection {
  mode: RuleGraphMode;
  loaded: boolean;
  inject: boolean;
  contractSha256: string | null;
  renderedContract: string | null;
  error: string | null;
}

const CONTRACT_PATH = fileURLToPath(new URL("../generated/rule-graph/work-handoff-contract.json", import.meta.url));

export function ruleGraphMode(env: NodeJS.ProcessEnv = process.env): RuleGraphMode {
  const raw = (env.MISSION_CONTROL_RULE_GRAPH_MODE ?? "shadow").trim().toLowerCase();
  if (raw === "legacy" || raw === "shadow" || raw === "graph") return raw;
  throw new Error("MISSION_CONTROL_RULE_GRAPH_MODE must be legacy, shadow, or graph.");
}

export function workHandoffRuleGraphProjection(
  env: NodeJS.ProcessEnv = process.env,
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
    return {
      mode,
      loaded: true,
      inject: mode === "graph",
      contractSha256: sha,
      renderedContract: rendered,
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
  return [
    "ACTIVE_LESSON_CONTRACT_GRAPH_V1_BEGIN",
    "Contract SHA-256: " + projection.contractSha256,
    projection.renderedContract.trimEnd(),
    "ACTIVE_LESSON_CONTRACT_GRAPH_V1_END",
    "The contract above constrains execution but does not expand Work authority beyond the exact bounded directive below.",
  ];
}
