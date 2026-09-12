import type { ConfiguredSupervisorChat } from "./configured-supervisor-chats";

type SchedulerState = Record<string, unknown>;

interface SchedulerStateStore {
  read(): Promise<SchedulerState>;
  write(value: unknown): Promise<SchedulerState>;
}

interface CentralSubmissionSchedulerOptions {
  stateStore: SchedulerStateStore;
  chats: readonly ConfiguredSupervisorChat[];
  minIntervalMs?: number;
  admissionTtlMs?: number;
  now?: () => number;
}

export class SubmissionSchedulerError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly detail: Record<string, unknown>;

  constructor(code: string, message: string, statusCode?: number, detail?: Record<string, unknown>);
}

export class CentralSubmissionScheduler {
  constructor(options: CentralSubmissionSchedulerOptions);

  activateLease(rawLease: unknown): Promise<unknown>;
  status(): Promise<Record<string, unknown>>;
  validateAdmission(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
  admit(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
  recordBoundary(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
  bindTarget(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
  recordRateLimit(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
  abortBeforeBoundary(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
  recordOutcome(raw: unknown, producerId: string): Promise<Record<string, unknown>>;
}

export function defaultSchedulerState(now?: string): SchedulerState;
export function normalizeSchedulerState(value: unknown, now?: string): SchedulerState;
export function parseDeploymentLease(value: unknown): unknown;
