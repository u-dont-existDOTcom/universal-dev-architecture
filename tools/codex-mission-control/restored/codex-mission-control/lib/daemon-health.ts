import type { FleetSupervisorLoopStatus } from "./fleet-supervisor-loop";

interface HealthStore {
  latestSequence(): number;
  verifyChain(): unknown;
}

interface SubmissionAuthorityHealth {
  health(): Promise<{
    configured: boolean;
    schedulerState: string;
    ledger: unknown;
  }>;
}

export function daemonLiveness() {
  return {
    status: "ok" as const,
    kind: "liveness" as const,
  };
}

export async function daemonReadiness(store: HealthStore, submissionAuthority: SubmissionAuthorityHealth, fleetSupervisorLoop?: FleetSupervisorLoopStatus) {
  const authorityHealth = await submissionAuthority.health();
  return {
    status: "ok" as const,
    kind: "readiness" as const,
    latestSequence: store.latestSequence(),
    chain: store.verifyChain(),
    submissionAuthorityConfigured: authorityHealth.configured,
    submissionAuthoritySchedulerState: authorityHealth.schedulerState,
    submissionAuthorityLedger: authorityHealth.ledger,
    fleetSupervisorLoop: fleetSupervisorLoop ?? null,
  };
}
