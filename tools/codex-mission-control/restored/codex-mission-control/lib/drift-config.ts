import config from "@/config/drift-rules.json";

export interface DriftConfig {
  thresholds: { yellow: number; red: number };
  weights: {
    supervisorMisalignment: number;
    unexplainedPlanChange: number;
    outOfScopeTouch: number;
    testRegression: number;
    oversizedDiff: number;
    repeatedFailureLoop: number;
    materialAssumptionChange: number;
    staleCheckpoint: number;
  };
  limits: {
    largeDiffLines: number;
    repeatedFailureCount: number;
    staleCheckpointMinutes: number;
  };
  immediateEscalations: string[];
}

export const driftConfig = config satisfies DriftConfig;
