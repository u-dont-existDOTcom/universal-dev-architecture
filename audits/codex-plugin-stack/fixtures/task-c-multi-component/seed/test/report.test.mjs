import assert from "node:assert/strict";
import test from "node:test";
import { buildReport } from "../src/report.mjs";

test("renders all events by default", () => {
  const report = buildReport([
    { severity: "info", message: "started" },
    { severity: "error", message: "failed" },
  ]);
  assert.equal(report, "[info] started\n[error] failed");
});
