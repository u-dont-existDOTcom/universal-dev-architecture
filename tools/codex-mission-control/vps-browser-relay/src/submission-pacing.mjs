import { createHash, randomUUID } from 'node:crypto';

export const GLOBAL_SUBMISSION_COOLDOWN = 'GLOBAL_SUBMISSION_COOLDOWN';
export const CHATGPT_RATE_LIMIT_RETRY = 'CHATGPT_RATE_LIMIT_RETRY';
export const CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED = 'CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED';

export class CentralSubmissionScheduler {
  constructor({ schedulerClient, stateStore, host, minIntervalMs = 20_000, now = Date.now, sleepImpl = sleep }) {
    if (!schedulerClient || !['status', 'admit', 'validateAdmission', 'recordBoundary', 'bindTarget', 'recordRateLimit', 'abortBeforeBoundary', 'recordOutcome'].every((method) => typeof schedulerClient[method] === 'function')) {
      throw new Error('Central submission scheduling requires the dedicated scheduler client.');
    }
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.write !== 'function') throw new Error('Central submission scheduling requires a relay state store.');
    if (!host || typeof host.alias !== 'string' || !['PRIMARY', 'SECONDARY'].includes(host.role)
      || !Number.isInteger(host.deploymentEpoch) || host.deploymentEpoch < 1 || typeof host.leaseId !== 'string') {
      throw new Error('Central submission scheduling requires exact host alias, role, deployment epoch, and lease ID.');
    }
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 20_000 || minIntervalMs > 600_000) throw new Error('minIntervalMs must be an integer from 20000 to 600000.');
    this.schedulerClient = schedulerClient;
    this.stateStore = stateStore;
    this.host = host;
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleepImpl = sleepImpl;
    this.tail = Promise.resolve();
    this.lastCentralStatus = null;
  }

  status(state, nowMs = this.now()) {
    const local = localPacingStatus(state, this.minIntervalMs, nowMs);
    return {
      ...local,
      authority: 'CENTRAL_SCHEDULER',
      centralStatusObserved: this.lastCentralStatus,
      ready: this.lastCentralStatus?.ready === true && local.ready,
    };
  }

  async remoteStatus() {
    const status = await this.schedulerClient.status();
    this.#assertCentralContract(status);
    this.lastCentralStatus = status;
    return status;
  }

  async assertReady() {
    const status = await this.remoteStatus();
    this.#assertLocalLease(status);
    if (!status.ready) {
      if (status.retryAfterMs > 0) throw new GlobalSubmissionCooldownError(status);
      const error = new Error('CENTRAL_SCHEDULER_NOT_READY: the lease, queue, or restart-ambiguity gate is closed.');
      error.code = 'CENTRAL_SCHEDULER_NOT_READY';
      error.schedulerStatus = status;
      throw error;
    }
    return status;
  }

  async prepareTargetTransition({ operation, automationWindowId, priorOwnedTargetIds, anchorTargetId = null, targetId = null }) {
    if (!['ADD', 'REMOVE', 'RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(operation)) {
      throw new Error('RELAY_TARGET_TRANSITION_INVALID: unsupported operation.');
    }
    const prior = canonicalTargetIds(priorOwnedTargetIds);
    const status = await this.remoteStatus();
    const localLease = this.#localLeaseMatches(status);
    const passiveRecovery = !localLease && ['RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(operation);
    if (!localLease && !passiveRecovery) this.#assertLocalLease(status);
    if (passiveRecovery) this.#assertPassiveRecoveryLease(status);
    const binding = status.authenticatedRelayBinding;
    if (binding?.automationWindowId !== automationWindowId
      || binding?.ownedTargetCount !== prior.length
      || binding?.ownedTargetIdsSha256 !== targetIdsSha256(prior)
      || !Number.isInteger(binding?.bindingRevision) || binding.bindingRevision < 1) {
      throw new Error('CENTRAL_SCHEDULER_RELAY_BINDING_MISMATCH: exact pre-transition target set differs from Mission Control.');
    }
    if (status.relayTargetTransition?.state !== 'CLEAR') throw new Error('RELAY_TARGET_TRANSITION_BUSY: central target transition is already open.');
    return {
      transitionId: randomUUID(),
      operation,
      reason: {
        ADD: 'AUTOMATION_OWNED_TARGET_CREATE',
        REMOVE: 'AUTOMATION_OWNED_TARGET_CLOSE',
        RECONCILE_REMOVE: 'AUTOMATION_OWNED_TARGET_DISAPPEARED',
        WINDOW_REPLACE: 'AUTOMATION_OWNED_WINDOW_REPLACE',
      }[operation],
      hostAlias: this.host.alias,
      hostRole: this.host.role,
      deploymentEpoch: passiveRecovery ? status.activeLease.epoch : this.host.deploymentEpoch,
      leaseId: passiveRecovery ? status.activeLease.leaseId : this.host.leaseId,
      passiveRecovery,
      automationWindowId,
      priorBindingRevision: binding.bindingRevision,
      priorOwnedTargetIds: prior,
      anchorTargetId: operation === 'ADD' ? requiredTargetId(anchorTargetId, 'anchorTargetId') : null,
      targetId: ['REMOVE', 'RECONCILE_REMOVE'].includes(operation) ? requiredTargetId(targetId, 'targetId') : null,
    };
  }

  async beginTargetTransition(prepared) {
    this.#assertPreparedTransition(prepared);
    return this.schedulerClient.beginTargetTransition(prepared);
  }

  async commitTargetTransition(prepared, { postAutomationWindowId = prepared.automationWindowId, postOwnedTargetIds, transitionedTargetId }) {
    this.#assertPreparedTransition(prepared);
    return this.schedulerClient.commitTargetTransition({
      ...prepared,
      postAutomationWindowId,
      postOwnedTargetIds: canonicalTargetIds(postOwnedTargetIds),
      transitionedTargetId: requiredTargetId(transitionedTargetId, 'transitionedTargetId'),
    });
  }

  async abortTargetTransition(prepared, { observedAutomationWindowId = prepared.automationWindowId, observedOwnedTargetIds }) {
    this.#assertPreparedTransition(prepared);
    return this.schedulerClient.abortTargetTransition({
      ...prepared,
      observedAutomationWindowId,
      observedOwnedTargetIds: canonicalTargetIds(observedOwnedTargetIds),
    });
  }

  async submit({ context, beforeSubmit = null, recordBoundary = null, submit }) {
    validateContext(context);
    if (typeof submit !== 'function') throw new Error('Central submission scheduling requires a submit function.');
    if (recordBoundary !== null && typeof recordBoundary !== 'function') throw new Error('recordBoundary must be a function when provided.');
    const operation = this.tail.then(async () => {
      for (;;) {
        const localPacing = localPacingStatus(await this.stateStore.read(), this.minIntervalMs, this.now());
        if (!localPacing.ready) throw new GlobalSubmissionCooldownError(localPacing);
        const { hash: _hash, ...requestContext } = context;
        const admission = await this.schedulerClient.admit({
          ...requestContext,
          queueKey: context.queueKey,
          retryRootKey: context.queueKey,
          hostAlias: this.host.alias,
          hostRole: this.host.role,
          deploymentEpoch: this.host.deploymentEpoch,
          leaseId: this.host.leaseId,
        });
        this.#assertAdmissionAuthority(admission, { requireAdmitted: true });
        let boundaryRecorded = false;
        let durableBoundaryAt = null;
        let submitStarted = false;
        const persistBoundary = async (observed) => {
          if (!boundaryRecorded) {
            const observedAt = observed?.clickedAtObserved ?? observed?.startedAtObserved ?? null;
            const observedMs = Date.parse(observedAt ?? '');
            durableBoundaryAt = Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : new Date(this.now()).toISOString();
            const boundaryKind = observed?.startedAtObserved ? 'GENERATION_STARTED' : 'CLICKED';
            const conversationUrlSha256 = typeof observed?.conversationUrl === 'string' ? context.hash(observed.conversationUrl) : null;
            await this.schedulerClient.recordBoundary({ admissionId: admission.admissionId, boundaryAt: durableBoundaryAt, boundaryKind, conversationUrlSha256 });
            boundaryRecorded = true;
          }
          const state = await this.stateStore.read();
          state.submissionPacing = { lastSubmissionAt: durableBoundaryAt, lastAdmissionId: admission.admissionId };
          if (recordBoundary) await recordBoundary(state, { boundaryAt: durableBoundaryAt, result: observed, admission });
          await this.stateStore.write(state);
        };
        const validateBeforeClick = async () => {
          const validation = await this.schedulerClient.validateAdmission({ admissionId: admission.admissionId });
          this.#assertAdmissionAuthority(validation, {
            requireValid: true,
            expectedAdmissionId: admission.admissionId,
            expectedExpiresAt: admission.expiresAt,
          });
          return validation;
        };
        const persistTargetBinding = async (result) => {
          if (context.targetKind !== 'FRESH_PROVIDER_SESSION' || typeof result?.conversationUrl !== 'string') return;
          await this.schedulerClient.bindTarget({ admissionId: admission.admissionId, conversationUrlSha256: context.hash(result.conversationUrl) });
        };
        try {
          if (beforeSubmit) await beforeSubmit(admission);
          submitStarted = true;
          const result = await submit(persistBoundary, admission, validateBeforeClick);
          await persistBoundary(result);
          try { await persistTargetBinding(result); }
          catch (error) {
            if (error && typeof error === 'object') {
              error.relayStage = 'GENERATION_STARTED';
              error.clickedAtObserved = result?.clickedAtObserved ?? durableBoundaryAt;
              error.startedAtObserved = result?.startedAtObserved ?? null;
            }
            throw error;
          }
          await this.schedulerClient.recordOutcome({
            admissionId: admission.admissionId,
            deliveryStatus: result?.generationStarted === true ? 'GENERATION_STARTED' : 'DELIVERED',
            recoveryStatus: admission.providerRateLimitCount > 0 ? 'RECOVERED' : 'NOT_REQUIRED',
          });
          return result;
        } catch (error) {
          const crossed = error?.relayStage === 'CLICKED' || error?.relayStage === 'GENERATION_STARTED'
            || Number.isFinite(Date.parse(error?.clickedAtObserved ?? '')) || Number.isFinite(Date.parse(error?.startedAtObserved ?? ''));
          if (!boundaryRecorded && crossed) {
            try { await persistBoundary(error); }
            catch (boundaryError) {
              if (boundaryError && typeof boundaryError === 'object') {
                boundaryError.relayStage = error?.relayStage ?? 'CLICKED';
                boundaryError.clickedAtObserved = error?.clickedAtObserved ?? null;
                boundaryError.submissionBoundaryPersistenceAttempted = true;
              }
              throw boundaryError;
            }
          }
          let rateLimitRecord = null;
          if (!boundaryRecorded) {
            const stage = !submitStarted ? 'BEFORE_SUBMIT' : (typeof error?.relayStage === 'string' ? error.relayStage : 'UNKNOWN');
            if (stage === 'UNKNOWN') throw error;
            rateLimitRecord = await this.schedulerClient.abortBeforeBoundary({
              admissionId: admission.admissionId,
              relayStage: stage,
              failureKind: isChatGptRateLimitRetry(error) ? 'PROVIDER_RATE_LIMIT' : 'PRECLICK_FAILURE',
            });
          }
          if (!isChatGptRateLimitRetry(error)) {
            if (boundaryRecorded) await this.schedulerClient.recordOutcome({
              admissionId: admission.admissionId,
              deliveryStatus: 'FAILED_CLOSED',
              recoveryStatus: 'FAILED_CLOSED',
            });
            throw error;
          }
          if (boundaryRecorded) rateLimitRecord = await this.schedulerClient.recordRateLimit({ admissionId: admission.admissionId });
          await this.schedulerClient.recordOutcome({
            admissionId: admission.admissionId,
            deliveryStatus: 'PROVIDER_RATE_LIMITED',
            recoveryStatus: rateLimitRecord?.retryExhausted === true ? 'FAILED_CLOSED' : 'BOUNDED_RETRY_PENDING',
          });
          if (rateLimitRecord?.providerRateLimitCount >= 2 || rateLimitRecord?.retryExhausted === true) throw new ChatGptRateLimitRetryExhaustedError({
            retryAfterMs: error.retryAfterMs,
            relayStage: error.relayStage,
            clickedAtObserved: error.clickedAtObserved,
            startedAtObserved: error.startedAtObserved,
          });
          const central = await this.remoteStatus();
          const waitMs = Math.max(error.retryAfterMs, central.retryAfterMs ?? 0);
          await this.sleepImpl(waitMs);
        }
      }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  #assertCentralContract(status) {
    if (status?.authority !== 'MISSION_CONTROL_SINGLE_WRITER' || status?.ledger?.valid !== true) {
      throw new Error('CENTRAL_SCHEDULER_INTEGRITY_INVALID: Mission Control did not prove the shared single-writer ledger.');
    }
    if (status?.minimumIntervalMs !== this.minIntervalMs) throw new Error('CENTRAL_SCHEDULER_INTERVAL_MISMATCH: relay and authority intervals differ.');
    const binding = status?.authenticatedRelayBinding;
    if (binding?.hostAlias !== this.host.alias || binding?.hostRole !== this.host.role || !Number.isInteger(binding?.automationWindowId)
      || !Number.isInteger(binding?.ownedTargetCount) || binding.ownedTargetCount < 1
      || !/^[a-f0-9]{64}$/.test(binding?.ownedTargetIdsSha256 ?? '')) {
      throw new Error('CENTRAL_SCHEDULER_RELAY_BINDING_MISMATCH: authenticated relay host/ownership binding is absent or inconsistent.');
    }
  }

  #assertLocalLease(status) {
    const lease = status?.activeLease;
    if (!lease || lease.epoch !== this.host.deploymentEpoch || lease.activeHostAlias !== this.host.alias || lease.activeHostRole !== this.host.role) {
      const error = new Error('DEPLOYMENT_LEASE_MISMATCH: central scheduler authority belongs to a different host/epoch.');
      error.code = this.host.role === 'SECONDARY' && lease?.activeHostRole !== 'SECONDARY' ? 'STANDBY_SEND_FORBIDDEN' : 'DEPLOYMENT_LEASE_MISMATCH';
      throw error;
    }
  }

  #localLeaseMatches(status) {
    const lease = status?.activeLease;
    return Boolean(lease && lease.epoch === this.host.deploymentEpoch
      && lease.activeHostAlias === this.host.alias && lease.activeHostRole === this.host.role);
  }

  #assertPassiveRecoveryLease(status) {
    const lease = status?.activeLease;
    if (!lease || typeof lease.leaseId !== 'string' || lease.leaseId.length === 0
      || !Number.isInteger(lease.epoch) || Date.parse(lease.expiresAt ?? '') <= this.now()
      || lease.splitBrainStatus !== 'SINGLE_ACTIVE_CONFIRMED'
      || (lease.activeHostAlias === this.host.alias && lease.activeHostRole === this.host.role)) {
      const error = new Error('PASSIVE_RECOVERY_LEASE_INVALID: inactive relay recovery requires the exact live active-lease snapshot.');
      error.code = 'PASSIVE_RECOVERY_LEASE_INVALID';
      throw error;
    }
  }

  #assertAdmissionAuthority(value, {
    requireAdmitted = false,
    requireValid = false,
    expectedAdmissionId = null,
    expectedExpiresAt = null,
  } = {}) {
    const expiryMs = Date.parse(value?.expiresAt ?? '');
    if ((requireAdmitted && (value?.admitted !== true || value?.singleUse !== true))
      || (requireValid && value?.valid !== true)
      || typeof value?.admissionId !== 'string'
      || !Number.isFinite(expiryMs)
      || expiryMs <= this.now()
      || (expectedAdmissionId !== null && value.admissionId !== expectedAdmissionId)
      || (expectedExpiresAt !== null && value.expiresAt !== expectedExpiresAt)) {
      throw new Error('CENTRAL_SCHEDULER_INVALID_ADMISSION: scheduler did not return an exact single-use admission identity.');
    }
    if (value.minimumIntervalMs !== this.minIntervalMs || value.leaseEpoch !== this.host.deploymentEpoch
      || value.hostAlias !== this.host.alias || value.hostRole !== this.host.role) {
      const error = new Error('CENTRAL_SCHEDULER_AUTHORITY_MISMATCH: admission authority differs from relay host, epoch, or interval.');
      error.code = 'CENTRAL_SCHEDULER_AUTHORITY_MISMATCH';
      throw error;
    }
  }

  #assertPreparedTransition(value) {
    const passiveRecovery = value?.passiveRecovery === true
      && ['RECONCILE_REMOVE', 'WINDOW_REPLACE'].includes(value?.operation);
    if (!value || value.hostAlias !== this.host.alias || value.hostRole !== this.host.role
      || (!passiveRecovery && (value.deploymentEpoch !== this.host.deploymentEpoch || value.leaseId !== this.host.leaseId))
      || (passiveRecovery && (!Number.isInteger(value.deploymentEpoch) || typeof value.leaseId !== 'string'))) {
      throw new Error('RELAY_TARGET_TRANSITION_HOST_MISMATCH: prepared transition does not belong to this relay lease.');
    }
  }
}

function canonicalTargetIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3
    || value.some((targetId) => typeof targetId !== 'string' || targetId.trim() === '')
    || new Set(value).size !== value.length) {
    throw new Error('RELAY_TARGET_TRANSITION_INVALID: target IDs must be a unique one-to-three element string array.');
  }
  return [...value].sort();
}

function requiredTargetId(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`RELAY_TARGET_TRANSITION_INVALID: ${field} is required.`);
  return value;
}

function targetIdsSha256(ids) {
  return createHash('sha256').update(JSON.stringify([...ids].sort())).digest('hex');
}

export class GlobalSubmissionPacer {
  constructor({ stateStore, minIntervalMs = 20_000, now = Date.now, sleepImpl = sleep }) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.write !== 'function') {
      throw new Error('Global submission pacing requires a relay state store.');
    }
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < 15_000 || minIntervalMs > 600_000) {
      throw new Error('minIntervalMs must be an integer from 15000 to 600000.');
    }
    if (typeof sleepImpl !== 'function') throw new Error('Global submission pacing requires a sleep function.');
    this.stateStore = stateStore;
    this.minIntervalMs = minIntervalMs;
    this.now = now;
    this.sleepImpl = sleepImpl;
    this.tail = Promise.resolve();
  }

  status(state, nowMs = this.now()) {
    const lastSubmissionAt = state?.submissionPacing?.lastSubmissionAt ?? null;
    const lastMs = Date.parse(lastSubmissionAt ?? '');
    const nextMs = Number.isFinite(lastMs) ? lastMs + this.minIntervalMs : null;
    const retryAfterMs = nextMs == null ? 0 : Math.max(0, nextMs - nowMs);
    return {
      minimumIntervalMs: this.minIntervalMs,
      lastSubmissionAt,
      retryAfterMs,
      nextSubmissionAt: nextMs == null ? null : new Date(nextMs).toISOString(),
      ready: retryAfterMs === 0,
    };
  }

  async assertReady() {
    const pacing = this.status(await this.stateStore.read());
    if (!pacing.ready) throw new GlobalSubmissionCooldownError(pacing);
    return pacing;
  }

  async submit({ beforeSubmit = null, recordBoundary = null, submit }) {
    if (typeof submit !== 'function') throw new Error('Global submission pacing requires a submit function.');
    if (recordBoundary !== null && typeof recordBoundary !== 'function') {
      throw new Error('Global submission pacing recordBoundary must be a function when provided.');
    }
    const operation = this.tail.then(async () => {
      let rateLimitRetries = 0;
      for (;;) {
        const state = await this.stateStore.read();
        const pacing = this.status(state);
        if (!pacing.ready) throw new GlobalSubmissionCooldownError(pacing);
        if (beforeSubmit) await beforeSubmit();
        try {
          const persistObservedBoundary = (observed) => this.#recordSubmissionBoundaryOrFailClosed(
            observed?.clickedAtObserved ?? observed?.startedAtObserved ?? null,
            { result: observed, recordBoundary },
          );
          const result = await submit(persistObservedBoundary);
          await this.#recordSubmissionBoundaryOrFailClosed(
            result?.clickedAtObserved ?? result?.startedAtObserved ?? null,
            { result, recordBoundary },
          );
          return result;
        } catch (error) {
          if (!error?.submissionBoundaryPersistenceAttempted && (error?.relayStage === 'CLICKED' || error?.relayStage === 'GENERATION_STARTED')) {
            await this.#recordSubmissionBoundaryOrFailClosed(error.clickedAtObserved ?? error.startedAtObserved ?? null);
          }
          if (!isChatGptRateLimitRetry(error)) throw error;
          if (rateLimitRetries >= 1) {
            throw new ChatGptRateLimitRetryExhaustedError({
              retryAfterMs: error.retryAfterMs,
              relayStage: error.relayStage,
              clickedAtObserved: error.clickedAtObserved,
              startedAtObserved: error.startedAtObserved,
            });
          }
          rateLimitRetries += 1;
          const postFailurePacing = this.status(await this.stateStore.read());
          const waitMs = Math.max(error.retryAfterMs, postFailurePacing.retryAfterMs);
          await this.sleepImpl(waitMs);
        }
      }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  async #recordSubmissionBoundary(observedAt, { result = null, recordBoundary = null } = {}) {
    const observedMs = Date.parse(observedAt ?? '');
    const boundaryAt = Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : new Date(this.now()).toISOString();
    const state = await this.stateStore.read();
    state.submissionPacing = { lastSubmissionAt: boundaryAt };
    if (recordBoundary) await recordBoundary(state, { boundaryAt, result });
    await this.stateStore.write(state);
  }

  async #recordSubmissionBoundaryOrFailClosed(observedAt, options = {}) {
    try {
      await this.#recordSubmissionBoundary(observedAt, options);
    } catch (error) {
      if (error && typeof error === 'object') {
        error.relayStage = 'CLICKED';
        error.clickedAtObserved = observedAt;
        error.submissionBoundaryPersistenceAttempted = true;
      }
      throw error;
    }
  }
}

export class GlobalSubmissionCooldownError extends Error {
  constructor(pacing) {
    super(`${GLOBAL_SUBMISSION_COOLDOWN}: retry after ${pacing.retryAfterMs} ms.`);
    this.name = 'GlobalSubmissionCooldownError';
    this.code = GLOBAL_SUBMISSION_COOLDOWN;
    Object.assign(this, pacing);
  }
}

export class ChatGptRateLimitRetryError extends Error {
  constructor({ retryAfterMs = 30_000, relayStage = 'UNKNOWN', clickedAtObserved = null, startedAtObserved = null } = {}) {
    super(`${CHATGPT_RATE_LIMIT_RETRY}: provider requested a bounded retry after ${retryAfterMs} ms.`);
    this.name = 'ChatGptRateLimitRetryError';
    this.code = CHATGPT_RATE_LIMIT_RETRY;
    this.retryAfterMs = retryAfterMs;
    this.relayStage = relayStage;
    this.clickedAtObserved = clickedAtObserved;
    this.startedAtObserved = startedAtObserved;
  }
}

export class ChatGptRateLimitRetryExhaustedError extends Error {
  constructor({ retryAfterMs, relayStage, clickedAtObserved, startedAtObserved }) {
    super(`${CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED}: the exact retry also hit the provider rate-limit gate.`);
    this.name = 'ChatGptRateLimitRetryExhaustedError';
    this.code = CHATGPT_RATE_LIMIT_RETRY_EXHAUSTED;
    this.retryAfterMs = retryAfterMs;
    this.relayStage = relayStage ?? 'UNKNOWN';
    this.clickedAtObserved = clickedAtObserved ?? null;
    this.startedAtObserved = startedAtObserved ?? null;
  }
}

export function isGlobalSubmissionCooldown(error) {
  return error?.code === GLOBAL_SUBMISSION_COOLDOWN;
}

export function isChatGptRateLimitRetry(error) {
  return error?.code === CHATGPT_RATE_LIMIT_RETRY;
}

export function publicCooldown(error) {
  return {
    minimumIntervalMs: error.minimumIntervalMs,
    lastSubmissionAt: error.lastSubmissionAt,
    retryAfterMs: error.retryAfterMs,
    nextSubmissionAt: error.nextSubmissionAt,
    ready: false,
  };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function localPacingStatus(state, minIntervalMs, nowMs) {
  const lastSubmissionAt = state?.submissionPacing?.lastSubmissionAt ?? null;
  const lastMs = Date.parse(lastSubmissionAt ?? '');
  const nextMs = Number.isFinite(lastMs) ? lastMs + minIntervalMs : null;
  const retryAfterMs = nextMs == null ? 0 : Math.max(0, nextMs - nowMs);
  return { minimumIntervalMs: minIntervalMs, lastSubmissionAt, retryAfterMs, nextSubmissionAt: nextMs == null ? null : new Date(nextMs).toISOString(), ready: retryAfterMs === 0 };
}

function validateContext(context) {
  const strings = ['requestId', 'queueKey', 'sendPath', 'supervisorId', 'registrationId', 'targetId', 'targetKind', 'targetKey', 'expectedUrlSha256', 'bodySha256'];
  if (!context || strings.some((key) => typeof context[key] !== 'string' || context[key].trim() === '')
    || !Number.isInteger(context.automationWindowId) || context.automationWindowId < 1 || typeof context.hash !== 'function') {
    throw new Error('Every browser send requires exact central scheduler context.');
  }
}
