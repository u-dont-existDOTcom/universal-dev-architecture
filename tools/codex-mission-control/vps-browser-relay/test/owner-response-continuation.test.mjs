import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MCP_BINDING_PRELOAD_STEP,
  INTERNAL_ROUTE_PREFIX,
  PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX,
  canonicalJson,
  cycleControlPrompt,
  defaultState,
  deriveBindingCapsule,
  extractQueuedRoutes,
  parseSupervisoryCycleRouteBody,
  parseInternalSupervisorRouteBody,
  sha256,
} from '../src/core.mjs';
import { composerTextState } from '../src/cdp.mjs';

const ownerText = 'Keep the existing scope.\r\nUse the OWNER answer exactly: “approved”.  ';

test('continuation route parses exact direct and PM-mediated OWNER responses', () => {
  for (const path of ['DIRECT', 'PROJECT_MANAGER']) {
    const packet = continuationPacket(path);
    const parsed = parseSupervisoryCycleRouteBody(body(packet));
    assert.deepEqual(parsed.continuationBinding, packet.continuationBinding);
    assert.equal(parsed.continuationOwnerResponseExactText, ownerText);
    assert.equal(parsed.continuationBindingSha256, packet.continuationBindingSha256);
    assert.equal(parsed.routeSchemaVersion, 4);
    // The historical decision request is distinct from the fresh admission request.
    assert.notEqual(parsed.continuationBinding.decision_request_id, parsed.requestId);
  }
});

test('continuation parser rejects missing, invalid, stale, or inconsistent metadata and exact text', () => {
  const invalid = [
    (packet) => { delete packet.continuationBinding; },
    (packet) => { delete packet.continuationBindingSha256; },
    (packet) => { delete packet.continuationOwnerResponseExactText; },
    (packet) => { packet.continuationBinding = null; },
    (packet) => { packet.continuationBindingSha256 = '0'.repeat(64); },
    (packet) => { packet.continuationOwnerResponseExactText = ownerText.trim(); },
    (packet) => { packet.continuationOwnerResponseExactText = null; },
    (packet) => { packet.continuationBinding.continuation_id = '0'.repeat(64); packet.continuationBindingSha256 = sha256(canonicalJson(packet.continuationBinding)); },
    (packet) => { packet.continuationBinding.schema_version = 2; sign(packet); },
    (packet) => { packet.continuationBinding.sent_at_source = packet.queuedAt; sign(packet); },
    (packet) => { packet.continuationBinding.originating_supervisor_message.exact_text = 'UNTRUSTED ASSISTANT OUTPUT'; sign(packet); },
    (packet) => { packet.continuationBinding.supervisor_id = 'other'; sign(packet); },
    (packet) => { packet.continuationBinding.owner_outcome.epoch += 1; sign(packet); },
    (packet) => { packet.continuationBinding.evidence_capsule.id = 'stale'; sign(packet); },
    (packet) => { packet.continuationBinding.issued_at = '2026-09-06T11:00:00.000Z'; sign(packet); },
    (packet) => { packet.continuationBinding.expires_at = '2026-09-07T12:00:00.000Z'; sign(packet); },
    (packet) => { packet.continuationBinding.owner_input.parent_message_id = 'wrong-parent'; sign(packet); },
    (packet) => { packet.continuationBinding.owner_input.surface_role = 'PROJECT_MANAGER'; sign(packet); },
    (packet) => { packet.continuationBinding.supervisor_delivery.message_id = 'different-owner'; sign(packet); },
    (packet) => { packet.continuationBinding.supervisor_delivery.body_sha256 = sha256('altered text'); sign(packet); },
  ];
  for (const mutate of invalid) {
    const packet = continuationPacket();
    mutate(packet);
    assert.equal(parseSupervisoryCycleRouteBody(body(packet)), null, mutate.toString());
  }
  const staged = { ...continuationPacket(), schemaVersion: 3 };
  assert.equal(parseSupervisoryCycleRouteBody(STAGED_PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify(staged)), null);
});

test('PM-mediated continuation rejects a changed OWNER forward or wrong causal parent', () => {
  for (const mutate of [
    (binding) => { binding.owner_input.body_sha256 = sha256('different OWNER input'); },
    (binding) => { binding.supervisor_delivery.parent_message_id = binding.originating_supervisor_message.message_id; },
    (binding) => { binding.owner_input.surface_role = 'SUPERVISOR'; },
    (binding) => { binding.supervisor_delivery.event_id = binding.owner_input.event_id; },
  ]) {
    const packet = continuationPacket('PROJECT_MANAGER');
    mutate(packet.continuationBinding);
    sign(packet);
    assert.equal(parseSupervisoryCycleRouteBody(body(packet)), null, mutate.toString());
  }
});

test('legacy route prefixes cannot smuggle continuation through a claimed schema version', () => {
  const packet = continuationPacket();
  const legacy = { ...basePacket(), schemaVersion: 1, packetKind: 'FACTUAL_STATE_ONLY',
    destinationChatId: 'supervisor-a', actionBlockedOrRouted: 'ROUTE_INTERNAL_SUPERVISOR' };
  assert.ok(parseInternalSupervisorRouteBody(INTERNAL_ROUTE_PREFIX + JSON.stringify(legacy)));
  for (const injected of [
    { routeSchemaVersion: 4 },
    { continuationBinding: packet.continuationBinding },
    { continuationBindingSha256: packet.continuationBindingSha256 },
    { continuationOwnerResponseExactText: ownerText },
    { ...packet, schemaVersion: 1, packetKind: 'FACTUAL_STATE_ONLY', routeSchemaVersion: 4 },
  ]) {
    const legacyBody = INTERNAL_ROUTE_PREFIX + JSON.stringify({ ...legacy, ...injected });
    assert.equal(parseInternalSupervisorRouteBody(legacyBody), null);
    const snapshot = { workers: [{ id: 'worker-a', timeline: [{
      eventId: 'legacy-forged', sequence: 1, data: { type: 'worker_message_recorded', message_id: 'route-forged', body: legacyBody },
    }] }] };
    assert.equal(extractQueuedRoutes(snapshot, [routeFrom(packet).chat], defaultState()).length, 0);
  }
  const forgedRoute = routeFrom(packet);
  forgedRoute.packet.schemaVersion = 1;
  assert.throws(() => cycleControlPrompt(forgedRoute, 'EXTRA_HIGH_DECISION'), /Invalid owner-response continuation/);
});

test('relay extraction binds continuation to the enclosing worker and fresh prompt rejects mismatches', () => {
  const packet = continuationPacket();
  const route = routeFrom(packet);
  const snapshot = { workers: [{ id: 'worker-a', timeline: [{
    eventId: 'queued', sequence: 1, data: { type: 'worker_message_recorded', message_id: 'route-message', body: body(packet) },
  }] }] };
  assert.equal(extractQueuedRoutes(snapshot, [route.chat], defaultState()).length, 1);
  packet.continuationBinding.worker = 'wrong-worker';
  sign(packet);
  snapshot.workers[0].timeline[0].data.body = body(packet);
  assert.equal(extractQueuedRoutes(snapshot, [route.chat], defaultState()).length, 0);
  assert.throws(() => cycleControlPrompt(routeFrom(packet), 'EXTRA_HIGH_DECISION'), /Invalid owner-response continuation/);
});

test('fresh direct and Pro decision prompts carry exact OWNER bytes and metadata without PM assistant output', () => {
  for (const path of ['DIRECT', 'PROJECT_MANAGER']) {
    for (const [reasoningLane, step] of [['EXTRA_HIGH_DIRECT', 'EXTRA_HIGH_DECISION'], ['PRO_ESCALATED', 'PRO_DECISION']]) {
      const packet = continuationPacket(path, reasoningLane);
      packet.factualPacket.pmAssistantOutput = 'DO NOT TRANSPORT PM ASSISTANT OUTPUT';
      const route = routeFrom(packet);
      const prompt = cycleControlPrompt(route, step);
      assert.ok(prompt.includes(`\nBEGIN EXACT OWNER RESPONSE\n${ownerText}\nEND EXACT OWNER RESPONSE\n`));
      assert.ok(prompt.includes(`continuation_binding: ${canonicalJson(packet.continuationBinding)}.`));
      assert.ok(prompt.includes(`continuation_binding_sha256: ${packet.continuationBindingSha256}.`));
      assert.match(prompt, /Copy the supplied continuation_binding and continuation_binding_sha256 exactly/);
      assert.match(prompt, /optional top-level fields outside binding_envelope/);
      assert.doesNotMatch(prompt, /DO NOT TRANSPORT PM ASSISTANT OUTPUT/);
      const preload = cycleControlPrompt({ ...route, providerSessionId: route.bindingProviderSessionId }, MCP_BINDING_PRELOAD_STEP);
      assert.doesNotMatch(preload, /continuation_binding|BEGIN EXACT OWNER RESPONSE|approved/);
    }
  }
});

test('continuation instruction starts at its line boundary while exact OWNER whitespace remains authoritative', () => {
  for (const [lane, step] of [['EXTRA_HIGH_DIRECT', 'EXTRA_HIGH_DECISION'], ['PRO_ESCALATED', 'PRO_DECISION']]) {
    const packet = continuationPacket('DIRECT', lane);
    const prompt = cycleControlPrompt(routeFrom(packet), step);
    const begin = '\nBEGIN EXACT OWNER RESPONSE\n';
    const end = '\nEND EXACT OWNER RESPONSE\n';
    const ownerStart = prompt.indexOf(begin) + begin.length;
    const ownerEnd = prompt.indexOf(end, ownerStart);
    assert.notEqual(prompt.indexOf(begin), -1);
    assert.notEqual(ownerEnd, -1);
    assert.equal(prompt.slice(ownerStart, ownerEnd), ownerText);
    assert.equal(sha256(prompt.slice(ownerStart, ownerEnd)), packet.continuationBinding.supervisor_delivery.body_sha256);
    assert.match(prompt.slice(ownerEnd + end.length), /^Reason directly in the currently visible /);
    assert.doesNotMatch(prompt.slice(ownerEnd + end.length), /^[ \t\u00a0]/);

    // The formatting fix concerns generated instructions only. A same-length
    // NBSP substitution inside this synthetic OWNER text remains a byte error.
    const alteredOwner = ownerText.replace(' ', '\u00a0');
    const alteredPrompt = prompt.slice(0, ownerStart) + alteredOwner + prompt.slice(ownerEnd);
    assert.equal(alteredPrompt.length, prompt.length);
    assert.equal(composerTextState({ tagName: 'TEXTAREA', value: prompt }, prompt).exact, true);
    assert.equal(composerTextState({ tagName: 'TEXTAREA', value: alteredPrompt }, prompt).exact, false);
  }
});

test('historical route-v4 binding envelope bytes and prompt are unchanged by absent continuation', () => {
  const ordinary = routeFrom(basePacket());
  const continuation = routeFrom(continuationPacket());
  assert.deepEqual(deriveBindingCapsule(continuation, 'provider-session:binding', 'binding-receipt'), ordinary.bindingCapsule);
  assert.equal(Object.hasOwn(ordinary.bindingCapsule.payload, 'continuation_binding'), false);
  assert.equal(Object.hasOwn(ordinary.packet, 'continuationBinding'), false);
  assert.equal(ordinary.bindingCapsule.sha256, '1a88a9cf7c4530840d1ee2783b2de6dd53380e11193ae7b29e387124feb48325');
  const prompt = cycleControlPrompt(ordinary, 'EXTRA_HIGH_DECISION');
  assert.doesNotMatch(prompt, /continuation_binding|OWNER RESPONSE/);
  assert.ok(prompt.includes(`binding_envelope_sha256: ${ordinary.bindingCapsule.sha256}.`));
  assert.match(prompt, /schema_version 3/);
  // Frozen from the unchanged canonical source before the continuation-only
  // generated-padding fix; ordinary Extra High and Pro prompt bytes stay exact.
  assert.equal(sha256(prompt), 'd5dcb75500d8cc11aee313da19404589307f1523e038e8d87bd5dcd8d89cdd1c');
  assert.equal(sha256(cycleControlPrompt(routeFrom(basePacket('PRO_ESCALATED')), 'PRO_DECISION')),
    'ff80ddeeca2a8eff8fec67fa746c2b1c6bfe20e3a8c1c006557550a9e8dafdf2');
});

function basePacket(reasoningLane = 'EXTRA_HIGH_DIRECT') {
  return {
    schemaVersion: 4, packetKind: 'PROVIDER_SESSION_SUPERVISORY_CYCLE', requestId: 'fresh-request', nonce: 'n1', reasoningLane,
    destination: 'SPECIALIST_SUPERVISOR_CHAT', destinationSupervisorId: 'supervisor-a', providerDeliveryState: 'QUEUED_FOR_PROVIDER_RELAY',
    evidenceCapsule: { id: 'capsule-current', sha256: 'a'.repeat(64) }, ownerOutcome: { id: 'outcome-current', epoch: 2, sha256: 'b'.repeat(64) },
    githubReceipt: { repository: 'o/r', issueNumber: 59, stageIssueNumber: 60 },
    factualPacket: { packetId: 'p1', taskId: 't1', exactFactualState: 'x', evidenceRefs: [], decisionRequested: 'Resolve the owner request.' },
    queuedAt: '2026-09-06T12:00:00.000Z', expiresAt: '2026-09-06T12:30:00.000Z',
  };
}

function continuationPacket(path = 'DIRECT', reasoningLane = 'EXTRA_HIGH_DIRECT') {
  const packet = basePacket(reasoningLane);
  const input = {
    event_id: 'owner-input-event', message_id: 'owner-input-message', body_sha256: sha256(ownerText),
    parent_message_id: 'origin-message', surface_role: path === 'DIRECT' ? 'SUPERVISOR' : 'PROJECT_MANAGER',
  };
  packet.continuationBinding = {
    schema_version: 1, kind: 'OWNER_RESPONSE_CONTINUATION', worker: 'worker-a', decision_request_id: 'historical-decision-request',
    supervisor_id: 'supervisor-a', path,
    originating_supervisor_message: { event_id: 'origin-event', message_id: 'origin-message', body_sha256: sha256('Original supervisor question?') },
    owner_input: input,
    supervisor_delivery: path === 'DIRECT'
      ? { event_id: input.event_id, message_id: input.message_id, body_sha256: input.body_sha256, parent_message_id: input.parent_message_id }
      : { event_id: 'forward-event', message_id: 'forward-message', body_sha256: input.body_sha256, parent_message_id: input.message_id },
    owner_outcome: { ...packet.ownerOutcome }, evidence_capsule: { ...packet.evidenceCapsule }, issued_at: packet.queuedAt, expires_at: packet.expiresAt,
  };
  packet.continuationOwnerResponseExactText = ownerText;
  sign(packet);
  return packet;
}

function sign(packet) {
  const { continuation_id, owner_outcome, evidence_capsule, issued_at, expires_at, ...causalFields } = packet.continuationBinding;
  packet.continuationBinding.continuation_id = sha256(canonicalJson(causalFields));
  packet.continuationBindingSha256 = sha256(canonicalJson(packet.continuationBinding));
}

function body(packet) {
  return PROVIDER_SESSION_CYCLE_ROUTE_PREFIX + JSON.stringify(packet);
}

function routeFrom(packet) {
  const route = {
    routeKind: 'SUPERVISORY_CYCLE', requestId: packet.requestId, supervisorId: 'supervisor-a', workerId: 'worker-a',
    providerSessionId: 'provider-session:decision', bindingProviderSessionId: 'provider-session:binding',
    chat: { supervisorId: 'supervisor-a', workerId: 'worker-a', requiredApps: { missionControl: 'Mission Control', github: 'GitHub' } },
    packet: { ...packet, routeSchemaVersion: 4 },
  };
  return { ...route, bindingCapsule: deriveBindingCapsule(route, 'provider-session:binding', 'binding-receipt') };
}
