import { createHash, randomUUID } from 'node:crypto';

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
  constructor({ stateStore, chats, minIntervalMs = MINIMUM_GLOBAL_SUBMISSION_INTERVAL_MS, admissionTtlMs = 120_000, now = Date.now }) {
    if (!stateStore || typeof stateStore.read !== 'function' || typeof stateStore.write !== 'function') throw new Error('A durable scheduler state store is required.');
    if (!Number.isInteger(minIntervalMs) || minIntervalMs < MINIMUM_GLOBAL_SUBMISSION_INTERVAL_MS || minIntervalMs > 600_000) {
      throw new Error('The central scheduler interval must be 60000-600000 ms.');
    }
    if (!Number.isInteger(admissionTtlMs) || admissionTtlMs < 30_000 || admissionTtlMs > 600_000) throw new Error('admissionTtlMs must be 30000-600000.');
    if (!Array.isArray(chats) || chats.length === 0) throw new Error('The central scheduler requires a non-empty Mission Control-only supervisor registry.');
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
        throw new SubmissionSchedulerError('SUBMISSION_QUEUE_KEY_CONFLICT', 'The queue key already binds different immutable send fields.');
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

export function defaultSchedulerState(now = new Date().toISOString()) {
  return { schemaVersion: 1, createdAt: now, updatedAt: now, activeLease: null, leaseHistory: [], lastBoundaryAt: null, nextSequence: 1, nextQueueSequence: 1, queueItems: [], admissions: [], targetBindings: {}, safetyHalt: null };
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

function assertRegistryTarget(chats, state, request) {
  const chat = chats.get(request.supervisorId);
  if (!chat) throw new SubmissionSchedulerError('SUPERVISOR_NOT_REGISTERED', 'The supervisor is absent from the current registry.');
  if (chat.ownership !== 'MISSION_CONTROL_ONLY' || chat.registrationId !== request.registrationId) throw new SubmissionSchedulerError('SUPERVISOR_OWNERSHIP_MISMATCH', 'Mission Control-only ownership and registration must match exactly.');
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
    ready: Boolean(leaseReady && effectiveRetryAfterMs === 0 && !open && !rateLimitItem && !state.safetyHalt),
    activeLease: state.activeLease ? { epoch: state.activeLease.epoch, activeHostAlias: state.activeLease.activeHostAlias, activeHostRole: state.activeLease.activeHostRole, expiresAt: state.activeLease.expiresAt, splitBrainStatus: state.activeLease.splitBrainStatus } : null,
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
