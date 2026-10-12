import assert from 'node:assert/strict';
import test from 'node:test';

import { SubmissionSchedulerClient } from '../src/submission-scheduler-client.mjs';

test('fetchSubmissionAdmissionProof performs one authenticated read for one exact ID', async () => {
  const calls = [];
  const admissionId = 'send-admission:proof-client';
  const client = new SubmissionSchedulerClient({
    url: 'https://mission-control.example/api/submission-authority',
    token: 's'.repeat(32), producerId: 'collector:test-relay', attestorKey: 'a'.repeat(32), pacingDomain: 'account:test',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ schemaVersion: 1, kind: 'MISSION_CONTROL_EXACT_ADMISSION_PROOF_V1', admission: { admissionId } });
    },
  });
  const proof = await client.fetchSubmissionAdmissionProof(admissionId);
  assert.equal(proof.admission.admissionId, admissionId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://mission-control.example/api/submission-authority/admissions/proof?admission_id=${encodeURIComponent(admissionId)}`);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${'s'.repeat(32)}`);
  assert.equal(calls[0].options.headers['x-mission-control-producer-id'], 'collector:test-relay');
  assert.equal(Object.hasOwn(calls[0].options, 'body'), false);
  assert.throws(() => client.fetchSubmissionAdmissionProof('wrong'), (error) => error.code === 'SUBMISSION_ADMISSION_PROOF_ID_INVALID');
  assert.equal(calls.length, 1);
});
