import assert from 'node:assert/strict';
import test from 'node:test';
import { exactRelayRequestScope } from '../src/core.mjs';

test('one-shot CLI scope accepts only an exact fleet review or Work owner continuation', () => {
  for (const kind of ['fleet-review', 'work-owner-continuation']) {
    const requestId = `${kind}:${'a'.repeat(32)}`;
    assert.deepEqual(exactRelayRequestScope('worker-a', requestId), { workerId: 'worker-a', requestId });
  }
});

test('one-shot CLI scope rejects malformed, unsupported and generic request inputs', () => {
  for (const request of [undefined, '', 'request:any', `work-question:${'a'.repeat(32)}`,
    `work-owner-continuation:${'a'.repeat(31)}`, `work-owner-continuation:${'A'.repeat(32)}`,
    ` work-owner-continuation:${'a'.repeat(32)}`, `work-owner-continuation:${'a'.repeat(32)}:extra`]) {
    assert.throws(() => exactRelayRequestScope('worker-a', request), /Usage:/);
  }
  assert.throws(() => exactRelayRequestScope('../worker', `work-owner-continuation:${'a'.repeat(32)}`), /Usage:/);
});
