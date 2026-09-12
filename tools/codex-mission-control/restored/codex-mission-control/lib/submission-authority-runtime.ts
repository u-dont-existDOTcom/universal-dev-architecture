import { createHash } from "node:crypto";
import {
  CANONICAL_PROJECT_MANAGER_ID,
  loadConfiguredSupervisorChatProvisions,
  loadConfiguredSupervisorChats,
  type ConfiguredSupervisorChat,
  type ConfiguredSupervisorChatProvision,
} from "./configured-supervisor-chats";
import type { AuthenticatedProducer } from "./ingestion-auth";
import type { EventStore } from "./store";

// This ESM module is the runtime-neutral authority algorithm shared with its
// deterministic relay contract tests. Mission Control is its only deployable
// service host.
import {
  CentralSubmissionScheduler,
  SubmissionSchedulerError,
  defaultSchedulerState,
  normalizeSchedulerState,
  parseDeploymentLease,
  parseSubmissionRelayAttestors,
  parseSubmissionRelayBindings,
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
  private readonly chats: Map<string, ConfiguredSupervisorChat | ConfiguredSupervisorChatProvision>;
  private readonly relayBindings: Map<string, Record<string, unknown>>;
  private readonly minimumIntervalMs: number | null;

  constructor(
    private readonly store: EventStore,
    env: Record<string, string | undefined> = process.env,
    now: () => number = Date.now,
  ) {
    const directory = loadConfiguredSupervisorChats(env.MISSION_CONTROL_SUPERVISOR_CHATS_JSON);
    const provisions = loadConfiguredSupervisorChatProvisions(env.MISSION_CONTROL_SUPERVISOR_CHAT_PROVISIONS_JSON);
    const leaseRaw = env.MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON;
    const domain = env.MISSION_CONTROL_SUBMISSION_PACING_DOMAIN?.trim() || null;
    const partiallyConfigured = Boolean(leaseRaw || domain || env.MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS
      || env.MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS || env.MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON
      || env.MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON || env.MISSION_CONTROL_SUPERVISOR_CHAT_PROVISIONS_JSON);
    if (!leaseRaw && !domain && !partiallyConfigured) {
      this.enabled = false;
      this.pacingDomain = null;
      this.scheduler = null;
      this.initialization = Promise.resolve();
      this.chats = new Map();
      this.relayBindings = new Map();
      this.minimumIntervalMs = null;
      return;
    }
    if (!leaseRaw || !domain) throw new Error("Mission Control submission authority requires both MISSION_CONTROL_SUBMISSION_ACTIVE_LEASE_JSON and MISSION_CONTROL_SUBMISSION_PACING_DOMAIN.");
    if (directory.configurationState === "INVALID") {
      throw new Error(`Mission Control submission authority requires a valid MISSION_CONTROL_ONLY registry: ${directory.error}.`);
    }
    if (provisions.configurationState === "INVALID") {
      throw new Error(`Mission Control submission authority requires a valid MISSION_CONTROL_ONLY provisioning registry: ${provisions.error}.`);
    }
    const chats = [...directory.entries, ...provisions.entries];
    if (chats.length === 0) {
      throw new Error("Mission Control submission authority requires at least one active or owner-authorized provisioning MISSION_CONTROL_ONLY registration.");
    }
    assertCombinedSupervisorRegistry(chats);
    const accountAliases = new Set(chats.map((chat) => chat.accountAlias));
    if (accountAliases.size !== 1) throw new Error("One pacing domain may contain exactly one provider account alias.");
    const minimumIntervalMs = boundedInteger(env.MISSION_CONTROL_MIN_SUBMISSION_INTERVAL_MS, 60_000, 60_000, 600_000);
    this.minimumIntervalMs = minimumIntervalMs;
    const admissionTtlMs = boundedInteger(env.MISSION_CONTROL_SUBMISSION_ADMISSION_TTL_MS, 120_000, 30_000, 600_000);
    const relayBindingsRaw = env.MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON;
    if (!relayBindingsRaw) throw new Error("Mission Control submission authority requires MISSION_CONTROL_SUBMISSION_RELAY_BINDINGS_JSON.");
    const relayBindings = parseSubmissionRelayBindings(JSON.parse(relayBindingsRaw));
    const relayAttestorsRaw = env.MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON;
    if (!relayAttestorsRaw) throw new Error("Mission Control submission authority requires MISSION_CONTROL_SUBMISSION_RELAY_ATTESTORS_JSON.");
    const relayAttestors = parseSubmissionRelayAttestors(JSON.parse(relayAttestorsRaw), Object.keys(relayBindings));
    assertAttestorsDistinctFromIngestBearers(relayAttestors, env.MISSION_CONTROL_INGEST_CREDENTIALS);
    const stateStore = new MissionControlSubmissionStateStore(store, domain, minimumIntervalMs, now);
    this.scheduler = new CentralSubmissionScheduler({
      stateStore,
      chats,
      producerBindings: relayBindings,
      producerAttestors: relayAttestors,
      pacingDomain: domain,
      minIntervalMs: minimumIntervalMs,
      admissionTtlMs,
      now,
    });
    this.enabled = true;
    this.pacingDomain = domain;
    this.chats = new Map(chats.map((chat) => [chat.supervisorId, chat]));
    this.relayBindings = new Map(Object.entries(relayBindings));
    const lease = parseDeploymentLease(JSON.parse(leaseRaw));
    this.initialization = this.scheduler.activateLease(lease).then(
      () => null,
      (error: unknown) => error,
    );
  }

  async status(producer: AuthenticatedProducer) {
    const scheduler = await this.requireScheduler();
    const relayBinding = await this.relayBindingFor(producer, scheduler);
    const status = await scheduler.status();
    return {
      ...status,
      authority: "MISSION_CONTROL_SINGLE_WRITER",
      pacingDomain: this.pacingDomain,
      ledger: this.store.verifySubmissionAuthorityLedger(this.pacingDomain!),
      authenticatedRelayBinding: publicRelayBinding(relayBinding),
    };
  }

  async ledger(producer: AuthenticatedProducer, limit = 200) {
    const scheduler = await this.requireScheduler();
    const relayBinding = await this.relayBindingFor(producer, scheduler);
    const records = this.store.submissionAuthorityLedger(this.pacingDomain!, limit);
    const boundaryRecords = this.store.submissionAuthorityBoundaryLedger(this.pacingDomain!);
    return {
      authority: "MISSION_CONTROL_SINGLE_WRITER",
      pacingDomain: this.pacingDomain,
      integrity: this.store.verifySubmissionAuthorityLedger(this.pacingDomain!),
      diagnostics: pacingDiagnostics(boundaryRecords, this.minimumIntervalMs!),
      authenticatedRelayBinding: publicRelayBinding(relayBinding),
      records,
    };
  }

  integrity() {
    return this.enabled && this.pacingDomain
      ? this.store.verifySubmissionAuthorityLedger(this.pacingDomain)
      : null;
  }

  async health() {
    if (!this.enabled) return { configured: false, schedulerState: "DISABLED", ledger: null };
    const scheduler = await this.requireScheduler();
    const status = await scheduler.status();
    return {
      configured: true,
      schedulerState: status.schedulerState,
      ledger: this.integrity(),
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
    if (operation === "relay-target-transitions/begin") return scheduler.beginRelayTargetTransition(body, producer.id);
    if (operation === "relay-target-transitions/commit") return scheduler.commitRelayTargetTransition(body, producer.id);
    if (operation === "relay-target-transitions/abort") return scheduler.abortRelayTargetTransition(body, producer.id);
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

  private async relayBindingFor(producer: AuthenticatedProducer, scheduler: any): Promise<Record<string, unknown>> {
    if (producer.kind !== "COLLECTOR" || !this.relayBindings.has(producer.id)) {
      const error = new Error("Submission-authority reads require an authenticated bound relay collector.");
      Object.assign(error, { statusCode: 403, code: "SUBMISSION_RELAY_READ_FORBIDDEN" });
      throw error;
    }
    return scheduler.producerBinding(producer.id);
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

function assertAttestorsDistinctFromIngestBearers(
  attestors: Record<string, string>,
  rawCredentials: string | undefined,
) {
  if (!rawCredentials) throw new Error("Mission Control submission authority requires relay ingest credentials.");
  const credentials = JSON.parse(rawCredentials) as Record<string, { token?: unknown }>;
  const identities: Array<{ label: string; value: string }> = [];
  for (const [producerId, attestor] of Object.entries(attestors)) {
    const bearer = credentials[producerId]?.token;
    if (typeof bearer !== "string" || bearer.length < 32) {
      throw new Error(`Submission relay ${producerId} requires its own ordinary ingest bearer.`);
    }
    identities.push(
      { label: `attestor:${producerId}`, value: attestor },
      { label: `bearer:${producerId}`, value: bearer },
    );
  }
  const seen = new Map<string, string>();
  for (const identity of identities) {
    const prior = seen.get(identity.value);
    if (prior) throw new Error(`Submission relay credentials must be pairwise distinct (${prior} conflicts with ${identity.label}).`);
    seen.set(identity.value, identity.label);
  }
}

function ledgerEntry(prior: SchedulerState | null, state: SchedulerState, minimumIntervalMs: number): Record<string, unknown> {
  const changedAdmission = findChangedRecord(state.admissions, prior?.admissions ?? [], "admissionId");
  const changedQueueItem = findChangedRecord(state.queueItems, prior?.queueItems ?? [], "queueItemId");
  const admission = changedAdmission ?? null;
  const changedRelayBinding = findChangedRelayBinding(state.relayBindings ?? {}, prior?.relayBindings ?? {});
  const relayBinding = changedRelayBinding?.binding ?? null;
  const queueItem = admission
    ? state.queueItems.find((item: SchedulerState) => item.queueItemId === admission.queueItemId) ?? changedQueueItem ?? null
    : changedQueueItem ?? null;
  const previousAdmission = prior?.admissions?.find((item: SchedulerState) => item.admissionId === admission?.admissionId) ?? null;
  const eventKind = deriveEventKind(prior, state, previousAdmission, admission, changedRelayBinding);
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
    producerId: admission?.producerId ?? changedRelayBinding?.producerId ?? state.relayTargetTransition?.producerId ?? prior?.relayTargetTransition?.producerId ?? null,
    hostAlias: admission?.hostAlias ?? relayBinding?.hostAlias ?? state.activeLease?.activeHostAlias ?? null,
    hostRole: admission?.hostRole ?? relayBinding?.hostRole ?? state.activeLease?.activeHostRole ?? null,
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
    automationWindowId: admission?.automationWindowId ?? queueItem?.request?.automationWindowId ?? relayBinding?.automationWindowId ?? null,
    relayBindingRevision: relayBinding?.bindingRevision ?? null,
    relayOwnedTargetCount: Array.isArray(relayBinding?.ownedTargetIds) ? relayBinding.ownedTargetIds.length : null,
    relayOwnedTargetIdsSha256: Array.isArray(relayBinding?.ownedTargetIds)
      ? createHash("sha256").update(JSON.stringify([...relayBinding.ownedTargetIds].sort())).digest("hex")
      : null,
    targetKind: admission?.targetKind ?? queueItem?.request?.targetKind ?? null,
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

function deriveEventKind(prior: SchedulerState | null, state: SchedulerState, previousAdmission: SchedulerState | null, admission: SchedulerState | null, changedRelayBinding: SchedulerState | null): string {
  if (!prior || state.leaseHistory.length > prior.leaseHistory.length) return "LEASE_ACTIVATED";
  if (!prior.relayTargetTransition && state.relayTargetTransition) return "RELAY_TARGET_TRANSITION_BEGUN";
  if (prior.relayTargetTransition && !state.relayTargetTransition) return changedRelayBinding ? "RELAY_TARGET_TRANSITION_COMMITTED" : "RELAY_TARGET_TRANSITION_ABORTED";
  if (state.queueItems.length > prior.queueItems.length) return "QUEUE_ITEM_DURABLY_ENQUEUED";
  if (state.admissions.length > prior.admissions.length) return "SINGLE_USE_ADMISSION_GRANTED";
  if (admission?.deliveryStatus !== previousAdmission?.deliveryStatus || admission?.recoveryStatus !== previousAdmission?.recoveryStatus) return "DELIVERY_OUTCOME_RECORDED";
  if (admission?.providerRateLimitObservedAt !== previousAdmission?.providerRateLimitObservedAt) return "PROVIDER_RATE_LIMIT_RECORDED";
  if (state.lastBoundaryAt !== prior.lastBoundaryAt) return "BOUNDARY_RECORDED";
  if (admission?.status !== previousAdmission?.status) return "ADMISSION_STATE_CHANGED";
  if (Object.keys(state.targetBindings).length > Object.keys(prior.targetBindings).length) return "TARGET_BOUND";
  return "STATE_COMMITTED";
}

function findChangedRelayBinding(
  current: Record<string, SchedulerState>,
  prior: Record<string, SchedulerState>,
): { producerId: string; binding: SchedulerState } | null {
  for (const producerId of Object.keys(current).sort()) {
    if (JSON.stringify(current[producerId]) !== JSON.stringify(prior[producerId])) {
      return { producerId, binding: current[producerId] };
    }
  }
  return null;
}

export function pacingDiagnostics(records: Array<Record<string, unknown>>, minimumIntervalMs: number) {
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
    configuredMinimumIntervalMs: minimumIntervalMs,
    violationsBelowConfiguredMinimum: intervals.filter((value) => value < minimumIntervalMs).length,
    violationsBelow60000Ms: intervals.filter((value) => value < 60_000).length,
  };
}

function publicRelayBinding(binding: Record<string, unknown>) {
  const ownedTargetIds = Array.isArray(binding.ownedTargetIds)
    ? binding.ownedTargetIds.filter((value): value is string => typeof value === "string").sort()
    : [];
  return {
    hostAlias: binding.hostAlias,
    hostRole: binding.hostRole,
    automationWindowId: binding.automationWindowId,
    bindingRevision: binding.bindingRevision,
    ownedTargetCount: ownedTargetIds.length,
    ownedTargetIdsSha256: createHash("sha256").update(JSON.stringify(ownedTargetIds)).digest("hex"),
  };
}

function assertCombinedSupervisorRegistry(
  chats: Array<ConfiguredSupervisorChat | ConfiguredSupervisorChatProvision>,
) {
  for (const [label, values] of [
    ["supervisor IDs", chats.map((chat) => chat.supervisorId)],
    ["registration IDs", chats.map((chat) => chat.registrationId)],
  ] as const) {
    if (new Set(values).size !== values.length) {
      throw new Error(`Active and provisioning ${label} must be unique across the combined registry.`);
    }
  }
  const projectManagers = chats.filter((chat) => chat.scope === "PROJECT_MANAGER");
  if (projectManagers.length > 1) {
    throw new Error("Only one overall Project Manager may exist across active and provisioning registrations.");
  }
  if (projectManagers.length === 1 && projectManagers[0].supervisorId !== CANONICAL_PROJECT_MANAGER_ID) {
    throw new Error(`Project Manager supervisorId must be ${CANONICAL_PROJECT_MANAGER_ID}.`);
  }
}
