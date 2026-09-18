import assert from "node:assert/strict";
import test from "node:test";

import { daemonLiveness, daemonReadiness } from "../lib/daemon-health";

test("cheap daemon liveness performs no chain or authority verification", () => {
  let chainChecks = 0;
  let authorityChecks = 0;
  const store = { latestSequence: () => 9, verifyChain: () => { chainChecks += 1; return { valid: true }; } };
  const authority = { health: async () => { authorityChecks += 1; return { configured: true, schedulerState: "ACTIVE_LEASE", ledger: { valid: true } }; } };

  assert.deepEqual(daemonLiveness(), { status: "ok", kind: "liveness" });
  assert.equal(chainChecks, 0);
  assert.equal(authorityChecks, 0);
  void store;
  void authority;
});

test("deep daemon readiness verifies event chain and submission authority", async () => {
  let sequenceReads = 0;
  let chainChecks = 0;
  let authorityChecks = 0;
  const readiness = await daemonReadiness({
    latestSequence: () => { sequenceReads += 1; return 12_345; },
    verifyChain: () => { chainChecks += 1; return { valid: true, errors: [] }; },
  }, {
    health: async () => {
      authorityChecks += 1;
      return { configured: true, schedulerState: "ACTIVE_LEASE", ledger: { valid: true, errors: [] } };
    },
  });

  assert.equal(readiness.kind, "readiness");
  assert.equal(readiness.latestSequence, 12_345);
  assert.deepEqual(readiness.chain, { valid: true, errors: [] });
  assert.deepEqual(readiness.submissionAuthorityLedger, { valid: true, errors: [] });
  assert.equal(sequenceReads, 1);
  assert.equal(chainChecks, 1);
  assert.equal(authorityChecks, 1);
});
