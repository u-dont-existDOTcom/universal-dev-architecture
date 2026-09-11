import { loadConfiguredSupervisorChats, type ConfiguredSupervisorChat } from "./configured-supervisor-chats";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { EventStore } from "./store";

// This ESM module is the runtime-neutral authority algorithm shared with its
// deterministic relay contract tests. Mission Control is its only deployable
// service host.
// @ts-ignore JavaScript authority module intentionally has no declaration file.
import {
  CentralSubmissionScheduler,
  SubmissionSchedulerError,
  defaultSchedulerState,
  normalizeSchedulerState,
  parseDeploymentLease,
} from "./provider-submission-authority.mjs";

type SchedulerState = Record<string, any>;

export class SubmissionAuthorityDisabledError extends Error {
  readonly statusCode = 503;
  readonly code = "SUBMISSION_AUTHORITY_DISABLED";
}

export class MissionControlSubmissionStateStore {
  constructor(
    private readonly store: EventStore,
    readonly pacingDomain: string,
    private readonly minimumIntervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async read(): Promise<SchedulerState> {
    const persisted = this.store.submissionAuthorityState(this.pacingDomain);
    return persisted === null
      ? defaultSchedulerState(new Date(this.now()).toISOString())
      : normalizeSchedulerState(persisted, new Date(this.now()).toISOString());
  }

  async write(value: unknown): Promise<SchedulerState> {
    const priorRaw = this.store.submissionAuthorityState(this.pacingDomain);
    const prior = priorRaw === null ? null : normalizeSchedulerState(priorRaw);
    const state = normalizeSchedulerState(value, new Date(this.now()).toISOString());
    this.store.commitSubmissionAuthorityState(
      this.pacingDomain,
      state,
      ledgerEntry(prior, state, this.minimumIntervalMs),
    );
    return state;
  }
}

export class SubmissionAuthorityRuntime {
  readonly enabled: boolean;
  readonly pacingDomain: string | null;
  private readonly scheduler: any | null;
  private readonly initialization: Promise<unknown>;
  private readonly chats: Map<string, ConfiguredSupervisorChat>;

  constructor(
    private readonly store: EventStore,
    env: NodeJS.ProcessEnv = process.env,
    now: () => number = Date.now,
  ) {
    const directory = loadConfiguredSupervisorChats(env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON);
    const leaseRaw = env.MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON;
    const domain = env.MISSION_CONTROL_SUBMISSION_PACING_DOMAIN?.trim() || null;
    const partiallyConfigured = Boolean(leaseRaw || domain || env.MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS);
    if (!leaseRaw && !domain && !partiallyConfigured) {
      this.enabled = false;
      this.pacingDomain = null;
      this.scheduler = null;
      this.initialization = Promise.resolve();
      this.chats = new Map();
      return;
    }
    if (!leaseRaw || !domain) throw new Error("Mission Control submission authority requires both MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON and MISSION_CONTROL_SUBMISSION_PACING_DOMAIN.");
    if (directory.configurationState !== "CONFIGURED" || directory.entries.length === 0) {
      throw new Error(`Mission Control submission authority requires a valid non-empty MISSION_CONTROL_ONLY registry: ${directory.error ?? directory.configurationState}.`);
    }
    const accountAliases = new Set(directory.entries.map((chat) => chat.accountAlias));
    if (accountAliases.size !== 1) throw new Error("One pacing domain may contain exactly one provider account alias.");
    const minimumIntervalMs = boundedInteger(env.MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS, 60_000, 60_000, 600_000);
    const admissionTtlMs = boundedInteger(env.MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS, 120_000, 30_000, 600_000);
    const stateStore = new MissionControlSubmissionStateStore(store, domain, minimumIntervalMs, now);
    this.scheduler = new CentralSubmissionScheduler({
      stateStore,
      chats: directory.entries,
      minIntervalMs: minimumIntervalMs,
      admissionTtlMs,
      now,
    });
    this.enabled = true;
    this.pacingDomain = domain;
    this.chats = new Map(directory.entries.map((chat) => [chat.supervisorId, chat]));
    const lease = parseDeploymentLease(JSON.parse(leaseRaw));
    this.initialization = this.scheduler.activateLease(lease).then(
      () => null,
      (error: unknown) => error,
    );
  }

  async status() {
    const scheduler = await this.requireScheduler();
    const status = await scheduler.status();
    return {
      ...status,
      authority: "MISSION_CONTROL_SINGLE_WRITER",
      pacingDomain: this.pacingDomain,
      ledger: this.store.verifySubmissionAuthorityLedger(this.pacingDomain!),
    };
  }

  async ledger(limit = 200) {
    await this.requireScheduler();
    const records = this.store.submissionAuthorityLedger(this.pacingDomain!, limit);
    const boundaryRecords = this.store.submissionAuthorityBoundaryLedger(this.pacingDomain!);
    return {
      authority: "MISSION_CONTROL_SINGLE_WRITER",
      pacingDomain: this.pacingDomain,
      integrity: this.store.verifySubmissionAuthorityLedger(this.pacingDomain!),
      diagnostics: pacingDiagnostics(boundaryRecords),
      records,
    };
  }

  async execute(operation: string, body: unknown, producer: AuthenticatedProducer) {
    const scheduler = await this.requireScheduler();
    if (producer.kind !== "COLLECTOR") {
      const error = new Error("Only an authenticated provider-relay collector may mutate submission authority.");
      Object.assign(error, { statusCode: 403, code: "SUBMISSION_PRODUCER_KIND_FORBIDDEN" });
      throw error;
    }
    if (operation === "admissions") this.assertAdmissionScope(body, producer);
    if (operation === "admissions/validate") return scheduler.validateAdmission(body, producer.id);
    if (operation === "admissions") return scheduler.admit(body, producer.id);
    if (operation === "boundaries") return scheduler.recordBoundary(body, producer.id);
    if (operation === "target-bindings") return scheduler.bindTarget(body, producer.id);
    if (operation === "provider-rate-limits") return scheduler.recordRateLimit(body, producer.id);
    if (operation === "aborts") return scheduler.abortBeforeBoundary(body, producer.id);
    if (operation === "outcomes") return scheduler.recordOutcome(body, producer.id);
    const error = new Error("Submission-authority operation was not found.");
    Object.assign(error, { statusCode: 404, code: "SUBMISSION_AUTHORITY_OPERATION_UNKNOWN" });
    throw error;
  }

  private async requireScheduler(): Promise<any> {
    if (!this.enabled || !this.scheduler) throw new SubmissionAuthorityDisabledError("Mission Control submission authority is not configured; all provider sends remain disabled.");
    const initializationError = await this.initialization;
    if (initializationError) throw initializationError;
    return this.scheduler;
  }

  private assertAdmissionScope(body: unknown, producer: AuthenticatedProducer) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return;
    const supervisorId = (body as Record<string, unknown>).supervisorId;
    const authorizationRef = (body as Record<string, unknown>).authorizationRef;
    if (typeof supervisorId !== "string") return;
    const chat = this.chats.get(supervisorId);
    const workerId = chat?.workerId;
    if (workerId && !producer.workerScopes.includes("*") && !producer.workerScopes.includes(workerId)) {
      const error = new Error("Authenticated producer worker scope does not cover the registered supervisor target.");
      Object.assign(error, { statusCode: 403, code: "SUBMISSION_AUTHORIZATION_SCOPE_MISMATCH" });
      throw error;
    }
    const expectedAuthorizationRef = workerId ? `task:${workerId}` : "task:mission-control";
    if (authorizationRef !== expectedAuthorizationRef
      || (!producer.taskScopes.includes("*") && !producer.taskScopes.includes(expectedAuthorizationRef))) {
      const error = new Error("Submission authorization is missing, stale, or outside the authenticated producer task scope.");
      Object.assign(error, { statusCode: 403, code: "SUBMISSION_AUTHORIZATION_STALE_OR_MISSING" });
      throw error;
    }
  }
}

export { SubmissionSchedulerError };

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Submission-authority integer must be ${minimum}-${maximum}.`);
  }
  return parsed;
}

function ledgerEntry(prior: SchedulerState | null, state: SchedulerState, minimumIntervalMs: number): Record<string, unknown> {
  const changedAdmission = findChangedRecord(state.admissions, prior?.admissions ?? [], "admissionId");
  const changedQueueItem = findChangedRecord(state.queueItems, prior?.queueItems ?? [], "queueItemId");
  const admission = changedAdmission ?? null;
  const queueItem = admission
    ? state.queueItems.find((item: SchedulerState) => item.queueItemId === admission.queueItemId) ?? changedQueueItem ?? null
    : changedQueueItem ?? null;
  const previousAdmission = prior?.admissions?.find((item: SchedulerState) => item.admissionId === admission?.admissionId) ?? null;
  const eventKind = deriveEventKind(prior, state, previousAdmission, admission);
  const previousBoundaryAt = admission?.previousGlobalBoundaryAt ?? null;
  const boundaryMs = Date.parse(admission?.boundaryAt ?? "");
  const previousMs = Date.parse(previousBoundaryAt ?? "");
  const rateLimitCount = admission
    ? state.admissions.filter((item: SchedulerState) => item.retryRootKey === admission.retryRootKey && item.providerRateLimitObservedAt).length
    : 0;
  return {
    eventKind,
    queueItemId: queueItem?.queueItemId ?? null,
    authorizationReference: admission?.authorizationRef ?? queueItem?.request?.authorizationRef ?? null,
    producerId: admission?.producerId ?? null,
    hostAlias: admission?.hostAlias ?? state.activeLease?.activeHostAlias ?? null,
    hostRole: admission?.hostRole ?? state.activeLease?.activeHostRole ?? null,
    deploymentEpoch: admission?.deploymentEpoch ?? state.activeLease?.epoch ?? null,
    host: admission ? {
      alias: admission.hostAlias,
      role: admission.hostRole,
      deploymentEpoch: admission.deploymentEpoch,
    } : state.activeLease ? {
      alias: state.activeLease.activeHostAlias,
      role: state.activeLease.activeHostRole,
      deploymentEpoch: state.activeLease.epoch,
    } : null,
    sendPath: admission?.sendPath ?? queueItem?.request?.sendPath ?? null,
    supervisorId: admission?.supervisorId ?? queueItem?.request?.supervisorId ?? null,
    registrationId: admission?.registrationId ?? queueItem?.request?.registrationId ?? null,
    targetId: admission?.targetId ?? queueItem?.request?.targetId ?? null,
    targetKind: admission?.targetKind ?? queueItem?.request?.targetKind ?? null,
    targetKey: admission?.targetKey ?? queueItem?.request?.targetKey ?? null,
    bodySha256: admission?.bodySha256 ?? queueItem?.request?.bodySha256 ?? null,
    admittedAt: admission?.admittedAt ?? null,
    expiresAt: admission?.expiresAt ?? null,
    actualSubmissionBoundaryAt: admission?.boundaryAt ?? null,
    boundaryKind: admission?.boundaryKind ?? null,
    previousGlobalSubmissionBoundaryAt: previousBoundaryAt,
    interSendIntervalMs: Number.isFinite(boundaryMs) && Number.isFinite(previousMs) ? boundaryMs - previousMs : null,
    minimumIntervalMs,
    rateLimitState: rateLimitCount === 0 ? "CLEAR" : rateLimitCount === 1 ? "ONE_BOUNDED_RETRY" : "RETRY_EXHAUSTED",
    retryState: { retryRootKey: admission?.retryRootKey ?? null, providerRateLimitCount: rateLimitCount },
    deliveryStatus: admission?.deliveryStatus ?? null,
    recoveryStatus: admission?.recoveryStatus ?? null,
    queueStatus: queueItem?.status ?? null,
    admissionStatus: admission?.status ?? null,
  };
}

function findChangedRecord(current: SchedulerState[], prior: SchedulerState[], key: string): SchedulerState | null {
  return [...current].reverse().find((record) => {
    const previous = prior.find((candidate) => candidate[key] === record[key]);
    return !previous || JSON.stringify(previous) !== JSON.stringify(record);
  }) ?? null;
}

function deriveEventKind(prior: SchedulerState | null, state: SchedulerState, previousAdmission: SchedulerState | null, admission: SchedulerState | null): string {
  if (!prior || state.leaseHistory.length > prior.leaseHistory.length) return "LEASE_ACTIVATED";
  if (state.queueItems.length > prior.queueItems.length) return "QUEUE_ITEM_DURABLY_ENQUEUED";
  if (state.admissions.length > prior.admissions.length) return "SINGLE_USE_ADMISSION_GRANTED";
  if (admission?.deliveryStatus !== previousAdmission?.deliveryStatus || admission?.recoveryStatus !== previousAdmission?.recoveryStatus) return "DELIVERY_OUTCOME_RECORDED";
  if (admission?.providerRateLimitObservedAt !== previousAdmission?.providerRateLimitObservedAt) return "PROVIDER_RATE_LIMIT_RECORDED";
  if (state.lastBoundaryAt !== prior.lastBoundaryAt) return "BOUNDARY_RECORDED";
  if (admission?.status !== previousAdmission?.status) return "ADMISSION_STATE_CHANGED";
  if (Object.keys(state.targetBindings).length > Object.keys(prior.targetBindings).length) return "TARGET_BOUND";
  return "STATE_COMMITTED";
}

function pacingDiagnostics(records: Array<Record<string, unknown>>) {
  const intervalsInOrder = records
    .filter((record) => record.eventKind === "BOUNDARY_RECORDED")
    .map((record) => record.interSendIntervalMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const intervals = [...intervalsInOrder].sort((left, right) => left - right);
  const median = intervals.length === 0 ? null : intervals.length % 2 === 1
    ? intervals[(intervals.length - 1) / 2]
    : (intervals[intervals.length / 2 - 1] + intervals[intervals.length / 2]) / 2;
  return {
    intervalCount: intervals.length,
    minimumObservedIntervalMs: intervals.at(0) ?? null,
    medianObservedIntervalMs: median,
    recentIntervalsMs: intervalsInOrder.slice(-10),
    violationsBelow60000Ms: intervals.filter((value) => value < 60_000).length,
  };
}
