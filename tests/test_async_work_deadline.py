"""Fault injection for the portable scheduler deadline, not a text-presence proof."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

JS = r"""
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { runWithDeadline, DeadlineExceeded } = await import(pathToFileURL(process.argv[1]));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A small serialized consumer: a rejected attempt must not poison its tail.
let tail = Promise.resolve();
const submit = operation => {
  const result = tail.then(() => runWithDeadline(operation, { timeoutMs: 25 }));
  tail = result.catch(() => {});
  return result;
};
let aborted = false, activeResources = 0;
const stuck = submit(signal => {
  activeResources++;
  signal.addEventListener('abort', () => { aborted = true; activeResources--; }, { once: true });
  return new Promise(() => {}); // Intentionally emits neither error nor close.
});
const next = submit(async () => {
  assert.equal(activeResources, 0, 'real resource cleanup must precede successor admission');
  return 'next completed';
});
await assert.rejects(stuck, error => error instanceof DeadlineExceeded && error.code === 'timeout');
assert.equal(aborted, true);
assert.equal(await next, 'next completed');
assert.equal(await submit(async () => 'same identity retried'), 'same identity retried');

let release;
const late = new Promise(resolve => { release = resolve; });
let committed = false;
const timed = runWithDeadline(async signal => {
  await late;
  signal.throwIfAborted(); // Resource adapter must fence later actions too.
  committed = true;
  return 'late';
}, { timeoutMs: 15 });
await assert.rejects(timed, DeadlineExceeded);
release(); await delay(5);
assert.equal(committed, false);
assert.equal(await runWithDeadline(async () => 7, { timeoutMs: 30 }), 7);
await assert.rejects(runWithDeadline(() => { throw Error('sync failure'); }, { timeoutMs: 30 }), /sync failure/);
await assert.rejects(runWithDeadline(async () => 1, { timeoutMs: 0 }), RangeError);

// A timer that fires late (the event loop was blocked) must not skip cancellation: the late check aborts the resource.
let lateAbort = false;
await assert.rejects(runWithDeadline(signal => {
  signal.addEventListener('abort', () => { lateAbort = true; }, { once: true });
  const end = Date.now() + 40;
  while (Date.now() < end) {} // synchronous work past the 5 ms deadline
  return 'too late';
}, { timeoutMs: 5 }), DeadlineExceeded);
assert.equal(lateAbort, true, 'a deadline found after the operation returns must still abort its resource');

// An operation that fails after its deadline, by throwing or by rejecting, must still have its resource aborted.
for (const failure of ['throw', 'reject']) {
  let failedAbort = false;
  await assert.rejects(runWithDeadline(signal => {
    signal.addEventListener('abort', () => { failedAbort = true; }, { once: true });
    const end = performance.now() + 40;
    while (performance.now() < end) {}
    if (failure === 'throw') throw new Error('dependency failed late');
    return Promise.reject(new Error('dependency failed late'));
  }, { timeoutMs: 5 }), DeadlineExceeded);
  assert.equal(failedAbort, true, `an overdue ${failure} must still abort its resource`);
}

// The deadline uses the monotonic clock: moving the wall clock back must not admit an overdue result,
// and moving it forward must not expire work that is on time.
const realNow = Date.now;
let backAbort = false;
try {
  await assert.rejects(runWithDeadline(signal => {
    signal.addEventListener('abort', () => { backAbort = true; }, { once: true });
    const end = performance.now() + 40;
    Date.now = () => realNow() - 60_000;
    while (performance.now() < end) {}
    return 'overdue';
  }, { timeoutMs: 5 }), DeadlineExceeded);
  assert.equal(backAbort, true, 'a backward wall-clock step must not hide an overdue result');
  assert.equal(await runWithDeadline(async () => { Date.now = () => realNow() + 60_000; return 'on time'; },
    { timeoutMs: 1000 }), 'on time');
} finally { Date.now = realNow; }
console.log('deadline cancellation, late-result fencing and successor recovery PASS');
"""


class AsyncWorkDeadlineTests(unittest.TestCase):
    def test_stalled_dependency_cannot_block_serialized_successor(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js is needed to exercise the JavaScript runtime template')
        result = subprocess.run(
            [node, '--input-type=module', '-e', JS, str(ROOT / 'templates/async-work-deadline.mjs')],
            text=True, capture_output=True, timeout=5,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('successor recovery PASS', result.stdout)


class BugRepairLearningActivationTests(unittest.TestCase):
    """The routes that make a bug repair start the durable-learning closeout and reach this workflow."""

    @staticmethod
    def read(relative):
        return (ROOT / relative).read_text(encoding='utf-8')

    def test_bug_repair_activates_the_durable_learning_closeout(self):
        entry = [line for line in self.read('LESSON-INDEX.md').splitlines()
                 if '`patterns/durable-chat-learning.md` —' in line]
        self.assertEqual(len(entry), 1)
        trigger = entry[0].split(' — ', 1)[1]
        self.assertTrue(trigger.startswith('When debugging or fixing a bug'), trigger)
        self.assertIn('automatic causal-lesson review and warranted cross-project promotion', trigger)
        learning = self.read('patterns/durable-chat-learning.md')
        self.assertIn('Debugging and bug repair activate this same closeout', learning)
        self.assertIn('`patterns/bounded-external-work-and-queue-recovery.md`', learning)
        self.assertIn('a service restart is restoration evidence, not a completed prevention fix', learning)
        docs = self.read('docs/INDEX.md')
        self.assertIn('After any bug repair, activate `../patterns/durable-chat-learning.md`', docs)
        self.assertIn('`../patterns/bounded-external-work-and-queue-recovery.md`', docs)
        self.assertIn('`../templates/async-work-deadline.mjs`', docs)
        workflow = self.read('patterns/bounded-external-work-and-queue-recovery.md')
        self.assertIn('## Bug-repair closeout', workflow)
        self.assertIn('apply the existing closeout in `patterns/durable-chat-learning.md` automatically', workflow)

    def test_the_failure_map_row_sits_inside_its_table(self):
        lines = self.read('patterns/logic-failure-map.md').splitlines()
        row = next(i for i, line in enumerate(lines) if line.startswith('| LF-6.8 |'))
        self.assertTrue(lines[row - 1].startswith('| LF-6.7 |'), 'a blank line before the row would end the table')
        self.assertIn('`patterns/bounded-external-work-and-queue-recovery.md`', lines[row])

    def test_owner_deployment_evidence_is_labeled(self):
        audit = self.read('audits/2026-11-03-async-queue-recovery-promotion.md')
        for heading in ('## Origin and observed failure', '## Repair evidence', '## Exact released source pins'):
            with self.subTest(heading=heading):
                self.assertIn(heading + ' (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)', audit)
        self.assertIn('## Transfer rationale and limits\n', audit)


if __name__ == '__main__':
    unittest.main()
