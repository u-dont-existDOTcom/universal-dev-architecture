export type LiveHealthState = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
export type ProviderRelayState = LiveHealthState;

export interface OperatorHostStatus {
  label: string;
  role: "PRIMARY" | "SECONDARY";
  active: boolean;
  reportFresh: boolean;
  relayWorkerState: LiveHealthState;
  browserState: LiveHealthState;
  authorityBindingState: "BOUND" | "MISMATCH" | "UNAVAILABLE";
  ownedTargetCount: number;
  observedAt: string | null;
  detail: string;
}

export interface OperatorSupervisorStatus {
  supervisorId: string;
  registrationState: "ACTIVE" | "PROVISIONING";
  scope: "PROJECT_MANAGER" | "SPECIALIST";
  registered: boolean;
  reachable: boolean;
  sourceBound: boolean;
  latestRouteState: string;
  latestReasoningAt: string | null;
  verifiedReasoningMessages: number;
}

export interface OperatorStatusProjection {
  checkedAt: string;
  overallState: LiveHealthState;
  providerRelayState: ProviderRelayState;
  activeHostLabel: string | null;
  authority: {
    state: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
    writer: "MISSION_CONTROL_SINGLE_WRITER";
    schedulerState: string;
    activeLeaseRole: "PRIMARY" | "SECONDARY" | null;
    epoch: number | null;
    queueDepth: number;
    ledgerIntegrity: "VALID" | "INVALID" | "UNAVAILABLE";
  };
  pacing: {
    lastProviderSendBoundaryAt: string | null;
    configuredMinimumIntervalMs: number | null;
    minimumObservedIntervalMs: number | null;
    recentIntervalsMs: number[];
    violationsBelowConfiguredMinimum: number | null;
    rateLimitState: string;
    cooldownRemainingMs: number | null;
  };
  hosts: OperatorHostStatus[];
  supervisors: OperatorSupervisorStatus[];
}

export interface RelayHealthReport {
  schemaVersion: 1;
  hostAlias: string;
  hostRole: "PRIMARY" | "SECONDARY";
  deploymentEpoch: number;
  observedAt: string;
  relayWorkerState: LiveHealthState;
  browserState: LiveHealthState;
  authorityBindingState: "BOUND" | "MISMATCH" | "UNAVAILABLE";
  detail: string;
}
