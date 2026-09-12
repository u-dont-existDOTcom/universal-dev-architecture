export class SubmissionSchedulerError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly detail: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode?: number,
    detail?: Record<string, unknown>,
  );
}

export class CentralSubmissionScheduler {
  constructor(options: {
    stateStore: {
      read(): Promise<unknown>;
      write(value: unknown): Promise<unknown>;
    };
    chats: unknown[];
    producerBindings: unknown;
    producerAttestors: unknown;
    pacingDomain: string;
    minIntervalMs?: number;
    admissionTtlMs?: number;
    now?: () => number;
  });

  activateLease(lease: unknown): Promise<unknown>;
  status(): Promise<Record<string, unknown>>;
  producerBinding(producerId: string): Promise<Record<string, unknown>>;
  beginRelayTargetTransition(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  commitRelayTargetTransition(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  abortRelayTargetTransition(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  validateAdmission(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  admit(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  recordBoundary(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  bindTarget(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  recordRateLimit(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  abortBeforeBoundary(input: unknown, producerId: string): Promise<Record<string, unknown>>;
  recordOutcome(input: unknown, producerId: string): Promise<Record<string, unknown>>;
}

export const MINIMUM_GLOBAL_SUBMISSION_INTERVAL_MS: number;
export function parseDeploymentLease(value: unknown): Record<string, unknown>;
export function parseSubmissionRelayBindings(value: unknown): Record<string, Record<string, unknown>>;
export function parseSubmissionRelayAttestors(value: unknown, producerIds: string[]): Record<string, string>;
export function defaultSchedulerState(now?: string): Record<string, unknown>;
export function normalizeSchedulerState(value: unknown, now?: string): Record<string, unknown>;
