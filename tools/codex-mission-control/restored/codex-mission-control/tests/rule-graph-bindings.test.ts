import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// This adapter has only built-in dependencies and runs on Node's native TS runner.
const { ruleGraphPromptBlock, workHandoffRuleGraphProjection } = await import(
  new URL("../lib/rule-graph-contract.ts", import.meta.url).href
);
const contract = JSON.parse(readFileSync(new URL("../generated/rule-graph/work-handoff-contract.json", import.meta.url), "utf8"));

test("graph prompt delivers acceptance evidence, authority and exact source bindings for every rule", () => {
  const prompt = ruleGraphPromptBlock(workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "graph" })).join("\n");
  assert.ok(prompt.includes(contract.rendered_contract.trimEnd()));
  const marker = "## Retained acceptance and provenance bindings\n";
  assert.ok(prompt.includes(marker));
  const bindings = JSON.parse(prompt.split(marker)[1].split("\nACTIVE_LESSON_CONTRACT_GRAPH_V1_END")[0]);
  assert.deepEqual(bindings, contract.selected_rules.map((rule: { rule_id: string; authority_owner: string; authority_domain: string; source: unknown; obligations: { obligation_id: string; acceptance_evidence: string }[] }) => ({
    rule_id: rule.rule_id,
    authority_owner: rule.authority_owner,
    authority_domain: rule.authority_domain,
    source: rule.source,
    acceptance_evidence: Object.fromEntries(rule.obligations.map((ob) => [ob.obligation_id, ob.acceptance_evidence])),
  })));
});

test("shadow and legacy modes leave the worker prompt unchanged", () => {
  for (const mode of ["shadow", "legacy"]) {
    assert.deepEqual(ruleGraphPromptBlock(workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: mode })), []);
  }
});
