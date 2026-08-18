import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";
import { buildReport } from "../src/report.mjs";

const events = [
  { severity: "warning", message: "disk" },
  { severity: "info", message: "started" },
  { severity: "error", message: "failed" },
];

test("filters below the threshold without reordering", () => {
  assert.equal(buildReport(events, { minimumSeverity: "warning" }), "[warning] disk\n[error] failed");
  assert.equal(buildReport(events, { minimumSeverity: "error" }), "[error] failed");
});

test("rejects unsupported severity", () => {
  assert.throws(() => loadConfig({ minimumSeverity: "debug" }), /severity/i);
});
