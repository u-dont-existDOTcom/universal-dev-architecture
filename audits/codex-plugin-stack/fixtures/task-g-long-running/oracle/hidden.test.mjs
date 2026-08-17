import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("workflow recovered to a verified terminal state", () => {
  assert.equal(fs.existsSync(".workflow-state.json"), true, "workflow state was not created");
  const state = JSON.parse(fs.readFileSync(".workflow-state.json", "utf8"));
  assert.deepEqual(
    {
      completedPhase: state.completedPhase,
      attempts: state.attempts,
      failedOnce: state.failedOnce,
      complete: state.complete,
    },
    { completedPhase: 3, attempts: 2, failedOnce: true, complete: true },
  );
});
