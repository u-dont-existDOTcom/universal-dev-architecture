import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { jevShadowSummaryForProducer, jevShadowSummaryTool } from "../lib/jev-shadow-surface";
import { daemonReadiness } from "../lib/daemon-health";
import { FleetSupervisorLoop } from "../lib/fleet-supervisor-loop";
import { EventStore } from "../lib/store";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";

const daemon = readFileSync("daemon/server.ts", "utf8");

test("authenticated MCP list advertises the read-only summary and both call/read paths use the scope check", () => {
  assert.equal(jevShadowSummaryTool.name, "mission_control_get_jev_shadow_summary");
  assert.deepEqual(jevShadowSummaryTool.annotations, { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  assert.deepEqual(jevShadowSummaryTool.inputSchema, { type: "object", properties: {}, additionalProperties: false });
  // Consumer wiring check: descriptor is in the actual daemon list, and the
  // HTTP/stdio forwarders transparently expose that list rather than copying it.
  assert.match(daemon, /body\.method === "tools\/list"[^]*?tools: \[\s*jevShadowSummaryTool,/);
  assert.match(daemon, /params\?\.name === jevShadowSummaryTool\.name[^]*?jevShadowSummaryForProducer\(store, producer\)[^]*?mcpResult\(id, summary\)/);
  assert.match(daemon, /url\.pathname === "\/jev-shadow\/summary"[^]*?jevShadowSummaryForProducer\(store, authorizeMutation\(request\)\)/);
  assert.match(readFileSync("scripts/mcp-stdio.mjs", "utf8"), /body: JSON\.stringify\(request\)/);
  assert.match(readFileSync("app/api/mcp/route.ts", "utf8"), /relayJson\("\/mcp"/);
});

test("worker and system callers cannot read telemetry; owner/supervisor/UI scopes can", () => {
  const store = new EventStore(":memory:");
  try {
    let reads = 0;
    const dependency = { jevShadowSummary: () => { reads += 1; return store.jevShadowSummary(); } };
    const producer = (kind: AuthenticatedProducer["kind"]) => ({ id: "fixture", kind, workerScopes: ["*"], taskScopes: ["*"] });
    assert.equal(jevShadowSummaryForProducer(dependency, producer("WORKER")), null);
    assert.equal(jevShadowSummaryForProducer(dependency, producer("SYSTEM")), null);
    assert.equal(reads, 0);
    for (const kind of ["OWNER_AUTHORITY", "SUPERVISOR", "UI"] as const) assert.equal(jevShadowSummaryForProducer(dependency, producer(kind))?.counts.total, 0);
    assert.equal(reads, 3);
  } finally { store.close(); }
});

test("readiness includes loop status and retains existing readiness fields and decisions when stalled", async () => {
  let now = 0;
  const loop = new FleetSupervisorLoop({ tick: () => new Promise<never>(() => {}) }, { now: () => now, pollMs: 1000, stallMs: 5000 });
  loop.advance(); now = 6001;
  const status = loop.status();
  const readiness = await daemonReadiness({ latestSequence: () => 42, verifyChain: () => ({ valid: false, errors: ["fixture"] }) }, {
    health: async () => ({ configured: true, schedulerState: "ACTIVE_LEASE", ledger: { valid: true } }),
  }, status);
  assert.deepEqual(readiness, { status: "ok", kind: "readiness", latestSequence: 42, chain: { valid: false, errors: ["fixture"] },
    submissionAuthorityConfigured: true, submissionAuthoritySchedulerState: "ACTIVE_LEASE", submissionAuthorityLedger: { valid: true }, fleetSupervisorLoop: status });
  assert.equal(readiness.fleetSupervisorLoop?.stalled, true);
  assert.match(daemon, /daemonReadiness\(store, submissionAuthority, fleetSupervisorLoop\.status\(\)\)/);
  loop.stop();
});

test("live recording is isolated from the tick while preserving observation and tick/failure events", () => {
  assert.match(daemon, /console\.info\(JSON\.stringify\(\{ event: "jev_shadow_observation", \.\.\.item\.jevShadow \}\)\);/);
  assert.match(daemon, /try \{\s*store\.recordJevShadowObservation\(\{ source: "LIVE", projectId: item\.projectId, observation: item\.jevShadow \}\);\s*\} catch \{[^]*?event: "jev_shadow_record_failed"/);
  assert.match(daemon, /type: "fleet_supervisor_tick", results/);
  assert.match(daemon, /event: "fleet_supervisor_tick_failed", error: error instanceof Error \? error\.message : "Unknown fleet supervisor failure"/);
  assert.match(daemon, /observeJevShadow: sampleJevShadowOnStateChange\(boundedJevShadowHook\(/);
});
