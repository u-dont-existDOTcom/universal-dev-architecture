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


if __name__ == '__main__':
    unittest.main()
