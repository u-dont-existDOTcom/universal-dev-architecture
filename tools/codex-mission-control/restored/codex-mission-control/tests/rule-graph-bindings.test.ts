import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ruleGraphPromptBlock, workHandoffRuleGraphProjection, WORK_DIRECTIVE_RESERVE_BYTES, WORK_PROMPT_MAX_BYTES } from "../lib/rule-graph-contract";
const contract = JSON.parse(readFileSync(new URL("../generated/rule-graph/work-handoff-contract.json", import.meta.url), "utf8"));

test("Work projection activates the receiving actor's access boundary", () => {
  const prompt = ruleGraphPromptBlock(workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "graph" })).join("\n");
  assert.equal(contract.direct_evaluations["uda.kernel.work-permissions"], "TRUE");
  assert.match(prompt, /uda\.kernel\.work-permissions/);
  assert.match(prompt, /automatic-task-access-review/);
});

test("the complete injected contract leaves the directive reserve inside the instruction budget", () => {
  const projection = workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "graph" });
  const prompt = ruleGraphPromptBlock(projection).join("\n");
  assert.ok(Buffer.byteLength(prompt, "utf8") <= WORK_PROMPT_MAX_BYTES - WORK_DIRECTIVE_RESERVE_BYTES);
  assert.throws(() => ruleGraphPromptBlock({ ...projection, renderedContract: "é".repeat(WORK_PROMPT_MAX_BYTES / 2) }), /KiB instruction budget/);
});

test("graph prompt delivers acceptance evidence, authority and exact source bindings for every rule", () => {
  const prompt = ruleGraphPromptBlock(workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "graph" })).join("\n");
  const values = JSON.parse(prompt.split("## Shared values\n")[1].split("\n")[0]);
  const sourceKeys = ["path", "repository_revision", "git_blob_sha1", "extracted_utf8_bytes", "extracted_sha256"];
  for (const rule of contract.selected_rules) {
    const heading = `### ${rule.rule_id} @ r${rule.revision}\n`;
    const section = prompt.split(heading)[1].split(/\n\n(?:### |## Shared values)/)[0];
    const newline = section.indexOf("\n");
    const [owner, domain, source] = JSON.parse(section.slice(0, newline));
    assert.equal(values[owner], rule.authority_owner);
    assert.equal(values[domain], rule.authority_domain);
    assert.deepEqual(Object.fromEntries(sourceKeys.map((key, i) => [key, values[source[i]]])), rule.source);
    const body = section.slice(newline + 1);
    assert.ok(body.startsWith(rule.source_text + "\n"));
    assert.equal(prompt.split(rule.source_text).length - 1, 1);
    const obligations = body.slice(rule.source_text.length + 1).split("\n").map((row) => JSON.parse(row));
    assert.deepEqual(obligations.map((ob) => [ob[0], values[ob[1]], values[ob[2]], ob[3], ob[4],
      values[ob[5]], values[ob[6]], values[ob[7]], ob[8], ob[9], ob[10]]),
    rule.obligations.map((ob: Record<string, unknown>) => [ob.obligation_id, ob.due_phase, ob.destination, ob.acceptance_evidence,
      ob.non_substitutes, ob.carry_through, ob.repair, ob.enforcement, ob.mechanical_check,
      ob.not_applicable_allowed ?? false, ob.independent_review_required ?? false]));
  }
});

test("shadow and legacy modes leave the worker prompt unchanged", () => {
  for (const mode of ["shadow", "legacy"]) {
    assert.deepEqual(ruleGraphPromptBlock(workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: mode })), []);
  }
});
