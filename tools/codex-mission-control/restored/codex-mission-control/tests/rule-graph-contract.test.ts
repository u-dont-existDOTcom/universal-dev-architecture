import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildDirectWorkPrompt } from "../lib/chatgpt-work-cloud-autodispatch";
import { ruleGraphPromptBlock, workHandoffRuleGraphProjection } from "../lib/rule-graph-contract";

test("shadow mode validates the compiled Work contract without changing the prompt", () => {
  const projection = workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "shadow" });
  assert.equal(projection.mode, "shadow");
  assert.equal(projection.loaded, true);
  assert.equal(projection.inject, false);
  assert.match(projection.contractSha256 ?? "", /^[0-9a-f]{64}$/);
  assert.deepEqual(ruleGraphPromptBlock(projection), []);
});

test("graph mode injects exact compiled Active Lesson Contract before the bounded directive", () => {
  const prior = process.env.MISSION_CONTROL_RULE_GRAPH_MODE;
  process.env.MISSION_CONTROL_RULE_GRAPH_MODE = "graph";
  try {
    const exactDirective = "Perform only this bounded mechanical task.";
    const prompt = buildDirectWorkPrompt({
      dispatchId: "work-cloud:test",
      worker: "worker:test",
      directiveId: "directive:test",
      directiveRevision: 1,
      taskId: "task:test",
      sourceChat: {
        supervisorId: "mc-project-manager",
        sourceChatTitle: "Mission Control",
        sourceChatUrl: "chatgpt-conversation://source",
        sourceChatBrowserUrl: "https://chatgpt.com/c/source",
        chatgptProjectId: null,
      },
      receiptTarget: { repository: "u-dont-existDOTcom/universal-dev-architecture", stageIssueNumber: 61 },
      exactDirective,
    });
    assert.match(prompt, /ACTIVE_LESSON_CONTRACT_GRAPH_V1_BEGIN/);
    assert.match(prompt, /uda\.active-contract\.boundary-binding/);
    assert.match(prompt, /uda\.worker-directive\.same-turn-delivery/);
    const begin = prompt.indexOf("ACTIVE_LESSON_CONTRACT_GRAPH_V1_BEGIN");
    const directive = prompt.indexOf("EXACT_BOUNDED_DIRECTIVE_BEGIN");
    assert.ok(begin >= 0 && directive > begin);
    assert.match(prompt, new RegExp("EXACT_BOUNDED_DIRECTIVE_BEGIN\\n" + exactDirective.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&") + "\\nEXACT_BOUNDED_DIRECTIVE_END"));
  } finally {
    if (prior === undefined) delete process.env.MISSION_CONTROL_RULE_GRAPH_MODE;
    else process.env.MISSION_CONTROL_RULE_GRAPH_MODE = prior;
  }
});

test("legacy mode leaves the current Work prompt path unchanged", () => {
  const prior = process.env.MISSION_CONTROL_RULE_GRAPH_MODE;
  process.env.MISSION_CONTROL_RULE_GRAPH_MODE = "legacy";
  try {
    const prompt = buildDirectWorkPrompt({
      dispatchId: "work-cloud:test-legacy",
      worker: "worker:test",
      directiveId: "directive:test",
      directiveRevision: 1,
      taskId: "task:test",
      sourceChat: {
        supervisorId: "mc-project-manager",
        sourceChatTitle: "Mission Control",
        sourceChatUrl: "chatgpt-conversation://source",
        sourceChatBrowserUrl: "https://chatgpt.com/c/source",
        chatgptProjectId: null,
      },
      receiptTarget: { repository: "u-dont-existDOTcom/universal-dev-architecture", stageIssueNumber: 61 },
      exactDirective: "Do the bounded task.",
    });
    assert.doesNotMatch(prompt, /ACTIVE_LESSON_CONTRACT_GRAPH_V1/);
  } finally {
    if (prior === undefined) delete process.env.MISSION_CONTROL_RULE_GRAPH_MODE;
    else process.env.MISSION_CONTROL_RULE_GRAPH_MODE = prior;
  }
});

test("shadow mode falls back on graph artifact failure while graph mode fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-rule-graph-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{}", "utf8");
  const shadow = workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "shadow" }, bad);
  assert.equal(shadow.inject, false);
  assert.equal(shadow.loaded, false);
  assert.ok(shadow.error);
  assert.throws(() => workHandoffRuleGraphProjection({ MISSION_CONTROL_RULE_GRAPH_MODE: "graph" }, bad), /unavailable in graph mode/);
});
