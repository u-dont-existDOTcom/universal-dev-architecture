import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { initialState, nextPhase } from "../scripts/workflow.mjs";

test("new and resumed states select the next incomplete phase", () => {
  assert.equal(nextPhase(initialState()), 1);
  assert.equal(nextPhase({ ...initialState(), completedPhase: 2 }), 3);
});

test("a completed workflow state is valid when present", () => {
  if (!fs.existsSync(".workflow-state.json")) return;
  const state = JSON.parse(fs.readFileSync(".workflow-state.json", "utf8"));
  assert.equal(state.complete, true);
  assert.equal(state.completedPhase, 3);
  assert.equal(state.failedOnce, true);
  assert.equal(state.attempts, 2);
});
