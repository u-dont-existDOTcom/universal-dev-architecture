import assert from 'node:assert/strict';
import test from 'node:test';
import { exactRelayRequestScope } from '../src/core.mjs';

test('one-shot CLI scope accepts only an exact fleet review, Work owner continuation, post-Work review or Work question', () => {
  for (const kind of ['fleet-review', 'work-owner-continuation', 'post-work-review', 'work-question']) {
    const requestId = `${kind}:${'a'.repeat(32)}`;
    assert.deepEqual(exactRelayRequestScope('worker-a', requestId), { workerId: 'worker-a', requestId });
  }
});

test('one-shot CLI scope rejects malformed, unsupported and generic request inputs', () => {
  for (const request of [undefined, '', 'request:any', `work-question:${'a'.repeat(31)}`, `work-question-replacement:${'a'.repeat(32)}`,
    `work-owner-continuation:${'a'.repeat(31)}`, `work-owner-continuation:${'A'.repeat(32)}`,
    ` work-owner-continuation:${'a'.repeat(32)}`, `work-owner-continuation:${'a'.repeat(32)}:extra`,
    `post-work-review:${'a'.repeat(31)}`, `post-work-review-replacement:${'a'.repeat(32)}`, `source-review:${'a'.repeat(32)}`]) {
    assert.throws(() => exactRelayRequestScope('worker-a', request), /Usage:/);
  }
  assert.throws(() => exactRelayRequestScope('../worker', `work-owner-continuation:${'a'.repeat(32)}`), /Usage:/);
});
