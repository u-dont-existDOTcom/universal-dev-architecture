import { z } from "zod";

export const WORK_MODEL_ROUTING_POLICY_REF = "patterns/work-model-and-effort-routing.md" as const;
export const WORK_MODEL_ROUTING_POLICY_COMMIT = "fc3d0d7592a4fa69e94ff8ae31d9a4e5433b73cb" as const;
export const LEGACY_MODEL_PROFILE_UNSPECIFIED = "LEGACY_MODEL_PROFILE_UNSPECIFIED" as const;

export const workModelSchema = z.enum(["GPT_5_6_SOL", "GPT_6_ASTRA"]);
export const workEffortSchema = z.enum(["LOW", "MEDIUM", "HIGH", "XHIGH", "MAX"]);
export const workRoutingTierSchema = z.enum([
  "SOL_LOW",
  "SOL_MEDIUM",
  "ASTRA_LOW",
  "ASTRA_MEDIUM",
  "ASTRA_HIGH",
  "ASTRA_XHIGH",
  "ASTRA_MAX",
  "SOL_HIGH_EXCEPTION",
]);
export const workProfileAssuranceRequirementSchema = z.enum([
  "SET_REQUEST_SUFFICIENT",
  "INDEPENDENT_READBACK_REQUIRED",
]);
export const workFastModeRequestSchema = z.enum(["DO_NOT_ENABLE_FAST", "ENABLE_FAST"]);

const expectedTierProfile = {
  SOL_LOW: ["GPT_5_6_SOL", "LOW"],
  SOL_MEDIUM: ["GPT_5_6_SOL", "MEDIUM"],
  SOL_HIGH_EXCEPTION: ["GPT_5_6_SOL", "HIGH"],
  ASTRA_LOW: ["GPT_6_ASTRA", "LOW"],
  ASTRA_MEDIUM: ["GPT_6_ASTRA", "MEDIUM"],
  ASTRA_HIGH: ["GPT_6_ASTRA", "HIGH"],
  ASTRA_XHIGH: ["GPT_6_ASTRA", "XHIGH"],
  ASTRA_MAX: ["GPT_6_ASTRA", "MAX"],
} as const;

export const workExecutionProfileSchema = z.object({
  model: workModelSchema,
  effort: workEffortSchema,
  routingTier: workRoutingTierSchema,
  routingTriggers: z.array(z.string().trim().min(1).max(120).regex(/^[A-Z0-9][A-Z0-9_:.\/-]*$/)).max(20),
  fastModeRequest: workFastModeRequestSchema,
  assuranceRequirement: workProfileAssuranceRequirementSchema,
  policyRef: z.literal(WORK_MODEL_ROUTING_POLICY_REF),
  policyCommit: z.literal(WORK_MODEL_ROUTING_POLICY_COMMIT),
}).strict().superRefine((profile, context) => {
  const [model, effort] = expectedTierProfile[profile.routingTier];
  if (profile.model !== model) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: `${profile.routingTier} requires model ${model}.`,
    });
  }
  if (profile.effort !== effort) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effort"],
      message: `${profile.routingTier} requires effort ${effort}.`,
    });
  }
  if ((profile.routingTier.startsWith("ASTRA_") || profile.routingTier === "SOL_HIGH_EXCEPTION")
    && profile.routingTriggers.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["routingTriggers"],
      message: `${profile.routingTier} requires at least one source-bound routing trigger.`,
    });
  }
});

export type WorkModel = z.infer<typeof workModelSchema>;
export type WorkEffort = z.infer<typeof workEffortSchema>;
export type WorkRoutingTier = z.infer<typeof workRoutingTierSchema>;
export type WorkProfileAssuranceRequirement = z.infer<typeof workProfileAssuranceRequirementSchema>;
export type WorkFastModeRequest = z.infer<typeof workFastModeRequestSchema>;
export type WorkExecutionProfile = z.infer<typeof workExecutionProfileSchema>;
export type LegacyWorkExecutionProfile = typeof LEGACY_MODEL_PROFILE_UNSPECIFIED;
export type AuthorizedWorkExecutionProfile = WorkExecutionProfile | LegacyWorkExecutionProfile;

export const workProfileCapabilitySchema = z.enum([
  "SET_AND_VERIFY",
  "SET_ONLY",
  "VERIFY_ONLY",
  "UNOBSERVABLE",
]);
export type WorkProfileCapability = z.infer<typeof workProfileCapabilitySchema>;

export const workExecutionCapabilityMatrixSchema = z.object({
  surfaceId: z.string().trim().min(1).max(180),
  interface: z.enum(["STRUCTURED_API", "UI_BROWSER", "MIXED", "UNAVAILABLE"]),
  model: workProfileCapabilitySchema,
  effort: workProfileCapabilitySchema,
  fastMode: workProfileCapabilitySchema,
}).strict();
export type WorkExecutionCapabilityMatrix = z.infer<typeof workExecutionCapabilityMatrixSchema>;

/**
 * Current Codex desktop task-creation capability, verified without launching a
 * model task on 2026-09-14. create_thread accepts model/thinking setters;
 * list_threads/read_thread expose no independent effective model, thinking, or
 * Fast-mode readback, and create_thread exposes no Fast-mode setter.
 */
export const CURRENT_WORK_EXECUTION_CAPABILITY: WorkExecutionCapabilityMatrix = {
  surfaceId: "CODEX_DESKTOP_TASK_CREATION_API_2026_09_14",
  interface: "STRUCTURED_API",
  model: "SET_ONLY",
  effort: "SET_ONLY",
  fastMode: "UNOBSERVABLE",
};

export const observedWorkExecutionProfileSchema = z.object({
  model: workModelSchema.nullable(),
  effort: workEffortSchema.nullable(),
  fastMode: z.boolean().nullable(),
}).strict();
export type ObservedWorkExecutionProfile = z.infer<typeof observedWorkExecutionProfileSchema>;

export const workExecutionPreflightResultSchema = z.enum([
  "SET_AND_VERIFIED",
  "SET_REQUEST_ACCEPTED_UNVERIFIED",
  "MISMATCH",
  "UNVERIFIABLE",
]);
export type WorkExecutionPreflightResult = z.infer<typeof workExecutionPreflightResultSchema>;
export type WorkExecutionPreflightDecision =
  | "WORK_EXECUTION_PROFILE_SET_AND_VERIFIED"
  | "WORK_EXECUTION_SET_REQUEST_ACCEPTED_UNVERIFIED"
  | "WORK_EXECUTION_PROFILE_MISMATCH"
  | "WORK_EXECUTION_PROFILE_UNVERIFIABLE";
export type WorkExecutionField = "model" | "effort" | "fastMode";
export type WorkExecutionFieldResult =
  | "SET_AND_VERIFIED"
  | "SET_REQUEST_ONLY"
  | "INDEPENDENTLY_VERIFIED"
  | "NOT_REQUESTED_UNVERIFIED"
  | "MISMATCH"
  | "UNVERIFIED";
export const workModelIdentityEvidenceSchema = z.enum([
  "SET_AND_VERIFIED",
  "SET_REQUEST_ONLY",
  "INDEPENDENTLY_VERIFIED",
  "UNVERIFIED",
]);
export type WorkModelIdentityEvidence = z.infer<typeof workModelIdentityEvidenceSchema>;

export interface WorkLaunchSelection {
  model: "gpt-5.6-sol" | "gpt-6-astra";
  thinking: "low" | "medium" | "high" | "xhigh" | "max";
  fastModeRequest: WorkFastModeRequest;
}

export interface WorkExecutionPreflight {
  allowed: boolean;
  result: WorkExecutionPreflightResult;
  decision: WorkExecutionPreflightDecision;
  fieldResults: Record<WorkExecutionField, WorkExecutionFieldResult>;
  reasonCodes: string[];
  modelIdentityEvidence: WorkModelIdentityEvidence;
  requestedProfile: WorkExecutionProfile;
  authorizedProfile: WorkExecutionProfile;
  observedProfile: ObservedWorkExecutionProfile;
  appliedSelection: WorkLaunchSelection | null;
  capability: WorkExecutionCapabilityMatrix;
  launchSelection: WorkLaunchSelection;
}

export function parseWorkExecutionProfile(value: unknown): WorkExecutionProfile {
  return workExecutionProfileSchema.parse(value);
}

export function isWorkExecutionProfile(value: unknown): value is WorkExecutionProfile {
  return workExecutionProfileSchema.safeParse(value).success;
}

export function workExecutionProfilesEqual(left: WorkExecutionProfile, right: WorkExecutionProfile): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function launchSelectionFor(profile: WorkExecutionProfile): WorkLaunchSelection {
  return {
    model: profile.model === "GPT_5_6_SOL" ? "gpt-5.6-sol" : "gpt-6-astra",
    thinking: profile.effort.toLowerCase() as WorkLaunchSelection["thinking"],
    fastModeRequest: profile.fastModeRequest,
  };
}

export function evaluateWorkExecutionPreflight(input: {
  requestedProfile: WorkExecutionProfile;
  authorizedProfile: WorkExecutionProfile;
  observedProfile: ObservedWorkExecutionProfile;
  appliedSelection: WorkLaunchSelection | null;
  capability: WorkExecutionCapabilityMatrix;
}): WorkExecutionPreflight {
  const { requestedProfile, authorizedProfile, observedProfile, appliedSelection, capability } = input;
  const launchSelection = launchSelectionFor(authorizedProfile);
  const fieldResults: WorkExecutionPreflight["fieldResults"] = {
    model: compareModelOrEffortField(authorizedProfile.model, observedProfile.model, capability.model,
      appliedSelection?.model ?? null, launchSelection.model),
    effort: compareModelOrEffortField(authorizedProfile.effort, observedProfile.effort, capability.effort,
      appliedSelection?.thinking ?? null, launchSelection.thinking),
    fastMode: compareFastModeField(authorizedProfile.fastModeRequest, observedProfile.fastMode, capability.fastMode,
      appliedSelection?.fastModeRequest ?? null),
  };
  const modelIdentityEvidence = identityEvidenceFor(fieldResults.model, fieldResults.effort);
  const rewritten = !workExecutionProfilesEqual(requestedProfile, authorizedProfile);
  if (rewritten || Object.values(fieldResults).includes("MISMATCH")) {
    return {
      allowed: false,
      result: "MISMATCH",
      decision: "WORK_EXECUTION_PROFILE_MISMATCH",
      fieldResults,
      reasonCodes: [
        ...(rewritten ? ["REQUESTED_PROFILE_DIFFERS_FROM_SOURCE_BOUND_AUTHORIZATION"] : []),
        ...mismatchedFieldCodes(fieldResults),
      ],
      modelIdentityEvidence,
      requestedProfile,
      authorizedProfile,
      observedProfile,
      appliedSelection,
      capability,
      launchSelection,
    };
  }

  const unverified = Object.entries(fieldResults)
    .filter(([, result]) => ["UNVERIFIED", "SET_REQUEST_ONLY", "NOT_REQUESTED_UNVERIFIED"].includes(result))
    .map(([field]) => `PROFILE_FIELD_UNVERIFIED_${field.toUpperCase()}`);
  const fastRequestUnavailable = authorizedProfile.fastModeRequest === "ENABLE_FAST"
    && capability.fastMode === "UNOBSERVABLE";
  const independentIdentityMissing = authorizedProfile.assuranceRequirement === "INDEPENDENT_READBACK_REQUIRED"
    && !["SET_AND_VERIFIED", "INDEPENDENTLY_VERIFIED"].includes(modelIdentityEvidence);
  if (fastRequestUnavailable || independentIdentityMissing) {
    return {
      allowed: false,
      result: "UNVERIFIABLE",
      decision: "WORK_EXECUTION_PROFILE_UNVERIFIABLE",
      fieldResults,
      reasonCodes: [
        ...(fastRequestUnavailable ? ["FAST_MODE_CONTROL_UNAVAILABLE"] : []),
        ...(independentIdentityMissing ? ["INDEPENDENT_MODEL_EFFORT_READBACK_REQUIRED"] : []),
        ...unverified,
      ],
      modelIdentityEvidence,
      requestedProfile,
      authorizedProfile,
      observedProfile,
      appliedSelection,
      capability,
      launchSelection,
    };
  }
  if (modelIdentityEvidence === "SET_REQUEST_ONLY" || unverified.length > 0) {
    return {
      allowed: true,
      result: "SET_REQUEST_ACCEPTED_UNVERIFIED",
      decision: "WORK_EXECUTION_SET_REQUEST_ACCEPTED_UNVERIFIED",
      fieldResults,
      reasonCodes: ["PROVIDER_MODEL_IDENTITY_NOT_INDEPENDENTLY_VERIFIED", ...unverified],
      modelIdentityEvidence,
      requestedProfile,
      authorizedProfile,
      observedProfile,
      appliedSelection,
      capability,
      launchSelection,
    };
  }
  return {
    allowed: true,
    result: "SET_AND_VERIFIED",
    decision: "WORK_EXECUTION_PROFILE_SET_AND_VERIFIED",
    fieldResults,
    reasonCodes: [],
    modelIdentityEvidence,
    requestedProfile,
    authorizedProfile,
    observedProfile,
    appliedSelection,
    capability,
    launchSelection,
  };
}

export const workExecutionFailureClassificationSchema = z.enum([
  "CHAT_PLAN_DEFECT",
  "ACCESS_CONTEXT_DEFECT",
  "EXECUTION_REASONING_SHORTFALL",
  "MECHANICAL_EXECUTION_FAILURE",
  "NOT_APPLICABLE",
]);
export type WorkExecutionFailureClassification = z.infer<typeof workExecutionFailureClassificationSchema>;

export function failureMayAuthorizeProfileEscalation(value: WorkExecutionFailureClassification): boolean {
  return value === "EXECUTION_REASONING_SHORTFALL";
}

function compareModelOrEffortField<T, U>(
  authorized: T,
  observed: T | null,
  capability: WorkProfileCapability,
  applied: U | null,
  requiredApplication: U,
): WorkExecutionFieldResult {
  if (observed !== null && observed !== authorized) return "MISMATCH";
  if ((capability === "SET_AND_VERIFY" || capability === "SET_ONLY") && applied !== requiredApplication) return "MISMATCH";
  if (capability === "SET_AND_VERIFY") return observed === null ? "UNVERIFIED" : "SET_AND_VERIFIED";
  if (capability === "SET_ONLY") return "SET_REQUEST_ONLY";
  if (capability === "VERIFY_ONLY") return observed === null ? "UNVERIFIED" : "INDEPENDENTLY_VERIFIED";
  return "UNVERIFIED";
}

function compareFastModeField(
  requested: WorkFastModeRequest,
  observed: boolean | null,
  capability: WorkProfileCapability,
  applied: WorkFastModeRequest | null,
): WorkExecutionFieldResult {
  const requestedValue = requested === "ENABLE_FAST";
  if (observed !== null && observed !== requestedValue) return "MISMATCH";
  if (capability === "UNOBSERVABLE") {
    return requested === "DO_NOT_ENABLE_FAST" && applied === "DO_NOT_ENABLE_FAST"
      ? "NOT_REQUESTED_UNVERIFIED"
      : "UNVERIFIED";
  }
  if ((capability === "SET_AND_VERIFY" || capability === "SET_ONLY") && applied !== requested) return "MISMATCH";
  if (capability === "SET_AND_VERIFY") return observed === null ? "UNVERIFIED" : "SET_AND_VERIFIED";
  if (capability === "SET_ONLY") return "SET_REQUEST_ONLY";
  return observed === null ? "UNVERIFIED" : "INDEPENDENTLY_VERIFIED";
}

function identityEvidenceFor(
  model: WorkExecutionFieldResult,
  effort: WorkExecutionFieldResult,
): WorkModelIdentityEvidence {
  if (model === "SET_AND_VERIFIED" && effort === "SET_AND_VERIFIED") return "SET_AND_VERIFIED";
  if (model === "SET_REQUEST_ONLY" && effort === "SET_REQUEST_ONLY") return "SET_REQUEST_ONLY";
  if (model === "INDEPENDENTLY_VERIFIED" && effort === "INDEPENDENTLY_VERIFIED") return "INDEPENDENTLY_VERIFIED";
  return "UNVERIFIED";
}

function mismatchedFieldCodes(results: WorkExecutionPreflight["fieldResults"]): string[] {
  return Object.entries(results)
    .filter(([, result]) => result === "MISMATCH")
    .map(([field]) => `PROFILE_FIELD_MISMATCH_${field.toUpperCase()}`);
}
