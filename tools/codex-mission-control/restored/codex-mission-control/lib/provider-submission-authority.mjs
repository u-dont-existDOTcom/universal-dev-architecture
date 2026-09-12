import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeConversationUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com') throw new Error('Supervisor conversation URLs must use https://chatgpt.com.');
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export const MINIMUM_GLOBAL_SUBMISSION_INTERVAL_MS = 60_000;

const OPEN_QUEUE_STATUSES = new Set(['QUEUED', 'PRECLICK_RETRY_PENDING', 'RATE_LIMIT_RETRY_PENDING', 'ADMITTED']);
const QUEUE_STATUSES = new Set([
  ...OPEN_QUEUE_STATUSES,
  'BOUNDARY_RECORDED',
  'AMBIGUOUS_AFTER_RESTART',
  'AMBIGUOUS_INTERVAL_VIOLATION',
  'AMBIGUOUS_EXPIRED_AT_BOUNDARY',
  'AMBIGUOUS_LEASE_VIOLATION',
  'RATE_LIMIT_RETRY_EXHAUSTED',
  'CANCELLED_AT_TAKEOVER',
]);
const ADMISSION_STATUSES = new Set([
  'ADMITTED',
  'BOUNDARY_RECORDED',
  'ABORTED_BEFORE_BOUNDARY',
  'EXPIRED_BEFORE_BOUNDARY',
  'AMBIGUOUS_AFTER_RESTART',
  'AMBIGUOUS_INTERVAL_VIOLATION',
  'AMBIGUOUS_EXPIRED_AT_BOUNDARY',
  'AMBIGUOUS_LEASE_VIOLATION',
]);

export class SubmissionSchedulerError extends Error {
  constructor(code, message, statusCode = 409, detail = {}) {
    super(`${code}: ${message}`);
    this.name = 'SubmissionSchedulerError';
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export class CentralSubmissionScheduler {
  constructor({ stateStore, chats, producerBindings, producerAttestors, pacingDomain = null, minIntervalMs = MINIMUM_GLOBAL_SUBMISSION_INTERVAL_MS, admissionTtlMs = 120_000, now = Date.now }) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.write !== 'function') throw new Error('A durable scheduler state store is required.');
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < MINIMUM_GLOBAL_SUBMISSION_INTERVAL_MS || minIntervalMs > 600_000) {
      throw new Error('The central scheduler interval must be 60000-600000 ms.');
    }
    if (!Number.isInteger(admissionTtlMs) || admissionTtlMs < 30_000 || admissionTtlMs > 600_000) throw new Error('admissionTtlMs must be 30000-600000.');
    if (!Array.isArray(chats) || chats.length === 0) throw new Error('The central scheduler requires a non-empty Mission Control-only supervisor registry.');
    this.producerBindings = new Map(Object.entries(parseSubmissionRelayBindings(producerBindings)));
    this.producerAttestors = new Map(Object.entries(parseSubmissionRelayAttestors(producerAttestors, [...this.producerBindings.keys()])));
    this.pacingDomain = boundedString(pacingDomain, 'pacingDomain', 300);
    this.stateStore = stateStore;
    this.chats = new Map(chats.map((chat) => [chat.supervisorId, chat]));
    this.minIntervalMs = minIntervalMs;
    this.admissionTtlMs = admissionTtlMs;
    this.now = now;
    this.tail = Promise.resolve();
  }

  async activateLease(rawLease) {
    return this.#serialized(async () => {
      const candidate = parseDeploymentLease(rawLease);
      const state = await this.stateStore.read();
      const relayBindingsInitialized = initializeOrValidateRelayBindings(state, this.producerBindings);
      const previous = state.activeLease;
      const nowMs = this.now();
      if (Date.parse(candidate.issuedAt) > nowMs || Date.parse(candidate.expiresAt) <= nowMs) {
        throw new SubmissionSchedulerError('DEPLOYMENT_LEASE_STALE', 'A scheduler may activate only a currently valid lease.');
      }
      if (!previous) {
        if (candidate.epoch !== 1 || candidate.takeover !== null) {
          throw new SubmissionSchedulerError('LEASE_HISTORY_MISSING', 'A new scheduler ledger may activate only an epoch-1 lease without takeover claims.');
        }
      } else if (sameLease(previous, candidate)) {
        if (relayBindingsInitialized) await this.stateStore.write(state);
        return candidate;
      } else if (sameLeaseIdentity(previous, candidate)) {
        if (!sameRenewalFields(previous, candidate) || Date.parse(candidate.expiresAt) <= Date.parse(previous.expiresAt)) {
          throw new SubmissionSchedulerError('LEASE_RENEWAL_INVALID', 'Same-lease renewal may only extend expiresAt without changing authority fields.');
        }
        state.activeLease = candidate;
        state.leaseHistory.push(candidate);
        await this.stateStore.write(state);
        return candidate;
      } else {
        validateLeaseTransition(previous, candidate, state, this.minIntervalMs, nowMs);
        for (const item of state.queueItems.filter((entry) => ['QUEUED', 'PRECLICK_RETRY_PENDING'].includes(entry.status))) {
          item.status = 'CANCELLED_AT_TAKEOVER';
          item.terminalAt = new Date(nowMs).toISOString();
          item.cancelledByLeaseId = candidate.leaseId;
        }
      }
      state.activeLease = candidate;
      state.leaseHistory.push(candidate);
      await this.stateStore.write(state);
      return candidate;
    });
  }

  async status() {
    const state = await this.stateStore.read();
    return schedulerStatus(state, this.minIntervalMs, this.now());
  }

  async producerBinding(producerId) {
    const state = await this.stateStore.read();
    const binding = state.relayBindings[producerId];
    if (!binding) throw new SubmissionSchedulerError('SUBMISSION_RELAY_BINDING_MISSING', 'The authenticated producer has no durable Mission Control relay-host binding.', 403);
    return structuredClone(binding);
  }

  async beginRelayTargetTransition(raw, producerId) {
    return this.#serialized(async () => {
      const input = parseRelayTargetTransition(raw, 'BEGIN');
      this.#verifyRelayTargetTransitionProof(input, producerId);
      const state = await this.stateStore.read();
      const binding = requireDurableRelayBinding(state, producerId);
      assertRelayTransitionAuthority(state.activeLease, binding, input, this.now());
      const existing = state.relayTargetTransition;
      if (existing) {
        if (existing.producerId === producerId && existing.transitionId === input.transitionId
          && existing.beginFingerprint === relayTransitionFingerprint(input)) {
          return { begun: true, duplicate: true, transitionId: input.transitionId, binding: publicRelayBinding(binding) };
        }
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_BUSY', 'A durable relay target transition is already open.');
      }
      if (state.admissions.some((item) => item.status === 'ADMITTED' || item.status === 'AMBIGUOUS_AFTER_RESTART')) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_SEND_AMBIGUITY', 'Target transitions require no open or restart-ambiguous admission.');
      }
      if (state.safetyHalt) throw new SubmissionSchedulerError('SUBMISSION_SAFETY_HALT', 'A prior boundary inconsistency blocks target transitions.');
      assertExactTargetSet(input.priorOwnedTargetIds, binding.ownedTargetIds, 'RELAY_TARGET_TRANSITION_PRIOR_SET_MISMATCH');
      if (input.priorBindingRevision !== binding.bindingRevision) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_REVISION_MISMATCH', 'The target transition names a stale binding revision.');
      }
      if (['RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(input.operation)
        && state.queueItems.some((item) => OPEN_QUEUE_STATUSES.has(item.status))) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_QUEUE_NOT_QUIESCENT', 'Recovery transitions require no nonterminal durable queue item.');
      }
      if (input.operation === 'ADD') {
        if (!binding.ownedTargetIds.includes(input.anchorTargetId)) throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_ANCHOR_MISSING', 'ADD requires an existing exact anchor target.');
        if (binding.ownedTargetIds.length >= 3) throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_HARD_CEILING', 'ADD would exceed the three-target browser hard ceiling.');
      } else if (input.operation !== 'WINDOW_REPLACE' && !binding.ownedTargetIds.includes(input.targetId)) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_TARGET_MISSING', 'REMOVE requires an exact currently owned target.');
      } else if (input.operation !== 'WINDOW_REPLACE'
        && state.queueItems.some((item) => OPEN_QUEUE_STATUSES.has(item.status) && item.request?.targetId === input.targetId)) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_TARGET_IN_USE', 'REMOVE is blocked while an open durable queue item still binds the target.');
      }
      state.relayTargetTransition = {
        transitionId: input.transitionId,
        producerId,
        operation: input.operation,
        hostAlias: input.hostAlias,
        hostRole: input.hostRole,
        deploymentEpoch: input.deploymentEpoch,
        leaseId: input.leaseId,
        automationWindowId: input.automationWindowId,
        priorBindingRevision: input.priorBindingRevision,
        priorOwnedTargetIds: [...input.priorOwnedTargetIds],
        anchorTargetId: input.anchorTargetId,
        targetId: input.targetId,
        reason: input.reason,
        beginFingerprint: relayTransitionFingerprint(input),
        begunAt: new Date(this.now()).toISOString(),
      };
      await this.stateStore.write(state);
      return { begun: true, duplicate: false, transitionId: input.transitionId, binding: publicRelayBinding(binding) };
    });
  }

  async commitRelayTargetTransition(raw, producerId) {
    return this.#serialized(async () => {
      const input = parseRelayTargetTransition(raw, 'COMMIT');
      this.#verifyRelayTargetTransitionProof(input, producerId);
      const state = await this.stateStore.read();
      const binding = requireDurableRelayBinding(state, producerId);
      const transition = state.relayTargetTransition;
      if (!transition) {
        if (binding.lastTransitionId === input.transitionId
          && binding.bindingRevision === input.priorBindingRevision + 1
          && exactTargetSetsEqual(binding.ownedTargetIds, input.postOwnedTargetIds)
          && binding.automationWindowId === input.postAutomationWindowId) {
          assertRelayTransitionDuplicateAuthority(state.activeLease, binding, input, this.now());
          return { committed: true, duplicate: true, transitionId: input.transitionId, binding: publicRelayBinding(binding) };
        }
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_MISSING', 'No durable target transition is open.');
      }
      assertRelayTransitionAuthority(state.activeLease, binding, input, this.now());
      assertRelayTransitionIdentity(transition, input, producerId);
      assertExactTargetSet(input.priorOwnedTargetIds, transition.priorOwnedTargetIds, 'RELAY_TARGET_TRANSITION_PRIOR_SET_MISMATCH');
      assertExactTargetSet(binding.ownedTargetIds, transition.priorOwnedTargetIds, 'RELAY_TARGET_TRANSITION_BINDING_CHANGED');
      if (binding.bindingRevision !== transition.priorBindingRevision) throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_REVISION_MISMATCH', 'The durable binding revision changed while the transition was open.');
      assertRelayTargetDelta(transition, input.postOwnedTargetIds, input.transitionedTargetId);
      if (transition.operation === 'WINDOW_REPLACE') {
        if (input.postAutomationWindowId === transition.automationWindowId) {
          throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_DELTA_INVALID', 'WINDOW_REPLACE requires a fresh automation window identity.');
        }
        binding.automationWindowId = input.postAutomationWindowId;
      } else if (input.postAutomationWindowId !== transition.automationWindowId) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_DELTA_INVALID', 'Only WINDOW_REPLACE may change the automation window identity.');
      }
      binding.ownedTargetIds = [...input.postOwnedTargetIds];
      binding.bindingRevision += 1;
      binding.lastTransitionId = input.transitionId;
      state.relayTargetTransition = null;
      await this.stateStore.write(state);
      return { committed: true, duplicate: false, transitionId: input.transitionId, binding: publicRelayBinding(binding) };
    });
  }

  async abortRelayTargetTransition(raw, producerId) {
    return this.#serialized(async () => {
      const input = parseRelayTargetTransition(raw, 'ABORT');
      this.#verifyRelayTargetTransitionProof(input, producerId);
      const state = await this.stateStore.read();
      const binding = requireDurableRelayBinding(state, producerId);
      assertRelayTransitionAuthority(state.activeLease, binding, input, this.now());
      const transition = state.relayTargetTransition;
      if (!transition) return { aborted: true, duplicate: true, transitionId: input.transitionId, binding: publicRelayBinding(binding) };
      assertRelayTransitionIdentity(transition, input, producerId);
      if (input.observedAutomationWindowId !== transition.automationWindowId) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_ABORT_OBSERVATION_MISMATCH', 'Abort requires the unchanged prior automation window identity.');
      }
      assertExactTargetSet(input.observedOwnedTargetIds, transition.priorOwnedTargetIds, 'RELAY_TARGET_TRANSITION_ABORT_OBSERVATION_MISMATCH');
      assertExactTargetSet(binding.ownedTargetIds, transition.priorOwnedTargetIds, 'RELAY_TARGET_TRANSITION_BINDING_CHANGED');
      state.relayTargetTransition = null;
      await this.stateStore.write(state);
      return { aborted: true, duplicate: false, transitionId: input.transitionId, binding: publicRelayBinding(binding) };
    });
  }

  async validateAdmission(raw, producerId) {
    return this.#serialized(async () => {
      const root = requiredRecord(raw, 'Admission validation');
      const admissionId = boundedString(root.admissionId, 'admissionId', 300);
      const state = await this.stateStore.read();
      const admission = state.admissions.find((item) => item.admissionId === admissionId);
      if (!admission) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_UNKNOWN', 'The validation names no durable admission.', 404);
      if (admission.producerId !== producerId) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_PRODUCER_MISMATCH', 'Only the admitting producer may validate it.', 403);
      if (admission.status !== 'ADMITTED') throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_NOT_OPEN', `Admission is ${admission.status}.`);
      const nowMs = this.now();
      if (Date.parse(admission.expiresAt) <= nowMs) {
        admission.status = 'EXPIRED_BEFORE_BOUNDARY';
        admission.abortedAt = new Date(nowMs).toISOString();
        admission.abortStage = 'ADMISSION_EXPIRED_BEFORE_CLICK';
        const item = state.queueItems.find((entry) => entry.queueItemId === admission.queueItemId);
        if (item) {
          item.status = 'PRECLICK_RETRY_PENDING';
          item.lastPreclickAbortAt = admission.abortedAt;
        }
        await this.stateStore.write(state);
        throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_EXPIRED', 'The single-use admission expired before the send click.');
      }
      assertActiveLease(state.activeLease, admission, nowMs);
      return {
        valid: true,
        admissionId,
        expiresAt: admission.expiresAt,
        minimumIntervalMs: this.minIntervalMs,
        leaseEpoch: state.activeLease.epoch,
        hostAlias: state.activeLease.activeHostAlias,
        hostRole: state.activeLease.activeHostRole,
      };
    });
  }

  async admit(raw, producerId) {
    return this.#serialized(async () => {
      let request = parseAdmission(raw);
      const state = await this.stateStore.read();
      const nowMs = this.now();
      initializeOrValidateRelayBindings(state, this.producerBindings);
      assertProducerBinding(state.relayBindings, producerId, request);
      if (state.relayTargetTransition) {
        throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_OPEN', 'No send admission is permitted while an exact relay target transition is open.');
      }
      assertActiveLease(state.activeLease, request, nowMs);
      let chat = assertRegistryTarget(this.chats, state, request);
      for (const admission of state.admissions) {
        if (admission.status === 'ADMITTED' && Date.parse(admission.expiresAt) <= nowMs) {
          admission.status = 'AMBIGUOUS_AFTER_RESTART';
          const item = state.queueItems.find((entry) => entry.queueItemId === admission.queueItemId);
          if (item) {
            item.status = 'AMBIGUOUS_AFTER_RESTART';
            item.terminalAt = new Date(nowMs).toISOString();
          }
        }
      }
      if (state.admissions.some((item) => item.status === 'AMBIGUOUS_AFTER_RESTART')) {
        await this.stateStore.write(state);
        throw new SubmissionSchedulerError('SUBMISSION_RESTART_AMBIGUITY', 'An admitted send lacks a durable boundary or proven pre-click abort; automatic replay is prohibited.');
      }
      if (state.safetyHalt) throw new SubmissionSchedulerError('SUBMISSION_SAFETY_HALT', 'A prior boundary inconsistency requires explicit reconciliation before any further send.', 409, state.safetyHalt);
      const providerRateLimitCount = rateLimitCount(state, request.retryRootKey);
      const accountRateLimit = state.queueItems.find((item) => item.status === 'RATE_LIMIT_RETRY_PENDING');
      if (accountRateLimit && accountRateLimit.retryRootKey !== request.retryRootKey) {
        throw new SubmissionSchedulerError('ACCOUNT_RATE_LIMIT_ACTIVE', 'The provider account is paused for the one bounded retry owned by another queue item.', 409, {
          queueItemId: accountRateLimit.queueItemId,
          providerRateLimitCount: rateLimitCount(state, accountRateLimit.retryRootKey),
        });
      }
      if (providerRateLimitCount >= 2) {
        throw new SubmissionSchedulerError('CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED', 'The one bounded provider retry is already durably exhausted.');
      }
      if (providerRateLimitCount === 1) {
        const observedAt = [...state.admissions].reverse().find((item) => item.retryRootKey === request.retryRootKey && item.providerRateLimitObservedAt)?.providerRateLimitObservedAt;
        const providerRetryAfterMs = Math.max(0, Date.parse(observedAt) + 30_000 - nowMs);
        if (providerRetryAfterMs > 0) {
          throw new SubmissionSchedulerError('PROVIDER_RATE_LIMIT_COOLDOWN', `Retry after ${providerRetryAfterMs} ms.`, 409, {
            retryAfterMs: providerRetryAfterMs,
            providerRateLimitObservedAt: observedAt,
          });
        }
      }
      const fingerprint = requestFingerprint(request);
      const logicalFingerprint = logicalRequestFingerprint(request);
      let queueItem = [...state.queueItems].reverse().find((item) => item.queueKey === request.queueKey && item.status !== 'CANCELLED_AT_TAKEOVER');
      if (queueItem && queueItem.requestFingerprint !== fingerprint) {
        const takeoverRetry = queueItem.status === 'RATE_LIMIT_RETRY_PENDING'
          && queueItem.logicalFingerprint === logicalFingerprint
          && request.deploymentEpoch > queueItem.request.deploymentEpoch
          && request.deploymentEpoch === state.activeLease.epoch;
        if (!takeoverRetry) {
          throw new SubmissionSchedulerError('SUBMISSION_QUEUE_KEY_CONFLICT', 'The queue key already binds different immutable send fields.');
        }
        queueItem.takeoverRebindings.push({
          reboundAt: new Date(nowMs).toISOString(),
          fromHostAlias: queueItem.request.hostAlias,
          fromDeploymentEpoch: queueItem.request.deploymentEpoch,
          fromLeaseId: queueItem.request.leaseId,
          fromRequestFingerprint: queueItem.requestFingerprint,
          toHostAlias: request.hostAlias,
          toDeploymentEpoch: request.deploymentEpoch,
          toLeaseId: request.leaseId,
          toRequestFingerprint: fingerprint,
        });
        queueItem.request = request;
        queueItem.requestFingerprint = fingerprint;
      }
      const cancelledPrior = [...state.queueItems].reverse().find((item) => item.queueKey === request.queueKey && item.status === 'CANCELLED_AT_TAKEOVER');
      if (!queueItem && cancelledPrior && cancelledPrior.logicalFingerprint !== logicalFingerprint) {
        throw new SubmissionSchedulerError('SUBMISSION_QUEUE_KEY_CONFLICT', 'A takeover may rebind only the same logical send to the successor host and target.');
      }
      if (!queueItem) {
        queueItem = {
          sequence: state.nextQueueSequence++,
          queueItemId: `send-queue-item:${randomUUID()}`,
          queueKey: request.queueKey,
          requestFingerprint: fingerprint,
          logicalFingerprint,
          retryRootKey: request.retryRootKey,
          request,
          status: 'QUEUED',
          queuedAt: new Date(nowMs).toISOString(),
          admissionIds: [],
          terminalAt: null,
          takeoverRebindings: [],
        };
        state.queueItems.push(queueItem);
        await this.stateStore.write(state);
      }
      if (queueItem.status === 'RATE_LIMIT_RETRY_EXHAUSTED') throw new SubmissionSchedulerError('CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED', 'The one bounded provider retry is already durably exhausted.');
      if (!OPEN_QUEUE_STATUSES.has(queueItem.status)) throw new SubmissionSchedulerError('SUBMISSION_QUEUE_ITEM_TERMINAL', `This queue item is terminal (${queueItem.status}).`);
      if (queueItem.status === 'ADMITTED') throw new SubmissionSchedulerError('SUBMISSION_QUEUE_BUSY', 'This queue item already holds an open single-use admission.');
      const head = state.queueItems.find((item) => OPEN_QUEUE_STATUSES.has(item.status));
      if (!head || head.queueItemId !== queueItem.queueItemId) {
        const position = state.queueItems.filter((item) => OPEN_QUEUE_STATUSES.has(item.status) && item.sequence <= queueItem.sequence).length;
        throw new SubmissionSchedulerError('SUBMISSION_QUEUED', `Queue item is waiting at position ${position}.`, 409, { queueItemId: queueItem.queueItemId, position });
      }
      const lastMs = Date.parse(state.lastBoundaryAt ?? '');
      const retryAfterMs = Number.isFinite(lastMs) ? Math.max(0, lastMs + this.minIntervalMs - nowMs) : 0;
      if (retryAfterMs > 0) {
        throw new SubmissionSchedulerError('GLOBAL_SUBMISSION_COOLDOWN', `Retry after ${retryAfterMs} ms.`, 409, {
          minimumIntervalMs: this.minIntervalMs,
          lastSubmissionAt: state.lastBoundaryAt,
          retryAfterMs,
          nextSubmissionAt: new Date(lastMs + this.minIntervalMs).toISOString(),
        });
      }
      const admittedAt = new Date(nowMs).toISOString();
      const admission = {
        sequence: state.nextSequence++,
        admissionId: `send-admission:${randomUUID()}`,
        queueItemId: queueItem.queueItemId,
        producerId,
        ...request,
        admittedAt,
        expiresAt: new Date(nowMs + this.admissionTtlMs).toISOString(),
        status: 'ADMITTED',
        previousGlobalBoundaryAt: state.lastBoundaryAt,
        boundaryAt: null,
        boundaryKind: null,
        conversationUrlSha256: null,
        boundaryRecordedAt: null,
        abortedAt: null,
        abortStage: null,
        deliveryStatus: null,
        recoveryStatus: null,
        outcomeRecordedAt: null,
      };
      state.admissions.push(admission);
      queueItem.status = 'ADMITTED';
      queueItem.admissionIds.push(admission.admissionId);
      queueItem.admittedAt = admittedAt;
      await this.stateStore.write(state);
      return {
        admitted: true,
        admissionId: admission.admissionId,
        queueItemId: queueItem.queueItemId,
        admittedAt,
        expiresAt: admission.expiresAt,
        singleUse: true,
        minimumIntervalMs: this.minIntervalMs,
        leaseEpoch: state.activeLease.epoch,
        hostAlias: state.activeLease.activeHostAlias,
        hostRole: state.activeLease.activeHostRole,
        providerRateLimitCount,
        previousGlobalSubmissionBoundaryAt: admission.previousGlobalBoundaryAt,
        registry: { supervisorId: chat.supervisorId, registrationId: chat.registrationId, ownership: chat.ownership, purpose: chat.purpose },
      };
    });
  }

  async recordBoundary(raw, producerId) {
    return this.#serialized(async () => {
      const input = parseBoundary(raw);
      const state = await this.stateStore.read();
      const admission = state.admissions.find((item) => item.admissionId === input.admissionId);
      if (!admission) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_UNKNOWN', 'The boundary names no durable admission.', 404);
      if (admission.producerId !== producerId) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_PRODUCER_MISMATCH', 'Only the admitting producer may record the boundary.', 403);
      if (admission.status === 'BOUNDARY_RECORDED') {
        if (admission.boundaryAt === input.boundaryAt && admission.boundaryKind === input.boundaryKind
          && admission.conversationUrlSha256 === input.conversationUrlSha256) {
          return { recorded: true, duplicate: true, ...input };
        }
        throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_ALREADY_USED', 'A single-use admission cannot record a different second boundary.');
      }
      if (admission.status !== 'ADMITTED') throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_NOT_OPEN', `Admission is ${admission.status}.`);
      const queueItem = state.queueItems.find((item) => item.queueItemId === admission.queueItemId);
      if (!queueItem || queueItem.status !== 'ADMITTED') throw new SubmissionSchedulerError('SUBMISSION_QUEUE_BINDING_INVALID', 'Admission is not bound to the active durable queue head.');
      const boundaryMs = Date.parse(input.boundaryAt);
      const admittedMs = Date.parse(admission.admittedAt);
      const previousMs = Date.parse(state.lastBoundaryAt ?? '');
      const nowMs = this.now();
      let authorityViolation = null;
      if (boundaryMs > nowMs + 5_000) authorityViolation = ['SUBMISSION_BOUNDARY_IN_FUTURE', 'AMBIGUOUS_INTERVAL_VIOLATION'];
      else if (boundaryMs >= Date.parse(admission.expiresAt)) authorityViolation = ['SUBMISSION_ADMISSION_EXPIRED_AT_BOUNDARY', 'AMBIGUOUS_EXPIRED_AT_BOUNDARY'];
      else {
        try { assertActiveLease(state.activeLease, admission, boundaryMs); }
        catch { authorityViolation = ['SUBMISSION_LEASE_INVALID_AT_BOUNDARY', 'AMBIGUOUS_LEASE_VIOLATION']; }
      }
      if (authorityViolation) {
        const [code, status] = authorityViolation;
        Object.assign(admission, {
          status,
          boundaryAt: input.boundaryAt,
          boundaryKind: input.boundaryKind,
          conversationUrlSha256: input.conversationUrlSha256,
          boundaryRecordedAt: new Date(nowMs).toISOString(),
        });
        queueItem.status = status;
        queueItem.terminalAt = admission.boundaryRecordedAt;
        if (!Number.isFinite(previousMs) || boundaryMs > previousMs) state.lastBoundaryAt = input.boundaryAt;
        state.safetyHalt = { code, admissionId: admission.admissionId, queueItemId: queueItem.queueItemId, boundaryAt: input.boundaryAt };
        await this.stateStore.write(state);
        throw new SubmissionSchedulerError(code, 'Observed browser boundary did not have current admission authority; scheduler is halted fail closed.');
      }
      if (boundaryMs < admittedMs || (Number.isFinite(previousMs) && boundaryMs < previousMs + this.minIntervalMs)) {
        Object.assign(admission, { status: 'AMBIGUOUS_INTERVAL_VIOLATION', boundaryAt: input.boundaryAt, boundaryKind: input.boundaryKind, boundaryRecordedAt: new Date(this.now()).toISOString() });
        queueItem.status = 'AMBIGUOUS_INTERVAL_VIOLATION';
        queueItem.terminalAt = admission.boundaryRecordedAt;
        state.lastBoundaryAt = Number.isFinite(previousMs) && previousMs > boundaryMs ? state.lastBoundaryAt : input.boundaryAt;
        state.safetyHalt = { code: boundaryMs < admittedMs ? 'SUBMISSION_BOUNDARY_PRECEDES_ADMISSION' : 'GLOBAL_SUBMISSION_INTERVAL_VIOLATION', admissionId: admission.admissionId, queueItemId: queueItem.queueItemId, boundaryAt: input.boundaryAt };
        await this.stateStore.write(state);
        throw new SubmissionSchedulerError(state.safetyHalt.code, 'Observed browser boundary is temporally inconsistent; scheduler is halted fail closed.');
      }
      Object.assign(admission, {
        status: 'BOUNDARY_RECORDED',
        boundaryAt: input.boundaryAt,
        boundaryKind: input.boundaryKind,
        conversationUrlSha256: input.conversationUrlSha256,
        boundaryRecordedAt: new Date(this.now()).toISOString(),
      });
      state.lastBoundaryAt = input.boundaryAt;
      queueItem.status = 'BOUNDARY_RECORDED';
      queueItem.terminalAt = input.boundaryAt;
      if (input.conversationUrlSha256 && admission.targetKind === 'FRESH_PROVIDER_SESSION') {
        state.targetBindings[admission.targetKey] = {
          supervisorId: admission.supervisorId,
          registrationId: admission.registrationId,
          conversationUrlSha256: input.conversationUrlSha256,
          boundByAdmissionId: admission.admissionId,
          boundAt: input.boundaryAt,
        };
      }
      await this.stateStore.write(state);
      return { recorded: true, duplicate: false, ...input };
    });
  }

  async bindTarget(raw, producerId) {
    return this.#serialized(async () => {
      const root = requiredRecord(raw, 'Target binding');
      const admissionId = boundedString(root.admissionId, 'admissionId', 300);
      const conversationUrlSha256 = sha(root.conversationUrlSha256, 'conversationUrlSha256');
      const state = await this.stateStore.read();
      const admission = state.admissions.find((item) => item.admissionId === admissionId);
      if (!admission) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_UNKNOWN', 'The binding names no durable admission.', 404);
      if (admission.producerId !== producerId) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_PRODUCER_MISMATCH', 'Only the admitting producer may bind its target.', 403);
      if (admission.status !== 'BOUNDARY_RECORDED' || admission.targetKind !== 'FRESH_PROVIDER_SESSION') {
        throw new SubmissionSchedulerError('SUBMISSION_TARGET_BINDING_INVALID', 'Only a crossed fresh-provider admission may bind its assigned conversation.');
      }
      const existing = state.targetBindings[admission.targetKey];
      if (existing) {
        if (existing.conversationUrlSha256 === conversationUrlSha256 && existing.boundByAdmissionId === admissionId) {
          return { bound: true, duplicate: true, targetKey: admission.targetKey, conversationUrlSha256 };
        }
        throw new SubmissionSchedulerError('SUBMISSION_TARGET_BINDING_CONFLICT', 'The provider session already binds a different conversation.');
      }
      admission.conversationUrlSha256 = conversationUrlSha256;
      state.targetBindings[admission.targetKey] = {
        supervisorId: admission.supervisorId,
        registrationId: admission.registrationId,
        conversationUrlSha256,
        boundByAdmissionId: admission.admissionId,
        boundAt: new Date(this.now()).toISOString(),
      };
      await this.stateStore.write(state);
      return { bound: true, duplicate: false, targetKey: admission.targetKey, conversationUrlSha256 };
    });
  }

  async recordRateLimit(raw, producerId) {
    return this.#serialized(async () => {
      const root = requiredRecord(raw, 'Provider rate-limit record');
      const admissionId = boundedString(root.admissionId, 'admissionId', 300);
      const state = await this.stateStore.read();
      const admission = state.admissions.find((item) => item.admissionId === admissionId);
      if (!admission) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_UNKNOWN', 'The rate-limit record names no durable admission.', 404);
      if (admission.producerId !== producerId) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_PRODUCER_MISMATCH', 'Only the admitting producer may record provider rate limiting.', 403);
      if (!['BOUNDARY_RECORDED', 'ABORTED_BEFORE_BOUNDARY'].includes(admission.status)) {
        throw new SubmissionSchedulerError('SUBMISSION_RATE_LIMIT_STAGE_INVALID', `Admission is ${admission.status}.`);
      }
      if (!admission.providerRateLimitObservedAt) {
        admission.providerRateLimitObservedAt = new Date(this.now()).toISOString();
      }
      const count = rateLimitCount(state, admission.retryRootKey);
      const queueItem = state.queueItems.find((item) => item.queueItemId === admission.queueItemId);
      if (!queueItem) throw new SubmissionSchedulerError('SUBMISSION_QUEUE_BINDING_INVALID', 'Rate-limit admission has no durable queue item.');
      if (count === 1) {
        queueItem.status = 'RATE_LIMIT_RETRY_PENDING';
        queueItem.terminalAt = null;
      } else {
        queueItem.status = 'RATE_LIMIT_RETRY_EXHAUSTED';
        queueItem.terminalAt = admission.providerRateLimitObservedAt;
        state.safetyHalt = {
          code: 'CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED',
          admissionId: admission.admissionId,
          queueItemId: queueItem.queueItemId,
          boundaryAt: admission.providerRateLimitObservedAt,
        };
      }
      await this.stateStore.write(state);
      return { recorded: true, admissionId, providerRateLimitCount: count, retryExhausted: count >= 2 };
    });
  }

  async abortBeforeBoundary(raw, producerId) {
    return this.#serialized(async () => {
      const root = requiredRecord(raw, 'Submission abort');
      const admissionId = boundedString(root.admissionId, 'admissionId', 300);
      const relayStage = boundedString(root.relayStage, 'relayStage', 100);
      const failureKind = root.failureKind === 'PROVIDER_RATE_LIMIT' ? 'PROVIDER_RATE_LIMIT' : 'PRECLICK_FAILURE';
      if (['CLICKED', 'GENERATION_STARTED', 'UNKNOWN'].includes(relayStage)) {
        throw new SubmissionSchedulerError('SUBMISSION_ABORT_BOUNDARY_UNPROVEN', 'A specific pre-click stage is required to release an admission.');
      }
      const state = await this.stateStore.read();
      const admission = state.admissions.find((item) => item.admissionId === admissionId);
      if (!admission) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_UNKNOWN', 'The abort names no durable admission.', 404);
      if (admission.producerId !== producerId) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_PRODUCER_MISMATCH', 'Only the admitting producer may abort it.', 403);
      if (admission.status !== 'ADMITTED') throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_NOT_OPEN', `Admission is ${admission.status}.`);
      const queueItem = state.queueItems.find((item) => item.queueItemId === admission.queueItemId);
      if (!queueItem || queueItem.status !== 'ADMITTED') throw new SubmissionSchedulerError('SUBMISSION_QUEUE_BINDING_INVALID', 'Admission is not bound to the active durable queue item.');
      admission.status = 'ABORTED_BEFORE_BOUNDARY';
      admission.abortStage = relayStage;
      admission.abortedAt = new Date(this.now()).toISOString();
      if (failureKind === 'PROVIDER_RATE_LIMIT' && !admission.providerRateLimitObservedAt) admission.providerRateLimitObservedAt = admission.abortedAt;
      const count = rateLimitCount(state, admission.retryRootKey);
      queueItem.status = count >= 2
        ? 'RATE_LIMIT_RETRY_EXHAUSTED'
        : failureKind === 'PROVIDER_RATE_LIMIT' ? 'RATE_LIMIT_RETRY_PENDING' : 'PRECLICK_RETRY_PENDING';
      queueItem.lastPreclickAbortAt = admission.abortedAt;
      if (count >= 2) {
        queueItem.terminalAt = admission.abortedAt;
        state.safetyHalt = {
          code: 'CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED',
          admissionId: admission.admissionId,
          queueItemId: queueItem.queueItemId,
          boundaryAt: admission.abortedAt,
        };
      }
      await this.stateStore.write(state);
      return { aborted: true, admissionId, relayStage, failureKind, providerRateLimitCount: count, retryExhausted: count >= 2 };
    });
  }

  async recordOutcome(raw, producerId) {
    return this.#serialized(async () => {
      const root = requiredRecord(raw, 'Submission outcome');
      const admissionId = boundedString(root.admissionId, 'admissionId', 300);
      const deliveryStatus = boundedString(root.deliveryStatus, 'deliveryStatus', 100);
      const recoveryStatus = boundedString(root.recoveryStatus, 'recoveryStatus', 100);
      if (!['DELIVERED', 'GENERATION_STARTED', 'PROVIDER_RATE_LIMITED', 'FAILED_CLOSED'].includes(deliveryStatus)) {
        throw new SubmissionSchedulerError('SUBMISSION_OUTCOME_INVALID', 'deliveryStatus is invalid.', 400);
      }
      if (!['NOT_REQUIRED', 'BOUNDED_RETRY_PENDING', 'RECOVERED', 'FAILED_CLOSED'].includes(recoveryStatus)) {
        throw new SubmissionSchedulerError('SUBMISSION_OUTCOME_INVALID', 'recoveryStatus is invalid.', 400);
      }
      const state = await this.stateStore.read();
      const admission = state.admissions.find((item) => item.admissionId === admissionId);
      if (!admission) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_UNKNOWN', 'The outcome names no durable admission.', 404);
      if (admission.producerId !== producerId) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_PRODUCER_MISMATCH', 'Only the admitting producer may record its outcome.', 403);
      if (!['BOUNDARY_RECORDED', 'ABORTED_BEFORE_BOUNDARY'].includes(admission.status)) {
        throw new SubmissionSchedulerError('SUBMISSION_OUTCOME_STAGE_INVALID', `Admission is ${admission.status}.`);
      }
      if (admission.deliveryStatus !== null || admission.recoveryStatus !== null) {
        if (admission.deliveryStatus === deliveryStatus && admission.recoveryStatus === recoveryStatus) {
          return { recorded: true, duplicate: true, admissionId, deliveryStatus, recoveryStatus };
        }
        throw new SubmissionSchedulerError('SUBMISSION_OUTCOME_CONFLICT', 'A terminal delivery/recovery outcome is append-only and cannot be changed.');
      }
      admission.deliveryStatus = deliveryStatus;
      admission.recoveryStatus = recoveryStatus;
      admission.outcomeRecordedAt = new Date(this.now()).toISOString();
      await this.stateStore.write(state);
      return { recorded: true, duplicate: false, admissionId, deliveryStatus, recoveryStatus };
    });
  }

  #serialized(operation) {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  #verifyRelayTargetTransitionProof(input, producerId) {
    if (input.pacingDomain !== this.pacingDomain || input.producerId !== producerId) {
      throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_SCOPE_MISMATCH', 'The signed transition scope does not match this authority or producer.', 403);
    }
    const secret = this.producerAttestors.get(producerId);
    if (!secret) throw new SubmissionSchedulerError('RELAY_TARGET_ATTESTOR_MISSING', 'No binding attestor is configured for this producer.', 403);
    const expected = createHmac('sha256', secret).update(canonicalJson(relayTransitionProofPayload(input))).digest();
    const supplied = Buffer.from(input.proof, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new SubmissionSchedulerError('RELAY_TARGET_ATTESTATION_INVALID', 'The target transition attestation is invalid.', 403);
    }
  }
}

export function parseDeploymentLease(value) {
  const root = requiredRecord(value, 'Deployment lease');
  if (root.schemaVersion !== 1) throw new Error('Deployment lease schemaVersion must be 1.');
  const issuedAt = isoTimestamp(root.issuedAt, 'issuedAt');
  const expiresAt = isoTimestamp(root.expiresAt, 'expiresAt');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error('Deployment lease expiresAt must follow issuedAt.');
  if (root.splitBrainStatus !== 'SINGLE_ACTIVE_CONFIRMED') throw new Error('Deployment lease must explicitly confirm SINGLE_ACTIVE_CONFIRMED.');
  return {
    schemaVersion: 1,
    leaseId: boundedString(root.leaseId, 'leaseId', 300),
    epoch: positiveInteger(root.epoch, 'epoch'),
    activeHostAlias: boundedString(root.activeHostAlias, 'activeHostAlias', 100),
    activeHostRole: hostRole(root.activeHostRole),
    issuedAt,
    expiresAt,
    splitBrainStatus: 'SINGLE_ACTIVE_CONFIRMED',
    takeover: root.takeover === null || root.takeover === undefined ? null : parseTakeover(root.takeover),
  };
}

export function parseSubmissionRelayBindings(value) {
  const root = requiredRecord(value, 'Submission relay bindings');
  const entries = Object.entries(root);
  if (entries.length === 0) throw new Error('Submission relay bindings must contain at least one producer.');
  const result = Object.create(null);
  for (const [producerId, raw] of entries) {
    const binding = requiredRecord(raw, `Submission relay binding ${producerId}`);
    result[boundedString(producerId, 'producerId', 180)] = {
      hostAlias: boundedString(binding.hostAlias, `${producerId}.hostAlias`, 100),
      hostRole: hostRole(binding.hostRole),
      automationWindowId: positiveInteger(binding.automationWindowId, `${producerId}.automationWindowId`),
      ownedTargetIds: stringArray(binding.ownedTargetIds, `${producerId}.ownedTargetIds`, 300).sort(),
      bindingRevision: binding.bindingRevision == null ? 1 : positiveInteger(binding.bindingRevision, `${producerId}.bindingRevision`),
      lastTransitionId: binding.lastTransitionId == null ? null : boundedString(binding.lastTransitionId, `${producerId}.lastTransitionId`, 300),
    };
    if (result[producerId].ownedTargetIds.length === 0) {
      throw new Error(`${producerId}.ownedTargetIds must contain at least one exact automation-owned target.`);
    }
  }
  return result;
}

export function parseSubmissionRelayAttestors(value, producerIds) {
  const root = requiredRecord(value, 'Submission relay attestors');
  const expected = [...producerIds].sort();
  const actual = Object.keys(root).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Submission relay attestors must exactly match the configured relay producer IDs.');
  const result = Object.create(null);
  for (const producerId of expected) {
    result[producerId] = boundedSecret(root[producerId], `Submission relay attestor ${producerId}`);
  }
  return result;
}

function parseSubmissionRelayBindingsAllowEmpty(value) {
  const root = requiredRecord(value, 'Submission relay bindings');
  return Object.keys(root).length === 0 ? {} : parseSubmissionRelayBindings(root);
}

function parseRelayTargetTransition(value, phase) {
  const root = requiredRecord(value, `Relay target transition ${phase}`);
  const operation = root.operation;
  if (!['ADD', 'REMOVE', 'RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(operation)) {
    throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_INVALID', 'operation must be ADD, REMOVE, RECONCILE_REMOVE, or WINDOW_REPLACE.', 400);
  }
  const expectedReason = {
    ADD: 'AUTOMATION_OWNED_TARGET_CREATE',
    REMOVE: 'AUTOMATION_OWNED_TARGET_CLOSE',
    RECONCILE_REMOVE: 'AUTOMATION_OWNED_TARGET_DISAPPEARED',
    WINDOW_REPLACE: 'AUTOMATION_OWNED_WINDOW_REPLACE',
  }[operation];
  if (root.reason !== expectedReason) throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_INVALID', `reason must be ${expectedReason}.`, 400);
  const common = {
    phase,
    pacingDomain: boundedString(root.pacingDomain, 'pacingDomain', 300),
    producerId: boundedString(root.producerId, 'producerId', 180),
    transitionId: boundedString(root.transitionId, 'transitionId', 300),
    operation,
    reason: expectedReason,
    hostAlias: boundedString(root.hostAlias, 'hostAlias', 100),
    hostRole: hostRole(root.hostRole),
    deploymentEpoch: positiveInteger(root.deploymentEpoch, 'deploymentEpoch'),
    leaseId: boundedString(root.leaseId, 'leaseId', 300),
    automationWindowId: positiveInteger(root.automationWindowId, 'automationWindowId'),
    priorBindingRevision: positiveInteger(root.priorBindingRevision, 'priorBindingRevision'),
    priorOwnedTargetIds: stringArray(root.priorOwnedTargetIds, 'priorOwnedTargetIds', 300).sort(),
    anchorTargetId: operation === 'ADD' ? boundedString(root.anchorTargetId, 'anchorTargetId', 300) : null,
    targetId: ['REMOVE', 'RECONCILE_REMOVE'].includes(operation) ? boundedString(root.targetId, 'targetId', 300) : null,
  };
  const phaseFields = phase === 'COMMIT' ? {
    postAutomationWindowId: positiveInteger(root.postAutomationWindowId, 'postAutomationWindowId'),
    postOwnedTargetIds: stringArray(root.postOwnedTargetIds, 'postOwnedTargetIds', 300).sort(),
    transitionedTargetId: boundedString(root.transitionedTargetId, 'transitionedTargetId', 300),
  } : phase === 'ABORT' ? {
    observedAutomationWindowId: positiveInteger(root.observedAutomationWindowId, 'observedAutomationWindowId'),
    observedOwnedTargetIds: stringArray(root.observedOwnedTargetIds, 'observedOwnedTargetIds', 300).sort(),
  } : {};
  return { ...common, ...phaseFields, proof: sha(root.proof, 'proof') };
}

function normalizeRelayTargetTransition(value, relayBindings) {
  const root = requiredRecord(value, 'relayTargetTransition');
  const producerId = boundedString(root.producerId, 'relayTargetTransition.producerId', 180);
  const binding = relayBindings[producerId];
  if (!binding) throw new Error('relayTargetTransition producer lacks a durable relay binding.');
  const operation = root.operation;
  if (!['ADD', 'REMOVE', 'RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(operation)) throw new Error('relayTargetTransition.operation is invalid.');
  const transition = {
    transitionId: boundedString(root.transitionId, 'relayTargetTransition.transitionId', 300),
    producerId,
    operation,
    hostAlias: boundedString(root.hostAlias, 'relayTargetTransition.hostAlias', 100),
    hostRole: hostRole(root.hostRole),
    deploymentEpoch: positiveInteger(root.deploymentEpoch, 'relayTargetTransition.deploymentEpoch'),
    leaseId: boundedString(root.leaseId, 'relayTargetTransition.leaseId', 300),
    automationWindowId: positiveInteger(root.automationWindowId, 'relayTargetTransition.automationWindowId'),
    priorBindingRevision: positiveInteger(root.priorBindingRevision, 'relayTargetTransition.priorBindingRevision'),
    priorOwnedTargetIds: stringArray(root.priorOwnedTargetIds, 'relayTargetTransition.priorOwnedTargetIds', 300).sort(),
    anchorTargetId: root.anchorTargetId == null ? null : boundedString(root.anchorTargetId, 'relayTargetTransition.anchorTargetId', 300),
    targetId: root.targetId == null ? null : boundedString(root.targetId, 'relayTargetTransition.targetId', 300),
    reason: boundedString(root.reason, 'relayTargetTransition.reason', 100),
    beginFingerprint: sha(root.beginFingerprint, 'relayTargetTransition.beginFingerprint'),
    begunAt: isoTimestamp(root.begunAt, 'relayTargetTransition.begunAt'),
  };
  if (transition.hostAlias !== binding.hostAlias || transition.hostRole !== binding.hostRole
    || transition.automationWindowId !== binding.automationWindowId
    || transition.priorBindingRevision !== binding.bindingRevision
    || !exactTargetSetsEqual(transition.priorOwnedTargetIds, binding.ownedTargetIds)) {
    throw new Error('relayTargetTransition does not match its durable relay binding.');
  }
  if ((operation === 'ADD' && (!transition.anchorTargetId || transition.targetId !== null || transition.reason !== 'AUTOMATION_OWNED_TARGET_CREATE'))
    || (operation === 'REMOVE' && (!transition.targetId || transition.anchorTargetId !== null || transition.reason !== 'AUTOMATION_OWNED_TARGET_CLOSE'))
    || (operation === 'RECONCILE_REMOVE' && (!transition.targetId || transition.anchorTargetId !== null || transition.reason !== 'AUTOMATION_OWNED_TARGET_DISAPPEARED'))
    || (operation === 'WINDOW_REPLACE' && (transition.targetId !== null || transition.anchorTargetId !== null || transition.reason !== 'AUTOMATION_OWNED_WINDOW_REPLACE'))) {
    throw new Error('relayTargetTransition operation fields are inconsistent.');
  }
  return transition;
}

function relayTransitionProofPayload(input) {
  const { proof: _proof, ...payload } = input;
  return payload;
}

function relayTransitionFingerprint(input) {
  return sha256(canonicalJson(relayTransitionProofPayload(input)));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function defaultSchedulerState(now = new Date().toISOString()) {
  return { schemaVersion: 1, createdAt: now, updatedAt: now, activeLease: null, leaseHistory: [], lastBoundaryAt: null, nextSequence: 1, nextQueueSequence: 1, queueItems: [], admissions: [], targetBindings: {}, relayBindings: {}, relayTargetTransition: null, safetyHalt: null };
}

export function normalizeSchedulerState(value, now = new Date().toISOString()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== 1) {
    throw new Error('Submission scheduler state must be an EpochedSchedulerStateV1 object; refusing to reset pacing state.');
  }
  const activeLease = value.activeLease === null ? null : parseDeploymentLease(value.activeLease);
  if (value.lastBoundaryAt !== null && !Number.isFinite(Date.parse(value.lastBoundaryAt ?? ''))) {
    throw new Error('Submission scheduler lastBoundaryAt is invalid; refusing to reset pacing state.');
  }
  if (!Array.isArray(value.leaseHistory) || !Array.isArray(value.queueItems) || !Array.isArray(value.admissions)) {
    throw new Error('Submission scheduler durable histories must be arrays.');
  }
  if (!Number.isInteger(value.nextSequence) || value.nextSequence < 1
    || !Number.isInteger(value.nextQueueSequence) || value.nextQueueSequence < 1) {
    throw new Error('Submission scheduler sequence counters must be positive integers.');
  }
  if (!value.targetBindings || typeof value.targetBindings !== 'object' || Array.isArray(value.targetBindings)) {
    throw new Error('Submission scheduler targetBindings must be an object.');
  }
  if (value.safetyHalt !== null && (!value.safetyHalt || typeof value.safetyHalt !== 'object' || Array.isArray(value.safetyHalt))) {
    throw new Error('Submission scheduler safetyHalt must be an object or null.');
  }
  const relayBindings = value.relayBindings == null ? {} : parseSubmissionRelayBindingsAllowEmpty(value.relayBindings);
  const relayTargetTransition = value.relayTargetTransition == null
    ? null
    : normalizeRelayTargetTransition(value.relayTargetTransition, relayBindings);
  const leaseHistory = value.leaseHistory.map((item) => parseDeploymentLease(item));
  const queueItems = value.queueItems.map((item, index) => normalizeQueueItem(item, index));
  const admissions = value.admissions.map((item, index) => normalizeAdmissionRecord(item, index));
  unique(queueItems.map((item) => item.queueItemId), 'queue item IDs');
  unique(queueItems.map((item) => item.sequence), 'queue sequences');
  unique(admissions.map((item) => item.admissionId), 'admission IDs');
  unique(admissions.map((item) => item.sequence), 'admission sequences');
  if (admissions.filter((item) => item.status === 'ADMITTED').length > 1 || queueItems.filter((item) => item.status === 'ADMITTED').length > 1) {
    throw new Error('Submission scheduler state may contain only one open admission.');
  }
  for (const item of queueItems) {
    const linked = admissions.filter((admission) => admission.queueItemId === item.queueItemId);
    if (JSON.stringify(linked.map((entry) => entry.admissionId)) !== JSON.stringify(item.admissionIds)) {
      throw new Error(`Submission scheduler queue item ${item.queueItemId} has inconsistent admission references.`);
    }
    if (item.status === 'ADMITTED' && linked.filter((entry) => entry.status === 'ADMITTED').length !== 1) {
      throw new Error(`Submission scheduler queue item ${item.queueItemId} lacks its exact open admission.`);
    }
    validateQueueAdmissionCorrespondence(item, linked);
  }
  for (const admission of admissions) {
    const item = queueItems.find((entry) => entry.queueItemId === admission.queueItemId);
    if (!item || admission.queueKey !== item.queueKey || admission.retryRootKey !== item.retryRootKey
      || logicalRequestFingerprint(admission) !== item.logicalFingerprint) {
      throw new Error(`Submission scheduler admission ${admission.admissionId} is not bound to its exact queue item.`);
    }
    if (admission.status === 'ADMITTED' && item.status !== 'ADMITTED') {
      throw new Error(`Submission scheduler admission ${admission.admissionId} has inconsistent open queue state.`);
    }
  }
  const targetBindings = normalizeTargetBindings(value.targetBindings, admissions);
  const crossedBoundaryTimes = admissions
    .filter((item) => ['BOUNDARY_RECORDED', 'AMBIGUOUS_INTERVAL_VIOLATION', 'AMBIGUOUS_EXPIRED_AT_BOUNDARY', 'AMBIGUOUS_LEASE_VIOLATION'].includes(item.status))
    .map((item) => item.boundaryAt);
  if (crossedBoundaryTimes.length > 0) {
    const maximumCrossedBoundaryAt = crossedBoundaryTimes.reduce((latest, candidate) => (
      Date.parse(candidate) > Date.parse(latest) ? candidate : latest
    ));
    if (value.lastBoundaryAt === null || Date.parse(value.lastBoundaryAt) < Date.parse(maximumCrossedBoundaryAt)) {
      throw new Error('Submission scheduler lastBoundaryAt cannot precede a durable crossed admission; refusing to erase pacing state.');
    }
  }
  if (activeLease && (leaseHistory.length === 0 || !sameLease(activeLease, leaseHistory.at(-1)))) {
    throw new Error('Submission scheduler active lease must equal the latest durable lease-history record.');
  }
  const safetyHalt = value.safetyHalt === null ? null : {
    code: boundedString(value.safetyHalt.code, 'safetyHalt.code', 180),
    admissionId: boundedString(value.safetyHalt.admissionId, 'safetyHalt.admissionId', 300),
    queueItemId: boundedString(value.safetyHalt.queueItemId, 'safetyHalt.queueItemId', 300),
    boundaryAt: isoTimestamp(value.safetyHalt.boundaryAt, 'safetyHalt.boundaryAt'),
  };
  return {
    schemaVersion: 1,
    createdAt: value.createdAt == null ? now : isoTimestamp(value.createdAt, 'createdAt'),
    updatedAt: value.updatedAt == null ? now : isoTimestamp(value.updatedAt, 'updatedAt'),
    activeLease,
    leaseHistory,
    lastBoundaryAt: value.lastBoundaryAt,
    nextSequence: value.nextSequence,
    nextQueueSequence: value.nextQueueSequence,
    queueItems,
    admissions,
    targetBindings,
    relayBindings,
    relayTargetTransition,
    safetyHalt,
  };
}

function normalizeQueueItem(value, index) {
  const root = requiredRecord(value, `queueItems.${index}`);
  const request = parseAdmission(root.request);
  const status = boundedString(root.status, `queueItems.${index}.status`, 100);
  if (!QUEUE_STATUSES.has(status)) throw new Error(`queueItems.${index}.status is invalid.`);
  const item = {
    sequence: positiveInteger(root.sequence, `queueItems.${index}.sequence`),
    queueItemId: boundedString(root.queueItemId, `queueItems.${index}.queueItemId`, 300),
    queueKey: boundedString(root.queueKey, `queueItems.${index}.queueKey`, 500),
    retryRootKey: boundedString(root.retryRootKey, `queueItems.${index}.retryRootKey`, 500),
    requestFingerprint: sha(root.requestFingerprint, `queueItems.${index}.requestFingerprint`),
    logicalFingerprint: sha(root.logicalFingerprint, `queueItems.${index}.logicalFingerprint`),
    request,
    status,
    queuedAt: isoTimestamp(root.queuedAt, `queueItems.${index}.queuedAt`),
    admissionIds: stringArray(root.admissionIds, `queueItems.${index}.admissionIds`, 300),
    terminalAt: optionalTimestamp(root.terminalAt, `queueItems.${index}.terminalAt`),
    admittedAt: optionalTimestamp(root.admittedAt, `queueItems.${index}.admittedAt`),
    lastPreclickAbortAt: optionalTimestamp(root.lastPreclickAbortAt, `queueItems.${index}.lastPreclickAbortAt`),
    cancelledByLeaseId: root.cancelledByLeaseId == null ? null : boundedString(root.cancelledByLeaseId, `queueItems.${index}.cancelledByLeaseId`, 300),
    takeoverRebindings: normalizeTakeoverRebindings(root.takeoverRebindings, index),
  };
  if (item.queueKey !== request.queueKey || item.retryRootKey !== request.retryRootKey
    || item.requestFingerprint !== requestFingerprint(request) || item.logicalFingerprint !== logicalRequestFingerprint(request)) {
    throw new Error(`queueItems.${index} immutable request fingerprints are inconsistent.`);
  }
  if (OPEN_QUEUE_STATUSES.has(status) && item.terminalAt !== null) throw new Error(`queueItems.${index} cannot be both open and terminal.`);
  if (!OPEN_QUEUE_STATUSES.has(status) && item.terminalAt === null) throw new Error(`queueItems.${index} terminal status requires terminalAt.`);
  return item;
}

function normalizeAdmissionRecord(value, index) {
  const root = requiredRecord(value, `admissions.${index}`);
  const request = parseAdmission(root);
  const status = boundedString(root.status, `admissions.${index}.status`, 100);
  if (!ADMISSION_STATUSES.has(status)) throw new Error(`admissions.${index}.status is invalid.`);
  const admittedAt = isoTimestamp(root.admittedAt, `admissions.${index}.admittedAt`);
  const expiresAt = isoTimestamp(root.expiresAt, `admissions.${index}.expiresAt`);
  if (Date.parse(expiresAt) <= Date.parse(admittedAt)) throw new Error(`admissions.${index}.expiresAt must follow admittedAt.`);
  const admission = {
    sequence: positiveInteger(root.sequence, `admissions.${index}.sequence`),
    admissionId: boundedString(root.admissionId, `admissions.${index}.admissionId`, 300),
    queueItemId: boundedString(root.queueItemId, `admissions.${index}.queueItemId`, 300),
    producerId: boundedString(root.producerId, `admissions.${index}.producerId`, 180),
    ...request,
    admittedAt,
    expiresAt,
    status,
    previousGlobalBoundaryAt: optionalTimestamp(root.previousGlobalBoundaryAt, `admissions.${index}.previousGlobalBoundaryAt`),
    boundaryAt: optionalTimestamp(root.boundaryAt, `admissions.${index}.boundaryAt`),
    boundaryKind: root.boundaryKind == null ? null : boundaryKind(root.boundaryKind, `admissions.${index}.boundaryKind`),
    conversationUrlSha256: root.conversationUrlSha256 == null ? null : sha(root.conversationUrlSha256, `admissions.${index}.conversationUrlSha256`),
    boundaryRecordedAt: optionalTimestamp(root.boundaryRecordedAt, `admissions.${index}.boundaryRecordedAt`),
    abortedAt: optionalTimestamp(root.abortedAt, `admissions.${index}.abortedAt`),
    abortStage: root.abortStage == null ? null : boundedString(root.abortStage, `admissions.${index}.abortStage`, 100),
    providerRateLimitObservedAt: optionalTimestamp(root.providerRateLimitObservedAt, `admissions.${index}.providerRateLimitObservedAt`),
    deliveryStatus: root.deliveryStatus == null ? null : boundedString(root.deliveryStatus, `admissions.${index}.deliveryStatus`, 100),
    recoveryStatus: root.recoveryStatus == null ? null : boundedString(root.recoveryStatus, `admissions.${index}.recoveryStatus`, 100),
    outcomeRecordedAt: optionalTimestamp(root.outcomeRecordedAt, `admissions.${index}.outcomeRecordedAt`),
  };
  if (admission.deliveryStatus !== null && !['DELIVERED', 'GENERATION_STARTED', 'PROVIDER_RATE_LIMITED', 'FAILED_CLOSED'].includes(admission.deliveryStatus)) {
    throw new Error(`admissions.${index}.deliveryStatus is invalid.`);
  }
  if (admission.recoveryStatus !== null && !['NOT_REQUIRED', 'BOUNDED_RETRY_PENDING', 'RECOVERED', 'FAILED_CLOSED'].includes(admission.recoveryStatus)) {
    throw new Error(`admissions.${index}.recoveryStatus is invalid.`);
  }
  if ((admission.deliveryStatus === null) !== (admission.recoveryStatus === null)
    || (admission.deliveryStatus === null) !== (admission.outcomeRecordedAt === null)) {
    throw new Error(`admissions.${index} outcome fields must be recorded together.`);
  }
  const crossed = ['BOUNDARY_RECORDED', 'AMBIGUOUS_INTERVAL_VIOLATION', 'AMBIGUOUS_EXPIRED_AT_BOUNDARY', 'AMBIGUOUS_LEASE_VIOLATION'].includes(status);
  const aborted = ['ABORTED_BEFORE_BOUNDARY', 'EXPIRED_BEFORE_BOUNDARY'].includes(status);
  if (crossed && (!admission.boundaryAt || !admission.boundaryKind || !admission.boundaryRecordedAt
    || admission.abortedAt !== null || admission.abortStage !== null)) {
    throw new Error(`admissions.${index} crossed status requires exact boundary fields and no abort fields.`);
  }
  if (aborted && (!admission.abortedAt || !admission.abortStage || admission.boundaryAt !== null
    || admission.boundaryKind !== null || admission.boundaryRecordedAt !== null || admission.conversationUrlSha256 !== null)) {
    throw new Error(`admissions.${index} aborted status requires exact abort fields and no boundary fields.`);
  }
  if (status === 'ADMITTED' && (admission.boundaryAt !== null || admission.boundaryKind !== null
    || admission.boundaryRecordedAt !== null || admission.conversationUrlSha256 !== null
    || admission.abortedAt !== null || admission.abortStage !== null || admission.providerRateLimitObservedAt !== null)) {
    throw new Error(`admissions.${index} open status cannot contain terminal evidence.`);
  }
  if (admission.providerRateLimitObservedAt !== null && !['BOUNDARY_RECORDED', 'ABORTED_BEFORE_BOUNDARY'].includes(status)) {
    throw new Error(`admissions.${index} provider rate-limit evidence is inconsistent with ${status}.`);
  }
  return admission;
}

function validateQueueAdmissionCorrespondence(item, linked) {
  const latest = linked.at(-1) ?? null;
  const earlier = linked.slice(0, -1);
  if (earlier.some((entry) => !['ABORTED_BEFORE_BOUNDARY', 'EXPIRED_BEFORE_BOUNDARY'].includes(entry.status)
    && !(entry.status === 'BOUNDARY_RECORDED' && entry.providerRateLimitObservedAt))) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} has a non-retryable earlier admission.`);
  }
  const exactLatestStatus = {
    ADMITTED: 'ADMITTED',
    BOUNDARY_RECORDED: 'BOUNDARY_RECORDED',
    AMBIGUOUS_AFTER_RESTART: 'AMBIGUOUS_AFTER_RESTART',
    AMBIGUOUS_INTERVAL_VIOLATION: 'AMBIGUOUS_INTERVAL_VIOLATION',
    AMBIGUOUS_EXPIRED_AT_BOUNDARY: 'AMBIGUOUS_EXPIRED_AT_BOUNDARY',
    AMBIGUOUS_LEASE_VIOLATION: 'AMBIGUOUS_LEASE_VIOLATION',
  }[item.status];
  if (exactLatestStatus && latest?.status !== exactLatestStatus) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} status is inconsistent with its latest admission.`);
  }
  if (item.status === 'QUEUED' && linked.length !== 0) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} cannot be newly queued with prior admissions.`);
  }
  if (item.status === 'PRECLICK_RETRY_PENDING' && !['ABORTED_BEFORE_BOUNDARY', 'EXPIRED_BEFORE_BOUNDARY'].includes(latest?.status)) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} retry status lacks a safe pre-click abort.`);
  }
  if (item.status === 'RATE_LIMIT_RETRY_PENDING'
    && (!['BOUNDARY_RECORDED', 'ABORTED_BEFORE_BOUNDARY'].includes(latest?.status) || !latest.providerRateLimitObservedAt)) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} rate-limit retry status lacks its crossed provider-rate-limit admission.`);
  }
  if (item.status === 'RATE_LIMIT_RETRY_EXHAUSTED'
    && (!['BOUNDARY_RECORDED', 'ABORTED_BEFORE_BOUNDARY'].includes(latest?.status) || !latest.providerRateLimitObservedAt)) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} exhausted status lacks its rate-limit abort.`);
  }
  if (item.status === 'CANCELLED_AT_TAKEOVER'
    && linked.some((entry) => !['ABORTED_BEFORE_BOUNDARY', 'EXPIRED_BEFORE_BOUNDARY'].includes(entry.status))) {
    throw new Error(`Submission scheduler queue item ${item.queueItemId} cannot cancel crossed or ambiguous admission history.`);
  }
}

function normalizeTargetBindings(value, admissions) {
  const result = {};
  for (const [targetKey, raw] of Object.entries(value)) {
    const root = requiredRecord(raw, `targetBindings.${targetKey}`);
    const binding = {
      supervisorId: boundedString(root.supervisorId, `targetBindings.${targetKey}.supervisorId`, 300),
      registrationId: boundedString(root.registrationId, `targetBindings.${targetKey}.registrationId`, 300),
      conversationUrlSha256: sha(root.conversationUrlSha256, `targetBindings.${targetKey}.conversationUrlSha256`),
      boundByAdmissionId: boundedString(root.boundByAdmissionId, `targetBindings.${targetKey}.boundByAdmissionId`, 300),
      boundAt: isoTimestamp(root.boundAt, `targetBindings.${targetKey}.boundAt`),
    };
    const admission = admissions.find((item) => item.admissionId === binding.boundByAdmissionId);
    if (!admission || admission.status !== 'BOUNDARY_RECORDED' || admission.targetKind !== 'FRESH_PROVIDER_SESSION'
      || admission.targetKey !== targetKey || admission.supervisorId !== binding.supervisorId
      || admission.registrationId !== binding.registrationId || admission.conversationUrlSha256 !== binding.conversationUrlSha256) {
      throw new Error(`targetBindings.${targetKey} lacks its exact crossed fresh-session admission.`);
    }
    result[targetKey] = binding;
  }
  return result;
}

function parseAdmission(value) {
  const root = requiredRecord(value, 'Submission admission');
  const targetKind = root.targetKind;
  if (!['REGISTERED_BOOTSTRAP', 'FRESH_PROVIDER_SESSION', 'BOUND_PROVIDER_SESSION'].includes(targetKind)) throw new SubmissionSchedulerError('SUBMISSION_ADMISSION_INVALID', 'targetKind is invalid.', 400);
  const queueKey = boundedString(root.queueKey, 'queueKey', 500);
  return {
    requestId: boundedString(root.requestId, 'requestId', 300),
    authorizationRef: boundedString(root.authorizationRef, 'authorizationRef', 500),
    queueKey,
    retryRootKey: boundedString(root.retryRootKey ?? queueKey, 'retryRootKey', 500),
    sendPath: boundedString(root.sendPath, 'sendPath', 100),
    hostAlias: boundedString(root.hostAlias, 'hostAlias', 100),
    hostRole: hostRole(root.hostRole),
    deploymentEpoch: positiveInteger(root.deploymentEpoch, 'deploymentEpoch'),
    leaseId: boundedString(root.leaseId, 'leaseId', 300),
    supervisorId: boundedString(root.supervisorId, 'supervisorId', 300),
    registrationId: boundedString(root.registrationId, 'registrationId', 300),
    targetId: boundedString(root.targetId, 'targetId', 300),
    automationWindowId: positiveInteger(root.automationWindowId, 'automationWindowId'),
    targetKind,
    targetKey: boundedString(root.targetKey, 'targetKey', 500),
    expectedUrlSha256: sha(root.expectedUrlSha256, 'expectedUrlSha256'),
    bodySha256: sha(root.bodySha256, 'bodySha256'),
  };
}

function parseBoundary(value) {
  const root = requiredRecord(value, 'Submission boundary');
  if (!['CLICKED', 'GENERATION_STARTED'].includes(root.boundaryKind)) throw new SubmissionSchedulerError('SUBMISSION_BOUNDARY_INVALID', 'boundaryKind must be CLICKED or GENERATION_STARTED.', 400);
  return {
    admissionId: boundedString(root.admissionId, 'admissionId', 300),
    boundaryAt: isoTimestamp(root.boundaryAt, 'boundaryAt'),
    boundaryKind: root.boundaryKind,
    conversationUrlSha256: root.conversationUrlSha256 == null ? null : sha(root.conversationUrlSha256, 'conversationUrlSha256'),
  };
}

function assertActiveLease(lease, request, nowMs) {
  if (!lease) throw new SubmissionSchedulerError('DEPLOYMENT_LEASE_MISSING', 'No active deployment lease is configured.', 503);
  if (lease.splitBrainStatus !== 'SINGLE_ACTIVE_CONFIRMED') throw new SubmissionSchedulerError('SPLIT_BRAIN_UNCERTAIN', 'Single-active deployment status is uncertain.');
  if (Date.parse(lease.issuedAt) > nowMs || Date.parse(lease.expiresAt) <= nowMs) throw new SubmissionSchedulerError('DEPLOYMENT_LEASE_STALE', 'The active deployment lease is not currently valid.');
  if (request.hostAlias !== lease.activeHostAlias || request.hostRole !== lease.activeHostRole
    || request.deploymentEpoch !== lease.epoch || request.leaseId !== lease.leaseId) {
    const code = request.hostRole === 'SECONDARY' && lease.activeHostRole !== 'SECONDARY' ? 'STANDBY_SEND_FORBIDDEN' : 'DEPLOYMENT_LEASE_MISMATCH';
    throw new SubmissionSchedulerError(code, 'Host alias, role, epoch, and lease must exactly match the one active deployment.');
  }
}

function assertProducerBinding(bindings, producerId, request) {
  const binding = bindings instanceof Map ? bindings.get(producerId) : bindings?.[producerId];
  if (!binding) {
    throw new SubmissionSchedulerError('SUBMISSION_RELAY_BINDING_MISSING', 'The authenticated producer has no Mission Control relay-host binding.', 403);
  }
  if (request.hostAlias !== binding.hostAlias || request.hostRole !== binding.hostRole) {
    throw new SubmissionSchedulerError('SUBMISSION_RELAY_HOST_IMPERSONATION', 'The authenticated producer cannot claim another relay host or role.', 403);
  }
  if (request.automationWindowId !== binding.automationWindowId || !binding.ownedTargetIds.includes(request.targetId)) {
    throw new SubmissionSchedulerError('SUBMISSION_TARGET_OWNERSHIP_UNATTESTED', 'The target is not in the authenticated relay host automation-owned window registry.', 403);
  }
}

function requireDurableRelayBinding(state, producerId) {
  const binding = state.relayBindings?.[producerId];
  if (!binding) throw new SubmissionSchedulerError('SUBMISSION_RELAY_BINDING_MISSING', 'The authenticated producer has no durable Mission Control relay-host binding.', 403);
  return binding;
}

function publicRelayBinding(binding) {
  const ownedTargetIds = [...binding.ownedTargetIds].sort();
  return {
    hostAlias: binding.hostAlias,
    hostRole: binding.hostRole,
    automationWindowId: binding.automationWindowId,
    bindingRevision: binding.bindingRevision,
    ownedTargetCount: ownedTargetIds.length,
    ownedTargetIdsSha256: sha256(JSON.stringify(ownedTargetIds)),
  };
}

function initializeOrValidateRelayBindings(state, configuredBindings) {
  const configured = Object.fromEntries([...configuredBindings.entries()].map(([producerId, binding]) => [producerId, structuredClone(binding)]));
  if (Object.keys(state.relayBindings ?? {}).length === 0) {
    state.relayBindings = configured;
    return true;
  }
  const configuredIds = Object.keys(configured).sort();
  const durableIds = Object.keys(state.relayBindings).sort();
  if (JSON.stringify(configuredIds) !== JSON.stringify(durableIds)) {
    throw new SubmissionSchedulerError('SUBMISSION_RELAY_BINDING_CONFIGURATION_DRIFT', 'Configured and durable relay producer identities differ.');
  }
  for (const producerId of configuredIds) {
    const expected = configured[producerId];
    const durable = state.relayBindings[producerId];
    if (expected.hostAlias !== durable.hostAlias || expected.hostRole !== durable.hostRole) {
      throw new SubmissionSchedulerError('SUBMISSION_RELAY_BINDING_CONFIGURATION_DRIFT', 'Configured relay host identity differs from durable authority state.');
    }
  }
  return false;
}

function assertRelayTransitionAuthority(lease, binding, input, nowMs) {
  if (input.hostAlias !== binding.hostAlias || input.hostRole !== binding.hostRole
    || input.automationWindowId !== binding.automationWindowId) {
    throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_HOST_MISMATCH', 'The transition host, role, or automation window differs from the durable relay binding.', 403);
  }
  if (lease?.activeHostAlias === binding.hostAlias && lease?.activeHostRole === binding.hostRole) {
    assertActiveLease(lease, input, nowMs);
    return;
  }
  assertPassiveRecoveryLeaseSnapshot(lease, input, nowMs);
}

function assertRelayTransitionDuplicateAuthority(lease, binding, input, nowMs) {
  if (input.hostAlias !== binding.hostAlias || input.hostRole !== binding.hostRole) {
    throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_HOST_MISMATCH', 'The transition host or role differs from the durable relay binding.', 403);
  }
  if (lease?.activeHostAlias === binding.hostAlias && lease?.activeHostRole === binding.hostRole) {
    assertActiveLease(lease, input, nowMs);
    return;
  }
  assertPassiveRecoveryLeaseSnapshot(lease, input, nowMs);
}

function assertPassiveRecoveryLeaseSnapshot(lease, input, nowMs) {
  if (!['RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(input.operation)) {
    throw new SubmissionSchedulerError('STANDBY_TARGET_MUTATION_FORBIDDEN', 'An inactive relay may perform only fail-closed disappearance or full-window recovery.', 403);
  }
  if (!lease || lease.splitBrainStatus !== 'SINGLE_ACTIVE_CONFIRMED'
    || lease.epoch !== input.deploymentEpoch || lease.leaseId !== input.leaseId
    || Date.parse(lease.issuedAt) > nowMs || Date.parse(lease.expiresAt) <= nowMs) {
    throw new SubmissionSchedulerError('DEPLOYMENT_LEASE_MISMATCH', 'Passive recovery requires the exact current active-lease snapshot.', 403);
  }
}

function assertRelayTransitionIdentity(transition, input, producerId) {
  if (transition.producerId !== producerId || transition.transitionId !== input.transitionId
    || transition.operation !== input.operation || transition.reason !== input.reason
    || transition.hostAlias !== input.hostAlias || transition.hostRole !== input.hostRole
    || transition.deploymentEpoch !== input.deploymentEpoch || transition.leaseId !== input.leaseId
    || transition.automationWindowId !== input.automationWindowId
    || transition.priorBindingRevision !== input.priorBindingRevision
    || transition.anchorTargetId !== input.anchorTargetId || transition.targetId !== input.targetId) {
    throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_IDENTITY_MISMATCH', 'The transition does not match the exact durable begin record.', 403);
  }
}

function assertRelayTargetDelta(transition, postOwnedTargetIds, transitionedTargetId) {
  const prior = transition.priorOwnedTargetIds;
  if (transition.operation === 'WINDOW_REPLACE') {
    if (postOwnedTargetIds.length !== 1 || postOwnedTargetIds[0] !== transitionedTargetId
      || prior.includes(transitionedTargetId)) {
      throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_DELTA_INVALID', 'WINDOW_REPLACE must bind exactly one fresh target in the fresh automation window.');
    }
    return;
  }
  if (transition.operation === 'ADD') {
    const added = postOwnedTargetIds.filter((targetId) => !prior.includes(targetId));
    const removed = prior.filter((targetId) => !postOwnedTargetIds.includes(targetId));
    if (added.length !== 1 || removed.length !== 0 || postOwnedTargetIds.length > 3
      || added[0] !== transitionedTargetId) {
      throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_DELTA_INVALID', 'ADD must retain the prior set and add exactly one target within the hard ceiling.');
    }
    return;
  }
  const removed = prior.filter((targetId) => !postOwnedTargetIds.includes(targetId));
  const added = postOwnedTargetIds.filter((targetId) => !prior.includes(targetId));
  if (removed.length !== 1 || added.length !== 0 || removed[0] !== transition.targetId
    || removed[0] !== transitionedTargetId || postOwnedTargetIds.length < 1) {
    throw new SubmissionSchedulerError('RELAY_TARGET_TRANSITION_DELTA_INVALID', `${transition.operation} must delete exactly the named target and retain at least one owned target.`);
  }
}

function assertExactTargetSet(actual, expected, code) {
  if (!exactTargetSetsEqual(actual, expected)) throw new SubmissionSchedulerError(code, 'The exact canonical target set does not match durable authority state.');
}

function exactTargetSetsEqual(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function assertRegistryTarget(chats, state, request) {
  const chat = chats.get(request.supervisorId);
  if (!chat) throw new SubmissionSchedulerError('SUPERVISOR_NOT_REGISTERED', 'The supervisor is absent from the current registry.');
  if (chat.ownership !== 'MISSION_CONTROL_ONLY' || chat.registrationId !== request.registrationId) throw new SubmissionSchedulerError('SUPERVISOR_OWNERSHIP_MISMATCH', 'Mission Control-only ownership and registration must match exactly.');
  if (chat.registrationState === 'PROVISIONING') {
    if (!chat.purpose || chat.provisioningProvenance?.authorizedBy !== 'OWNER') {
      throw new SubmissionSchedulerError('SUPERVISOR_PROVENANCE_INVALID', 'Owner provisioning authority and an explicit Mission Control purpose are required.');
    }
    if (request.sendPath !== 'MC_ONLY_PROVISIONING' || request.targetKind !== 'FRESH_PROVIDER_SESSION'
      || request.targetKey !== chat.provisioningKey || request.expectedUrlSha256 !== sha256('https://chatgpt.com/')) {
      throw new SubmissionSchedulerError('SUPERVISOR_PROVISIONING_SCOPE_MISMATCH', 'A provisioning registration permits only its exact one-time Mission Control-only provider-root send.', 403);
    }
    if (state.targetBindings[chat.provisioningKey]) {
      throw new SubmissionSchedulerError('SUPERVISOR_PROVISIONING_ALREADY_CONSUMED', 'The one-time provisioning key already binds a provider conversation.');
    }
    return chat;
  }
  if (!chat.purpose || chat.registrationProvenance?.registeredBy !== 'OWNER') throw new SubmissionSchedulerError('SUPERVISOR_PROVENANCE_INVALID', 'Owner provenance and an explicit Mission Control purpose are required.');
  if (request.targetKind === 'REGISTERED_BOOTSTRAP') {
    if (request.targetKey !== chat.bootstrapCapability.chatId || request.expectedUrlSha256 !== sha256(chat.bootstrapCapability.url)) throw new SubmissionSchedulerError('SUPERVISOR_TARGET_MISMATCH', 'Bootstrap target does not match the registered conversation.');
  } else if (request.targetKind === 'FRESH_PROVIDER_SESSION') {
    if (!request.targetKey.startsWith('provider-session:') || request.expectedUrlSha256 !== sha256('https://chatgpt.com/')) throw new SubmissionSchedulerError('SUPERVISOR_TARGET_MISMATCH', 'Fresh provider sessions must start at the exact provider root.');
  } else {
    const binding = state.targetBindings[request.targetKey];
    if (!binding || binding.supervisorId !== request.supervisorId || binding.registrationId !== request.registrationId || binding.conversationUrlSha256 !== request.expectedUrlSha256) throw new SubmissionSchedulerError('SUPERVISOR_TARGET_MISMATCH', 'Bound provider target does not match its durable session binding.');
  }
  return chat;
}

function validateLeaseTransition(previous, candidate, state, minIntervalMs, nowMs) {
  if (candidate.epoch !== previous.epoch + 1 || candidate.takeover?.previousLeaseId !== previous.leaseId
    || candidate.takeover?.previousEpoch !== previous.epoch || candidate.takeover?.previousHostAlias !== previous.activeHostAlias) {
    throw new SubmissionSchedulerError('LEASE_EPOCH_INVALID', 'Takeover must advance exactly one epoch and bind the previous lease and host.');
  }
  if (candidate.takeover.priorHostQuiescence !== 'PROVEN' || Date.parse(candidate.takeover.provenAt) > nowMs) throw new SubmissionSchedulerError('PRIMARY_QUIESCENCE_UNPROVEN', 'Takeover requires proven prior-host quiescence.');
  if (state.admissions.some((item) => item.status === 'ADMITTED' || item.status === 'AMBIGUOUS_AFTER_RESTART')) throw new SubmissionSchedulerError('TAKEOVER_SEND_AMBIGUITY', 'Takeover is blocked by an unresolved send admission.');
  if (state.relayTargetTransition) throw new SubmissionSchedulerError('TAKEOVER_TARGET_TRANSITION_OPEN', 'Takeover requires the prior relay target transition to be resolved under its current lease.');
  if (candidate.takeover.previousLeaseExpiresAt !== previous.expiresAt
    || nowMs < Date.parse(previous.expiresAt)
    || Date.parse(candidate.issuedAt) < Date.parse(previous.expiresAt)) {
    throw new SubmissionSchedulerError('PRIOR_LEASE_NOT_EXPIRED', 'Takeover requires the exact prior lease expiry to have elapsed before successor activation.');
  }
  const fullSafetyAt = Math.max(Date.parse(state.lastBoundaryAt ?? previous.issuedAt), Date.parse(candidate.takeover.provenAt)) + minIntervalMs;
  if (nowMs < fullSafetyAt) throw new SubmissionSchedulerError('FAILOVER_SAFETY_INTERVAL_INCOMPLETE', 'Takeover requires a full global interval after both the last boundary and proven prior-host quiescence.');
  if (candidate.takeover.pacingState === 'TRANSFERRED') {
    if ((candidate.takeover.transferredLastBoundaryAt ?? null) !== state.lastBoundaryAt) throw new SubmissionSchedulerError('PACING_TRANSFER_MISMATCH', 'Transferred pacing state must exactly match the durable last boundary.');
  } else {
    const safeAt = Date.parse(candidate.takeover.safetyIntervalCompletedAt ?? '');
    const lastMs = Date.parse(state.lastBoundaryAt ?? previous.issuedAt);
    if (!Number.isFinite(safeAt) || safeAt < Math.max(lastMs, Date.parse(candidate.takeover.provenAt)) + minIntervalMs || safeAt > nowMs) throw new SubmissionSchedulerError('FAILOVER_SAFETY_INTERVAL_INCOMPLETE', 'A full global interval must elapse after the last possible boundary and quiescence proof.');
  }
}

function parseTakeover(value) {
  const root = requiredRecord(value, 'takeover');
  const pacingState = root.pacingState;
  if (!['TRANSFERRED', 'FULL_INTERVAL_ELAPSED'].includes(pacingState)) throw new Error('takeover.pacingState must be TRANSFERRED or FULL_INTERVAL_ELAPSED.');
  if (root.priorHostQuiescence !== 'PROVEN') throw new Error('takeover.priorHostQuiescence must be PROVEN.');
  return {
    previousLeaseId: boundedString(root.previousLeaseId, 'takeover.previousLeaseId', 300),
    previousEpoch: positiveInteger(root.previousEpoch, 'takeover.previousEpoch'),
    previousHostAlias: boundedString(root.previousHostAlias, 'takeover.previousHostAlias', 100),
    previousLeaseExpiresAt: isoTimestamp(root.previousLeaseExpiresAt, 'takeover.previousLeaseExpiresAt'),
    priorHostQuiescence: 'PROVEN',
    provenAt: isoTimestamp(root.provenAt, 'takeover.provenAt'),
    pacingState,
    transferredLastBoundaryAt: root.transferredLastBoundaryAt == null ? null : isoTimestamp(root.transferredLastBoundaryAt, 'takeover.transferredLastBoundaryAt'),
    safetyIntervalCompletedAt: root.safetyIntervalCompletedAt == null ? null : isoTimestamp(root.safetyIntervalCompletedAt, 'takeover.safetyIntervalCompletedAt'),
  };
}

function schedulerStatus(state, minIntervalMs, nowMs) {
  const lastMs = Date.parse(state.lastBoundaryAt ?? '');
  const retryAfterMs = Number.isFinite(lastMs) ? Math.max(0, lastMs + minIntervalMs - nowMs) : 0;
  const open = state.admissions.find((item) => item.status === 'ADMITTED' || item.status === 'AMBIGUOUS_AFTER_RESTART') ?? null;
  const queue = state.queueItems.filter((item) => OPEN_QUEUE_STATUSES.has(item.status));
  const rateLimitItem = queue.find((item) => item.status === 'RATE_LIMIT_RETRY_PENDING') ?? null;
  const latestRateLimitAt = rateLimitItem
    ? [...state.admissions].reverse().find((item) => item.retryRootKey === rateLimitItem.retryRootKey && item.providerRateLimitObservedAt)?.providerRateLimitObservedAt ?? null
    : null;
  const providerRetryAfterMs = latestRateLimitAt ? Math.max(0, Date.parse(latestRateLimitAt) + 30_000 - nowMs) : 0;
  const effectiveRetryAfterMs = Math.max(retryAfterMs, providerRetryAfterMs);
  const leaseReady = state.activeLease?.splitBrainStatus === 'SINGLE_ACTIVE_CONFIRMED'
    && Date.parse(state.activeLease.issuedAt) <= nowMs && Date.parse(state.activeLease.expiresAt) > nowMs;
  return {
    schedulerState: state.activeLease ? (leaseReady ? 'ACTIVE_LEASE' : 'LEASE_STALE') : 'LEASE_MISSING',
    minimumIntervalMs: minIntervalMs,
    lastSubmissionAt: state.lastBoundaryAt,
    retryAfterMs: effectiveRetryAfterMs,
    nextSubmissionAt: effectiveRetryAfterMs > 0 ? new Date(nowMs + effectiveRetryAfterMs).toISOString() : null,
    ready: Boolean(leaseReady && effectiveRetryAfterMs === 0 && !open && !rateLimitItem && !state.safetyHalt && !state.relayTargetTransition),
    activeLease: state.activeLease ? { leaseId: state.activeLease.leaseId, epoch: state.activeLease.epoch, activeHostAlias: state.activeLease.activeHostAlias, activeHostRole: state.activeLease.activeHostRole, expiresAt: state.activeLease.expiresAt, splitBrainStatus: state.activeLease.splitBrainStatus } : null,
    unresolvedAdmission: open ? { admissionId: open.admissionId, admittedAt: open.admittedAt, expiresAt: open.expiresAt, status: open.status } : null,
    queueDepth: queue.length,
    queueHead: queue[0] ? { queueItemId: queue[0].queueItemId, queueKey: queue[0].queueKey, status: queue[0].status, queuedAt: queue[0].queuedAt } : null,
    providerAccountRateLimit: rateLimitItem ? {
      state: 'ONE_BOUNDED_RETRY',
      queueItemId: rateLimitItem.queueItemId,
      providerRateLimitCount: rateLimitCount(state, rateLimitItem.retryRootKey),
      observedAt: latestRateLimitAt,
      retryAfterMs: providerRetryAfterMs,
    } : { state: 'CLEAR', queueItemId: null, providerRateLimitCount: 0 },
    relayTargetTransition: state.relayTargetTransition ? {
      state: 'OPEN',
      operation: state.relayTargetTransition.operation,
      bindingRevision: state.relayTargetTransition.priorBindingRevision,
      begunAt: state.relayTargetTransition.begunAt,
    } : { state: 'CLEAR' },
    safetyHalt: state.safetyHalt,
  };
}

function sameLease(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameLeaseIdentity(left, right) {
  return left.leaseId === right.leaseId && left.epoch === right.epoch
    && left.activeHostAlias === right.activeHostAlias && left.activeHostRole === right.activeHostRole;
}

function sameRenewalFields(left, right) {
  return left.schemaVersion === right.schemaVersion && left.issuedAt === right.issuedAt
    && left.splitBrainStatus === right.splitBrainStatus && JSON.stringify(left.takeover) === JSON.stringify(right.takeover);
}

function requestFingerprint(request) {
  return sha256(JSON.stringify({
    requestId: request.requestId,
    authorizationRef: request.authorizationRef,
    queueKey: request.queueKey,
    retryRootKey: request.retryRootKey,
    sendPath: request.sendPath,
    hostAlias: request.hostAlias,
    hostRole: request.hostRole,
    deploymentEpoch: request.deploymentEpoch,
    leaseId: request.leaseId,
    supervisorId: request.supervisorId,
    registrationId: request.registrationId,
    targetId: request.targetId,
    automationWindowId: request.automationWindowId,
    targetKind: request.targetKind,
    targetKey: request.targetKey,
    expectedUrlSha256: request.expectedUrlSha256,
    bodySha256: request.bodySha256,
  }));
}

function logicalRequestFingerprint(request) {
  return sha256(JSON.stringify({
    requestId: request.requestId,
    authorizationRef: request.authorizationRef,
    retryRootKey: request.retryRootKey,
    sendPath: request.sendPath,
    supervisorId: request.supervisorId,
    registrationId: request.registrationId,
    targetKind: request.targetKind,
    targetKey: request.targetKey,
    expectedUrlSha256: request.expectedUrlSha256,
    bodySha256: request.bodySha256,
  }));
}

function normalizeTakeoverRebindings(value, queueIndex) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error(`queueItems.${queueIndex}.takeoverRebindings must be an array.`);
  return value.map((raw, index) => {
    const root = requiredRecord(raw, `queueItems.${queueIndex}.takeoverRebindings.${index}`);
    return {
      reboundAt: isoTimestamp(root.reboundAt, `queueItems.${queueIndex}.takeoverRebindings.${index}.reboundAt`),
      fromHostAlias: boundedString(root.fromHostAlias, `queueItems.${queueIndex}.takeoverRebindings.${index}.fromHostAlias`, 100),
      fromDeploymentEpoch: positiveInteger(root.fromDeploymentEpoch, `queueItems.${queueIndex}.takeoverRebindings.${index}.fromDeploymentEpoch`),
      fromLeaseId: boundedString(root.fromLeaseId, `queueItems.${queueIndex}.takeoverRebindings.${index}.fromLeaseId`, 300),
      fromRequestFingerprint: sha(root.fromRequestFingerprint, `queueItems.${queueIndex}.takeoverRebindings.${index}.fromRequestFingerprint`),
      toHostAlias: boundedString(root.toHostAlias, `queueItems.${queueIndex}.takeoverRebindings.${index}.toHostAlias`, 100),
      toDeploymentEpoch: positiveInteger(root.toDeploymentEpoch, `queueItems.${queueIndex}.takeoverRebindings.${index}.toDeploymentEpoch`),
      toLeaseId: boundedString(root.toLeaseId, `queueItems.${queueIndex}.takeoverRebindings.${index}.toLeaseId`, 300),
      toRequestFingerprint: sha(root.toRequestFingerprint, `queueItems.${queueIndex}.takeoverRebindings.${index}.toRequestFingerprint`),
    };
  });
}

function rateLimitCount(state, retryRootKey) {
  return state.admissions.filter((item) => item.retryRootKey === retryRootKey && item.providerRateLimitObservedAt).length;
}

function requiredRecord(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function boundedString(value, field, max) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > max) throw new Error(`${field} must be a non-empty string no longer than ${max} characters.`);
  return value;
}

function boundedSecret(value, field) {
  if (typeof value !== 'string' || value.length < 32 || value.length > 4096) throw new Error(`${field} must contain 32-4096 characters.`);
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer.`);
  return value;
}

function stringArray(value, field, max) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  const result = value.map((item, index) => boundedString(item, `${field}.${index}`, max));
  unique(result, field);
  return result;
}

function unique(values, field) {
  if (new Set(values).size !== values.length) throw new Error(`${field} must be unique.`);
}

function isoTimestamp(value, field) {
  const text = boundedString(value, field, 100);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp.`);
  return text;
}

function optionalTimestamp(value, field) {
  return value == null ? null : isoTimestamp(value, field);
}

function boundaryKind(value, field) {
  if (!['CLICKED', 'GENERATION_STARTED'].includes(value)) throw new Error(`${field} must be CLICKED or GENERATION_STARTED.`);
  return value;
}

function hostRole(value) {
  if (!['PRIMARY', 'SECONDARY'].includes(value)) throw new Error('hostRole must be PRIMARY or SECONDARY.');
  return value;
}

function sha(value, field) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${field} must be a lowercase SHA-256 digest.`);
  return value;
}
