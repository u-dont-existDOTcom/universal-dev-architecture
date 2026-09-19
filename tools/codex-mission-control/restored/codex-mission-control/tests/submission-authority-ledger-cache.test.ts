import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { EventStore } from "../lib/store";

const domain = "provider-account:test";

test("submission-authority verification reads the complete ledger once and only durable suffixes afterward", () => {
  const store = new EventStore(":memory:");
  try {
    const first = store.commitSubmissionAuthorityState(domain, { revision: 1 }, { eventKind: "STATE_COMMITTED", revision: 1 });
    const second = store.commitSubmissionAuthorityState(domain, { revision: 2 }, { eventKind: "STATE_COMMITTED", revision: 2 });
    const starts = observeVerificationStarts(store);

    assert.deepEqual(store.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });
    assert.deepEqual(store.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });
    const third = store.commitSubmissionAuthorityState(domain, { revision: 3 }, { eventKind: "STATE_COMMITTED", revision: 3 });
    assert.deepEqual(store.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });

    assert.deepEqual(starts, [0, Number(second.sequence), Number(second.sequence)]);
    assert.ok(Number(first.sequence) < Number(second.sequence));
    assert.ok(Number(second.sequence) < Number(third.sequence));
  } finally {
    store.close();
  }
});

test("submission-authority verification rebuilds its derived cache from durable state after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mc-authority-ledger-cache-"));
  const filename = path.join(root, "mission-control.db");
  try {
    const initial = new EventStore(filename);
    initial.commitSubmissionAuthorityState(domain, { revision: 1 }, { eventKind: "STATE_COMMITTED", revision: 1 });
    initial.commitSubmissionAuthorityState(domain, { revision: 2 }, { eventKind: "STATE_COMMITTED", revision: 2 });
    assert.deepEqual(initial.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });
    initial.close();

    const restarted = new EventStore(filename);
    const starts = observeVerificationStarts(restarted);
    assert.deepEqual(restarted.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });
    assert.deepEqual(starts, [0]);
    restarted.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("submission-authority verification fails closed when its cached durable anchor regresses", () => {
  const store = new EventStore(":memory:");
  try {
    store.commitSubmissionAuthorityState(domain, { revision: 1 }, { eventKind: "STATE_COMMITTED", revision: 1 });
    const second = store.commitSubmissionAuthorityState(domain, { revision: 2 }, { eventKind: "STATE_COMMITTED", revision: 2 });
    assert.deepEqual(store.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });

    const database = (store as any).db;
    database.exec("DROP TRIGGER provider_submission_authority_ledger_reject_delete");
    database.prepare("DELETE FROM provider_submission_authority_ledger WHERE sequence = ?").run(Number(second.sequence));

    const result = store.verifySubmissionAuthorityLedger(domain);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /cache anchor .* inconsistent with durable state/);
  } finally {
    store.close();
  }
});

test("submission-authority verification preserves hash and previous-hash checks for new durable suffixes", () => {
  const store = new EventStore(":memory:");
  try {
    store.commitSubmissionAuthorityState(domain, { revision: 1 }, { eventKind: "STATE_COMMITTED", revision: 1 });
    assert.deepEqual(store.verifySubmissionAuthorityLedger(domain), { valid: true, errors: [] });
    const second = store.commitSubmissionAuthorityState(domain, { revision: 2 }, { eventKind: "STATE_COMMITTED", revision: 2 });

    const database = (store as any).db;
    database.exec("DROP TRIGGER provider_submission_authority_ledger_reject_update");
    database.prepare("UPDATE provider_submission_authority_ledger SET previous_hash = ? WHERE sequence = ?")
      .run("f".repeat(64), Number(second.sequence));
    database.prepare("UPDATE provider_submission_authority_ledger SET event_hash = ? WHERE sequence = ?")
      .run("e".repeat(64), Number(second.sequence));

    const result = store.verifySubmissionAuthorityLedger(domain);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /invalid previous hash/);
    assert.match(result.errors.join("\n"), /invalid event hash/);
  } finally {
    store.close();
  }
});

test("submission-authority verification preserves rejection of payload fields reserved by stored ledger metadata", () => {
  const store = new EventStore(":memory:");
  try {
    store.commitSubmissionAuthorityState(domain, { revision: 1 }, {
      eventKind: "STATE_COMMITTED",
      revision: 1,
      sequence: 42,
      previousHash: "payload-value",
      eventHash: "payload-value",
    });
    const result = store.verifySubmissionAuthorityLedger(domain);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("\n"), /Submission ledger sequence 42 has an invalid event hash/);
  } finally {
    store.close();
  }
});

function observeVerificationStarts(store: EventStore): number[] {
  const target = store as any;
  const original = target.submissionAuthorityLedgerRowsAfter.bind(store);
  const starts: number[] = [];
  target.submissionAuthorityLedgerRowsAfter = (pacingDomain: string, sequence: number) => {
    starts.push(sequence);
    return original(pacingDomain, sequence);
  };
  return starts;
}
