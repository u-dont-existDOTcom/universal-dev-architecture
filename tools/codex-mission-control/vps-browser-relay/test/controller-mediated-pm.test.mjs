import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAPABILITY_VERIFIED_SUMMARY,
  MODE_CAPABILITY_VERIFIED_SUMMARY,
  PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  PROVIDER_SESSION_SUMMARY,
  RELAY_STAGE_SUMMARY,
  canonicalJson,
  defaultState,
  deriveBindingCapsule,
  sha256,
} from '../src/core.mjs';
import {
  CONTROLLER_PM_ID,
  ControllerMediatedPmRuntime,
  parseControllerCycleSpec,
  publicControllerCycle,
} from '../src/controller-mediated-pm.mjs';

const ownerExactText = 'OWNER bytes\r\nkeep trailing  \u00a0🙂e\u0301';

test('controller executes exact origin -> GitHub -> PM -> GitHub -> exact origin target -> MC completion', async () => {
  const fixture = makeFixture();
  const { runtime, store, browser, github, mc } = fixture;
  assert.equal((await runtime.initialize(fixture.spec)).status, 'CONTROLLER_CYCLE_INITIALIZED');
  const initialized = store.state.controllerCycles['cycle-1'];
  assert.equal(initialized.step, 'ORIGIN_SEND_READY');
  assert.equal(initialized.origin.targetId, 'origin-target');

  assert.equal((await runtime.cycle('cycle-1')).status, 'WAIT_ORIGIN_ARTIFACT');
  assert.deepEqual(browser.navigations[0], { targetId: 'origin-target', from: 'https://chatgpt.com/c/binding', to: 'https://chatgpt.com/' });
  assert.equal(browser.submits.length, 1);
  assert.match(browser.submits[0].body, /Perform this ordinary GitHub write yourself/);
  assert.match(browser.submits[0].body, /Do not delegate any GitHub read or write to Work or Codex/);

  github.available.add('ORIGIN_TO_PM');
  assert.equal((await runtime.cycle('cycle-1')).status, 'ORIGIN_ARTIFACT_VALIDATED');
  assert.equal(github.expectations.at(-1).notBefore, store.state.controllerCycles['cycle-1'].sends.origin.boundaryObservedAt);
  assert.equal((await runtime.cycle('cycle-1')).status, 'PM_SEND_READY');
  assert.equal(store.state.controllerCycles['cycle-1'].pm.targetId, 'pm-target');
  assert.equal((await runtime.cycle('cycle-1')).status, 'WAIT_PM_ARTIFACT');
  assert.equal(browser.submits.length, 2);
  assert.match(browser.submits[1].body, /Read only the immutable origin artifact/);
  assert.equal(browser.submits[1].body.includes(ownerExactText), false);

  github.available.add('PM_TO_ORIGIN');
  assert.equal((await runtime.cycle('cycle-1')).status, 'PM_ARTIFACT_VALIDATED');
  assert.equal((await runtime.cycle('cycle-1')).status, 'RETURN_SEND_READY');
  assert.equal(browser.closed.includes('pm-target'), true);
  assert.equal((await runtime.cycle('cycle-1')).status, 'WAIT_RETURN_ARTIFACT_OR_ACK');
  assert.equal(store.state.controllerCycles['cycle-1'].step, 'WAIT_RETURN_ARTIFACT_OR_ACK');
  assert.equal(browser.submits.length, 3);
  assert.equal(browser.submits[2].targetId, 'origin-target');
  assert.match(browser.submits[2].body, /Controller-mediated return binding/);
  assert.match(browser.submits[2].body, /Do not delegate GitHub operations to Work or Codex/);
  assert.equal(browser.submits[2].body.includes(ownerExactText), false);
  assert.ok(mc.recorded.some((item) => item.summary === RELAY_STAGE_SUMMARY && item.refs.includes('generation_state:COMPLETE')));
  assert.notEqual(store.state.controllerCycles['cycle-1'].step, 'COMPLETE', 'generation completion is not semantic completion');

  mc.addFinal(store.state.controllerCycles['cycle-1']);
  const completed = await runtime.cycle('cycle-1');
  assert.equal(completed.status, 'CONTROLLER_CYCLE_COMPLETE');
  assert.equal(store.state.deliveries['request:fresh-request'].status, 'DECISION_RECEIPT_INGESTED');
  assert.equal(completed.controllerCycle.final.decisionBlockSha256, sha256(ownerExactText));
  assert.equal(completed.controllerCycle.final.providerSourceTimestamp, null);
  assert.equal(completed.controllerCycle.final.provenanceStatus, 'UNVERIFIED');
});

test('restart at every started boundary reconciles GitHub first and never replays', async () => {
  for (const [step, kind] of [
    ['ORIGIN_SEND_STARTED', 'ORIGIN_TO_PM'],
    ['PM_SEND_STARTED', 'PM_TO_ORIGIN'],
    ['RETURN_SEND_STARTED', null],
  ]) {
    const fixture = makeFixture();
    await fixture.runtime.initialize(fixture.spec);
    const cycle = fixture.store.state.controllerCycles['cycle-1'];
    cycle.step = step;
    cycle.sends.origin = { status: 'INTENT_RECORDED', intentRecordedAt: '2026-09-09T00:01:00.000Z', boundaryObservedAt: null };
    if (step === 'ORIGIN_SEND_STARTED') {
      cycle.origin.expectedUrl = 'https://chatgpt.com/';
      fixture.browser.targets.find((item) => item.id === 'origin-target').url = 'https://chatgpt.com/c/recovered-origin';
    }
    if (step !== 'ORIGIN_SEND_STARTED') {
      cycle.consumedArtifacts.origin = artifactReceipt(cycle, 'ORIGIN_TO_PM');
      fixture.github.seedReceipt('ORIGIN_TO_PM', cycle.consumedArtifacts.origin);
      cycle.pm = { targetId: 'pm-target', automationWindowId: 7, expectedUrl: 'https://chatgpt.com/c/pm', targetBindingSha256: 'c'.repeat(64), closedAt: null };
      cycle.sends.pm = { status: 'INTENT_RECORDED', intentRecordedAt: '2026-09-09T00:02:00.000Z', boundaryObservedAt: null };
      fixture.browser.targets.push({ id: 'pm-target', url: cycle.pm.expectedUrl, automationWindowId: 7 });
    }
    if (step === 'RETURN_SEND_STARTED') {
      cycle.consumedArtifacts.pm = artifactReceipt(cycle, 'PM_TO_ORIGIN');
      fixture.github.seedReceipt('PM_TO_ORIGIN', cycle.consumedArtifacts.pm);
      cycle.origin.expectedUrl = 'https://chatgpt.com/';
      fixture.browser.targets.find((item) => item.id === 'origin-target').url = 'https://chatgpt.com/';
    }
    fixture.store.state.controllerCycles['cycle-1'] = cycle;
    if (step !== 'ORIGIN_SEND_STARTED') fixture.github.available.add('ORIGIN_TO_PM');
    if (step === 'RETURN_SEND_STARTED') fixture.github.available.add('PM_TO_ORIGIN');
    if (kind) fixture.github.available.add(kind);
    const result = await fixture.runtime.cycle('cycle-1');
    assert.equal(fixture.browser.submits.length, 0);
    assert.equal(result.status, kind ? `${kind === 'ORIGIN_TO_PM' ? 'ORIGIN' : 'PM'}_ARTIFACT_VALIDATED` : 'RETURN_SEND_AMBIGUOUS_NO_REPLAY');
  }
});

test('started send without its exact artifact remains ambiguous and does not select a same-URL target', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  const cycle = fixture.store.state.controllerCycles['cycle-1'];
  cycle.step = 'ORIGIN_SEND_STARTED';
  cycle.sends.origin = { status: 'INTENT_RECORDED', intentRecordedAt: '2026-09-09T00:01:00.000Z', boundaryObservedAt: null };
  fixture.store.state.controllerCycles['cycle-1'] = cycle;
  fixture.browser.targets.push({ id: 'collision', url: cycle.origin.expectedUrl, automationWindowId: 7 });
  const result = await fixture.runtime.cycle('cycle-1');
  assert.equal(result.status, 'ORIGIN_SEND_AMBIGUOUS_NO_REPLAY');
  assert.equal(fixture.browser.submits.length, 0);
  assert.equal(fixture.browser.exactRequirements.length, 1, 'only initialization checked the exact origin target');
});

test('a second provider rate-limit failure persists STARTED and blocks replay', async () => {
  const fixture = makeFixture({ pacerFailure: Object.assign(new Error('CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED'), { code: 'CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED', relayStage: 'CLICKED' }) });
  await fixture.runtime.initialize(fixture.spec);
  const failed = await fixture.runtime.cycle('cycle-1');
  assert.equal(failed.status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'ORIGIN_SEND_STARTED');
  const resumed = await fixture.runtime.cycle('cycle-1');
  assert.equal(resumed.status, 'ORIGIN_SEND_AMBIGUOUS_NO_REPLAY');
  assert.equal(fixture.browser.submits.length, 0);
});

test('public status redacts exact OWNER text and browser identities', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  const cycle = fixture.store.state.controllerCycles['cycle-1'];
  cycle.consumedArtifacts.origin = artifactReceipt(cycle, 'ORIGIN_TO_PM');
  const publicValue = publicControllerCycle(cycle);
  const raw = JSON.stringify(publicValue);
  assert.doesNotMatch(raw, /OWNER bytes|origin-target|automationWindowId|targetId/);
  assert.equal(publicValue.ownerBytesSha256, sha256(ownerExactText));
});

test('controller spec is exact and pins the permanent PM identity', () => {
  const fixture = makeFixture();
  assert.deepEqual(parseControllerCycleSpec(fixture.spec), fixture.spec);
  assert.throws(() => parseControllerCycleSpec({ ...fixture.spec, pmSupervisorId: 'someone-else' }), /Invalid/);
  assert.throws(() => parseControllerCycleSpec({ ...fixture.spec, surprise: true }), /Invalid/);
});

test('controller send remains separately gated while reconciliation stays available', async () => {
  const fixture = makeFixture();
  fixture.runtime.config.runtime.submitEnabled = false;
  await fixture.runtime.initialize(fixture.spec);
  const result = await fixture.runtime.cycle('cycle-1');
  assert.equal(result.status, 'CONTROLLER_SEND_DISABLED');
  assert.equal(fixture.browser.submits.length, 0);
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'ORIGIN_SEND_READY');
});

test('global cooldown is checked before consumed-artifact GitHub revalidation', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  await fixture.runtime.cycle('cycle-1');
  fixture.github.available.add('ORIGIN_TO_PM');
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'PM_SEND_READY');
  fixture.pacer.ready = false;
  const before = fixture.github.expectations.length;
  const result = await fixture.runtime.cycle('cycle-1');
  assert.equal(result.status, 'GLOBAL_SUBMISSION_COOLDOWN');
  assert.equal(fixture.github.expectations.length, before);
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'PM_SEND_READY');
});

test('navigation and PM-target creation recover from the durable intent without URL or order selection', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  fixture.browser.failAfterNavigateOnce = true;
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].navigations.origin.status, 'INTENT_RECORDED');
  assert.equal(fixture.browser.targets.find((item) => item.id === 'origin-target').url, 'https://chatgpt.com/');
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_ORIGIN_ARTIFACT');

  fixture.github.available.add('ORIGIN_TO_PM');
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'ORIGIN_ARTIFACT_VALIDATED');
  fixture.browser.failAfterCreateOnce = true;
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'ORIGIN_ARTIFACT_VALIDATED');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].pmTargetCreation.status, 'INTENT_RECORDED');
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'PM_SEND_READY');
  assert.equal(fixture.browser.targets.filter((item) => item.id === 'pm-target').length, 1);
});

test('late duplicate redelivery blocks the next transition', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  await fixture.runtime.cycle('cycle-1');
  fixture.github.available.add('ORIGIN_TO_PM');
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'ORIGIN_ARTIFACT_VALIDATED');
  fixture.github.duplicateKinds.add('ORIGIN_TO_PM');
  const result = await fixture.runtime.cycle('cycle-1');
  assert.equal(result.status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(result.error, 'CONTROLLER_ARTIFACT_CARDINALITY_CONFLICT');
  assert.equal(fixture.browser.targets.some((item) => item.id === 'pm-target'), false);
});

test('verified pre-click failure restores READY while a crossed boundary remains non-replayable', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  fixture.browser.failAppSelectionOnce = true;
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'ORIGIN_SEND_READY');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].sends.origin.status, 'FAILED_PRECLICK');
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_ORIGIN_ARTIFACT');
  assert.equal(fixture.browser.submits.length, 1);
});

test('return preparation and post-click transport evidence resume idempotently before waiting for final receipt', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  await fixture.runtime.cycle('cycle-1');
  fixture.github.available.add('ORIGIN_TO_PM');
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  fixture.github.available.add('PM_TO_ORIGIN');
  await fixture.runtime.cycle('cycle-1');

  fixture.mc.failPendingProjectionEvidenceOnce = true;
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'PM_ARTIFACT_VALIDATED');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].returnPreparation.status, 'SESSION_PERSISTED');
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'RETURN_SEND_READY');

  fixture.mc.failExactProviderEvidenceOnce = true;
  assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'RETURN_SEND_STARTED');
  assert.equal(fixture.store.state.controllerCycles['cycle-1'].sends.return.status, 'BOUNDARY_VERIFIED');
  const resumed = await fixture.runtime.cycle('cycle-1');
  assert.equal(resumed.status, 'WAIT_RETURN_ARTIFACT_OR_ACK');
  assert.equal(fixture.browser.submits.length, 3, 'return transport recovery never resubmits');
  assert.ok(fixture.mc.recorded.some((item) => item.summary === PROVIDER_SESSION_SUMMARY
    && item.refs.includes('lifecycle_status:COMPLETE')));
});

test('origin, PM, and return sends recover without replay after process death between click and generation return', async () => {
  {
    const fixture = makeFixture();
    await fixture.runtime.initialize(fixture.spec);
    fixture.browser.failAfterClickOnce = true;
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
    assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'ORIGIN_SEND_STARTED');
    assert.equal(fixture.store.state.controllerCycles['cycle-1'].sends.origin.status, 'CLICK_BOUNDARY_PERSISTED');
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_ORIGIN_ARTIFACT');
    fixture.github.available.add('ORIGIN_TO_PM');
    fixture.store.state.controllerCycles['cycle-1'].artifactPolling.origin.nextPollAt = '2026-01-01T00:00:00.000Z';
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'ORIGIN_ARTIFACT_VALIDATED');
    assert.match(fixture.store.state.controllerCycles['cycle-1'].origin.expectedUrl, /generated-1$/);
    assert.equal(fixture.browser.submits.length, 1);
  }

  {
    const fixture = makeFixture();
    await fixture.runtime.initialize(fixture.spec);
    await fixture.runtime.cycle('cycle-1');
    fixture.github.available.add('ORIGIN_TO_PM');
    await fixture.runtime.cycle('cycle-1');
    await fixture.runtime.cycle('cycle-1');
    fixture.browser.failAfterClickOnce = true;
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
    assert.equal(fixture.store.state.controllerCycles['cycle-1'].step, 'PM_SEND_STARTED');
    assert.equal(fixture.store.state.controllerCycles['cycle-1'].sends.pm.status, 'CLICK_BOUNDARY_PERSISTED');
    fixture.github.available.add('PM_TO_ORIGIN');
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'PM_ARTIFACT_VALIDATED');
    assert.equal(fixture.browser.submits.length, 2);
  }

  {
    const fixture = makeFixture();
    await fixture.runtime.initialize(fixture.spec);
    await fixture.runtime.cycle('cycle-1');
    fixture.github.available.add('ORIGIN_TO_PM');
    await fixture.runtime.cycle('cycle-1');
    await fixture.runtime.cycle('cycle-1');
    await fixture.runtime.cycle('cycle-1');
    fixture.github.available.add('PM_TO_ORIGIN');
    await fixture.runtime.cycle('cycle-1');
    await fixture.runtime.cycle('cycle-1');
    fixture.browser.failAfterClickOnce = true;
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'CONTROLLER_CYCLE_ERROR');
    const cycle = fixture.store.state.controllerCycles['cycle-1'];
    assert.equal(cycle.step, 'RETURN_SEND_STARTED');
    assert.equal(cycle.sends.return.status, 'CLICK_BOUNDARY_PERSISTED');
    assert.equal(fixture.store.state.providerSessions[cycle.providerSessions.return].conversationUrl, null);
    fixture.browser.targets.find((item) => item.id === 'origin-target').url = 'https://chatgpt.com/';
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_RETURN_TARGET_TRANSITION');
    fixture.browser.targets.find((item) => item.id === 'origin-target').url = 'https://chatgpt.com/c/generated-3';
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_RETURN_ARTIFACT_OR_ACK');
    assert.match(fixture.store.state.providerSessions[cycle.providerSessions.return].conversationUrl, /generated-3$/);
    assert.equal(fixture.browser.submits.length, 3);
  }
});

test('GitHub polling performs no consumed-artifact rescans during ordinary wait cycles', async () => {
  const fixture = makeFixture();
  await fixture.runtime.initialize(fixture.spec);
  await fixture.runtime.cycle('cycle-1');

  let before = fixture.github.expectations.length;
  for (let index = 0; index < 12; index += 1) {
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_ORIGIN_ARTIFACT');
  }
  assert.equal(fixture.github.expectations.length - before, 1, 'origin wait consumes only one mailbox scan inside its durable polling lease');

  fixture.github.available.add('ORIGIN_TO_PM');
  fixture.store.state.controllerCycles['cycle-1'].artifactPolling.origin.nextPollAt = '2026-01-01T00:00:00.000Z';
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  before = fixture.github.expectations.length;
  for (let index = 0; index < 12; index += 1) {
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_PM_ARTIFACT');
  }
  assert.equal(fixture.github.expectations.length - before, 1, 'PM wait consumes one mailbox scan and does not rescan the consumed origin artifact');

  fixture.github.available.add('PM_TO_ORIGIN');
  fixture.store.state.controllerCycles['cycle-1'].artifactPolling.pm.nextPollAt = '2026-01-01T00:00:00.000Z';
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  await fixture.runtime.cycle('cycle-1');
  before = fixture.github.expectations.length;
  for (let index = 0; index < 12; index += 1) {
    assert.equal((await fixture.runtime.cycle('cycle-1')).status, 'WAIT_RETURN_ARTIFACT_OR_ACK');
  }
  assert.equal(fixture.github.expectations.length, before, 'final wait performs no GitHub mailbox polling before Mission Control exposes final proof');
});

function makeFixture({ pacerFailure = null } = {}) {
  const packet = continuationPacket();
  const body = PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify(packet);
  const routeEvent = {
    eventId: 'route-event-1', sequence: 10, occurredAt: packet.queuedAt,
    data: { type: 'worker_message_recorded', message_id: 'route-message-1', body },
  };
  const state = defaultState();
  const routeForCapsule = {
    routeKind: 'SUPERVISORY_CYCLE', requestId: packet.requestId, workerId: 'worker-a', supervisorId: 'origin-supervisor',
    packet: { ...packet, routeSchemaVersion: 4 },
  };
  const capsule = deriveBindingCapsule(routeForCapsule, 'provider-session:binding', 'mcp-binding-receipt');
  state.deliveries['request:fresh-request'] = {
    status: 'MCP_BINDING_PRELOAD_COMPLETE', requestId: packet.requestId, workerId: 'worker-a', supervisorId: 'origin-supervisor',
    providerSessionId: 'provider-session:binding', bindingProviderSessionId: 'provider-session:binding', bindingCapsule: capsule,
  };
  state.providerSessions['provider-session:binding'] = {
    providerSessionId: 'provider-session:binding', bindingProviderSessionId: 'provider-session:binding', supervisorId: 'origin-supervisor',
    requestId: packet.requestId, workerId: 'worker-a', sessionRole: 'MC_BINDING_PRELOAD_SESSION', cycleStep: 'MCP_BINDING_PRELOAD',
    messageOrdinal: 1, conversationUrl: 'https://chatgpt.com/c/binding', openedAt: '2026-09-09T00:00:00.000Z',
    completedAt: '2026-09-09T00:01:00.000Z', status: 'COMPLETE', targetId: 'origin-target', modelReceiptId: 'model-binding',
  };
  const store = new MemoryStateStore(state);
  const mc = new FakeMissionControl(routeEvent, packet);
  const browser = new FakeBrowser();
  const github = new FakeGitHubArtifacts();
  const pacer = new FakePacer(store, pacerFailure);
  const config = {
    missionControl: { requestTimeoutMs: 30_000 },
    runtime: {
      submitEnabled: true, maxHotTabs: 3,
      chats: [chat('SPECIALIST', 'origin-supervisor', 'origin-target-chat'), chat('PROJECT_MANAGER', CONTROLLER_PM_ID, 'pm-chat')],
    },
  };
  const runtime = new ControllerMediatedPmRuntime({
    config, missionControl: mc, browser, stateStore: store, submissionPacer: pacer,
    githubFactory: () => github,
  });
  const spec = {
    schemaVersion: 1, cycleId: 'cycle-1', taskId: 'task-1', requestId: packet.requestId,
    workerId: 'worker-a', originSupervisorId: 'origin-supervisor', pmSupervisorId: CONTROLLER_PM_ID,
    routeEventId: routeEvent.eventId, routeBodySha256: sha256(body),
    artifactRepository: 'o/r', artifactIssueNumber: 61,
    originArtifactNonce: 'origin-nonce', pmArtifactNonce: 'pm-nonce', authorizedWriterLogins: ['owner'],
  };
  return { runtime, store, mc, browser, github, pacer, spec };
}

class MemoryStateStore {
  constructor(state) { this.state = structuredClone(state); this.status = null; }
  async read() { return structuredClone(this.state); }
  async write(value) { this.state = structuredClone(value); return structuredClone(value); }
  async writeStatus(value) { this.status = structuredClone(value); }
}

class FakeMissionControl {
  constructor(routeEvent, packet) {
    this.routeEvent = routeEvent; this.packet = packet; this.recorded = []; this.finalEvents = []; this.sequence = 30;
    this.failPendingProjectionEvidenceOnce = false; this.failExactProviderEvidenceOnce = false;
  }
  async fetchFleet() {
    return { generatedAt: '2026-09-09T00:00:00.000Z', workers: [{ id: 'worker-a', timeline: [
      this.routeEvent,
      capabilityEvidence(CAPABILITY_VERIFIED_SUMMARY), capabilityEvidence(MODE_CAPABILITY_VERIFIED_SUMMARY),
      ...this.recorded.map((item) => ({ eventId: `e-${item.receiptId}`, sequence: ++this.sequence, occurredAt: item.occurredAt,
        data: { type: 'evidence_receipt_recorded', receipt_id: item.receiptId, summary: item.summary, refs: item.refs, verified: true } })),
      ...this.finalEvents,
    ] }] };
  }
  async recordEvidence(worker, input) {
    if (this.failPendingProjectionEvidenceOnce && input.summary === PROVIDER_SESSION_SUMMARY
      && input.refs.includes('url_binding_status:PENDING_PROVIDER_ASSIGNMENT')) {
      this.failPendingProjectionEvidenceOnce = false;
      throw new Error('simulated pending projection evidence failure');
    }
    if (this.failExactProviderEvidenceOnce && input.summary === PROVIDER_SESSION_SUMMARY
      && input.refs.includes('url_binding_status:EXACT')) {
      this.failExactProviderEvidenceOnce = false;
      throw new Error('simulated exact provider evidence failure');
    }
    this.recorded.push({ worker, ...structuredClone(input) }); return { eventId: `stored-${input.receiptId}` };
  }
  addFinal(cycle) {
    const receipt = {
      type: 'github_decision_receipt_ingested', request_id: cycle.requestId, worker: cycle.workerId,
      supervisor_id: cycle.originSupervisorId, decision_provider_session_id: cycle.providerSessions.return,
      binding_provider_session_id: cycle.bindingProviderSessionId,
      receipt_id: 'github-comment:999',
      github_receipt: { comment_id: '999', immutable_url: 'https://github.com/o/r/issues/59#issuecomment-999' },
      decision_block: { decision_id: 'decision-final', exact_text: ownerExactText, sha256: sha256(ownerExactText) },
      continuation_binding: this.packet.continuationBinding,
      continuation_binding_sha256: this.packet.continuationBindingSha256,
    };
    this.finalEvents.push(
      { eventId: 'final-receipt', sequence: 1000, data: receipt },
      { eventId: 'final-resolution', sequence: 1001, data: {
        type: 'reasoning_message_recorded', message_id: `github-owner-resolution:${this.packet.continuationBinding.continuation_id}`,
        thread_id: cycle.providerSessions.return, parent_message_id: this.packet.continuationBinding.supervisor_delivery.message_id,
        body_sha256: sha256(ownerExactText), exact_visible_body: ownerExactText, sent_at_source: null, provenance_status: 'UNVERIFIED',
      } },
    );
  }
}

class FakeBrowser {
  constructor() {
    this.targets = [{ id: 'origin-target', url: 'https://chatgpt.com/c/binding', automationWindowId: 7 }];
    this.navigations = []; this.exactRequirements = []; this.submits = []; this.closed = [];
    this.failAfterNavigateOnce = false; this.failAfterCreateOnce = false; this.failAppSelectionOnce = false; this.failAfterClickOnce = false;
  }
  async listTargets() { return structuredClone(this.targets); }
  async doctor() { return { automationWindowId: 7 }; }
  async requireExactOwnedTarget(input) {
    this.exactRequirements.push(structuredClone(input));
    const target = this.targets.find((item) => item.id === input.targetId);
    if (!target || target.automationWindowId !== input.automationWindowId || target.url !== input.expectedUrl) throw new Error('EXACT_TARGET_MISMATCH');
    return structuredClone(target);
  }
  async inspectExactOwnedTargetIdentity(input) {
    const target = this.targets.find((item) => item.id === input.targetId);
    if (!target || target.automationWindowId !== input.automationWindowId) throw new Error('EXACT_TARGET_MISMATCH');
    return structuredClone(target);
  }
  async navigateExactOwnedTarget(input) {
    const target = await this.requireExactOwnedTarget(input);
    this.navigations.push({ targetId: target.id, from: target.url, to: input.url });
    this.targets.find((item) => item.id === target.id).url = input.url;
    if (this.failAfterNavigateOnce) { this.failAfterNavigateOnce = false; throw new Error('simulated crash after navigation'); }
    return { ...target, url: input.url };
  }
  async forceCreateOwnedTarget({ url }) {
    const target = { id: 'pm-target', url, automationWindowId: 7, created: true };
    this.targets.push(target);
    if (this.failAfterCreateOnce) { this.failAfterCreateOnce = false; throw new Error('simulated crash after target creation'); }
    return structuredClone(target);
  }
  async recoverExactOwnedTargetByPurpose() {
    const target = this.targets.find((item) => item.id === 'pm-target');
    return target ? structuredClone(target) : null;
  }
  async closeTarget(id) { this.closed.push(id); this.targets = this.targets.filter((item) => item.id !== id); return true; }
  async ensureExactConsumerControls(target, { controls }) { return { status: 'FIXED_CONSUMER_CONTROLS_VERIFIED', ...controls }; }
  async selectAppsForMessage(target, input) {
    if (this.failAppSelectionOnce) { this.failAppSelectionOnce = false; throw Object.assign(new Error('simulated pre-click selection failure'), { relayStage: 'PREPARING' }); }
    return { status: 'MESSAGE_APPS_SELECTED', selectedLabels: input.requiredLabels };
  }
  async submitExactMessage(target, input) {
    const stored = this.targets.find((item) => item.id === target.id);
    const conversationUrl = input.expectedUrl === 'https://chatgpt.com/'
      ? `https://chatgpt.com/c/generated-${this.submits.length + 1}`
      : input.expectedUrl;
    stored.url = conversationUrl;
    this.submits.push({ targetId: target.id, body: input.body });
    const observedAt = `2026-09-09T00:0${this.submits.length}:00.000Z`;
    await input.onSubmissionBoundary?.({
      status: 'CLICKED', targetId: target.id, expectedUrl: input.expectedUrl,
      bodySha256: input.bodySha256, bodyLength: input.body.length,
      clickedAtObserved: observedAt, generationStarted: false,
      providerSourceTime: null, inspectedAssistantOutput: false,
    });
    if (this.failAfterClickOnce) {
      this.failAfterClickOnce = false;
      throw Object.assign(new Error('simulated process death after click'), {
        relayStage: 'CLICKED', clickedAtObserved: observedAt, submissionBoundaryPersistenceAttempted: true,
      });
    }
    return { generationStarted: true, clickedAtObserved: observedAt, startedAtObserved: observedAt, conversationUrl, startSignal: 'STOP_CONTROL_VISIBLE' };
  }
  async waitForGenerationComplete() { return { generationStarted: true, completedAtObserved: '2026-09-09T00:10:00.000Z', inspectedAssistantOutput: false }; }
}

class FakePacer {
  constructor(store, failure) { this.store = store; this.failure = failure; this.ready = true; }
  status() {
    return {
      ready: this.ready,
      retryAfterMs: this.ready ? 0 : 30_000,
      nextSubmissionAt: this.ready ? null : '2026-09-09T00:30:00.000Z',
      lastSubmissionAt: null,
      minimumIntervalMs: 60_000,
    };
  }
  async assertReady() {
    const status = this.status();
    if (!status.ready) throw Object.assign(new Error('GLOBAL_SUBMISSION_COOLDOWN'), { code: 'GLOBAL_SUBMISSION_COOLDOWN', ...status });
    return status;
  }
  async remoteStatus() { return this.status(); }
  async submit({ beforeSubmit, recordBoundary, submit }) {
    await beforeSubmit?.();
    if (this.failure) throw this.failure;
    const persist = async (observed) => {
      const boundaryAt = observed.clickedAtObserved ?? observed.startedAtObserved;
      const state = await this.store.read();
      state.submissionPacing = { lastSubmissionAt: boundaryAt };
      await recordBoundary?.(state, { boundaryAt, result: observed });
      await this.store.write(state);
    };
    const result = await submit(persist);
    await persist(result);
    return result;
  }
}

class FakeGitHubArtifacts {
  constructor() { this.available = new Set(); this.duplicateKinds = new Set(); this.nextId = 100; this.cache = new Map(); this.expectations = []; }
  async reconcile(expected) {
    this.expectations.push(structuredClone(expected));
    if (this.duplicateKinds.has(expected.artifactKind)) throw new Error('CONTROLLER_ARTIFACT_CARDINALITY_CONFLICT: found 2 exact identity candidates.');
    if (!this.available.has(expected.artifactKind)) return null;
    if (this.cache.has(expected.artifactKind)) {
      const cached = this.cache.get(expected.artifactKind);
      if (cached.artifact) return structuredClone(cached);
      cached.artifact = artifactFromExpected(expected);
      return structuredClone(cached);
    }
    const artifact = artifactFromExpected(expected);
    const id = String(this.nextId++);
    const result = { commentId: id, immutableUrl: `https://github.com/o/r/issues/61#issuecomment-${id}`,
      bodySha256: sha256(canonicalJson(artifact)), authorLogin: 'owner', createdAt: '2026-09-09T01:00:00.000Z', artifact };
    this.cache.set(expected.artifactKind, result);
    return structuredClone(result);
  }
  seedReceipt(kind, receipt) {
    this.cache.set(kind, {
      commentId: receipt.commentId, immutableUrl: receipt.immutableUrl, bodySha256: receipt.bodySha256,
      authorLogin: receipt.authorLogin, createdAt: receipt.createdAt, artifact: null,
    });
  }
}

function artifactFromExpected(expected) {
  return {
    schema_version: 1, artifact_kind: expected.artifactKind, cycle_id: expected.cycleId, task_id: expected.taskId,
    request_id: expected.requestId, artifact_nonce: expected.artifactNonce,
    producer_supervisor_id: expected.producerSupervisorId, consumer_supervisor_id: expected.consumerSupervisorId,
    source_provider_session_id: expected.sourceProviderSessionId, source_target_binding_sha256: expected.sourceTargetBindingSha256,
    controller_binding_sha256: expected.controllerBindingSha256, predecessor: expected.predecessor,
    owner_bytes_sha256: expected.ownerBytesSha256,
    semantic_payload: { exact_text: expected.ownerExactText, sha256: expected.ownerBytesSha256 },
  };
}

function artifactReceipt(cycle, kind) {
  return {
    commentId: kind === 'ORIGIN_TO_PM' ? '100' : '101',
    immutableUrl: `https://github.com/o/r/issues/61#issuecomment-${kind === 'ORIGIN_TO_PM' ? '100' : '101'}`,
    bodySha256: kind === 'ORIGIN_TO_PM' ? 'd'.repeat(64) : 'e'.repeat(64),
    authorLogin: 'owner', createdAt: '2026-09-09T01:00:00.000Z', artifactKind: kind,
    semanticPayloadSha256: sha256(ownerExactText),
  };
}

function continuationPacket() {
  const packet = {
    schemaVersion: 4, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId: 'fresh-request', nonce: 'route-nonce',
    reasoningLane: 'EXTRA_HIGH_DIRECT', destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'origin-supervisor',
    providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY', evidenceCapsule: { id: 'capsule', sha256: 'a'.repeat(64) },
    ownerOutcome: { id: 'outcome', epoch: 2, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 59, stageIssueNumber: 61 },
    factualPacket: { packetId: 'packet', taskId: 'task-1', exactFactualState: 'fixture', evidenceRefs: [], decisionRequested: 'Return exact bytes.' },
    queuedAt: '2026-09-09T00:00:00.000Z', expiresAt: '2099-09-10T00:00:00.000Z',
  };
  packet.continuationBinding = {
    schema_version: 1, kind: 'OWNER_RESPONSE_CONTINUATION', worker: 'worker-a', decision_request_id: 'historical-request',
    supervisor_id: 'origin-supervisor', path: 'DIRECT',
    originating_supervisor_message: { event_id: 'origin-event', message_id: 'origin-message', body_sha256: sha256('question') },
    owner_input: { event_id: 'owner-event', message_id: 'owner-message', body_sha256: sha256(ownerExactText), parent_message_id: 'origin-message', surface_role: 'SUPERVISOR' },
    supervisor_delivery: { event_id: 'owner-event', message_id: 'owner-message', body_sha256: sha256(ownerExactText), parent_message_id: 'origin-message' },
    owner_outcome: { ...packet.ownerOutcome }, evidence_capsule: { ...packet.evidenceCapsule },
    issued_at: packet.queuedAt, expires_at: packet.expiresAt,
  };
  const { owner_outcome, evidence_capsule, issued_at, expires_at, ...causal } = packet.continuationBinding;
  packet.continuationBinding.continuation_id = sha256(canonicalJson(causal));
  packet.continuationBindingSha256 = sha256(canonicalJson(packet.continuationBinding));
  packet.continuationOwnerResponseExactText = ownerExactText;
  return packet;
}

function chat(scope, supervisorId, chatId) {
  return {
    scope, supervisorId, label: supervisorId, workerId: 'worker-a', pinned: scope === 'PROJECT_MANAGER',
    registrationId: `registration:${supervisorId}:test`, ownership: 'MISSION_CONTROL_ONLY', purpose: 'Dedicated test supervisor.',
    accountAlias: 'account:test', workspaceAlias: 'workspace:test', privateLocatorRef: `private-config:supervisors/${supervisorId}`,
    registrationProvenance: { registeredBy: 'OWNER', registeredAt: '2026-09-10T12:00:00.000Z', sourceRef: 'owner-requirement:test' },
    bootstrapCapability: { chatId, url: `https://chatgpt.com/c/${chatId}`, challengeId: `challenge-${chatId}` },
    consumerControls: { modelVisibleLabel: 'GPT-5.6 Sol', thinkingControlLabel: 'Thinking effort', thinkingVisibleLabel: 'Extra High', thinkingOrdinal: '4 of 5', accountPlanLabel: 'Pro', accountPlanRole: 'PROVENANCE_METADATA_ONLY', accountPlanIsReasoningMode: false }, requiredApps: { missionControl: 'Mission Control', github: 'GitHub' },
  };
}

function capabilityEvidence(summary) {
  return { eventId: `cap-${summary}`, sequence: 2, data: { type: 'evidence_receipt_recorded', receipt_id: `cap-${summary}`, summary, verified: true, refs: [] } };
}
