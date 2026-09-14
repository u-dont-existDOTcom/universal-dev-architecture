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
export const workProfileVerificationRequirementSchema = z.enum([
  "EXACT_PROFILE_REQUIRED",
  "SIMPLE_DETERMINISTIC_UNOBSERVABLE_ALLOWED",
]);

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
  fastMode: z.boolean(),
  verificationRequirement: workProfileVerificationRequirementSchema,
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
export type WorkProfileVerificationRequirement = z.infer<typeof workProfileVerificationRequirementSchema>;
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

export const workExecutionPreflightResultSchema = z.enum(["MATCH", "MISMATCH", "UNVERIFIABLE", "PARTIAL"]);
export type WorkExecutionPreflightResult = z.infer<typeof workExecutionPreflightResultSchema>;
export type WorkExecutionPreflightDecision =
  | "WORK_EXECUTION_PROFILE_MATCH"
  | "WORK_EXECUTION_PROFILE_MISMATCH"
  | "WORK_EXECUTION_PROFILE_UNVERIFIABLE"
  | "PROFILE_FIELD_UNOBSERVABLE_PROCEEDED_BY_POLICY";
export type WorkExecutionField = "model" | "effort" | "fastMode";
export type WorkExecutionFieldResult = "MATCH" | "MISMATCH" | "UNVERIFIED";

export interface WorkLaunchSelection {
  model: "gpt-5.6-sol" | "gpt-6-astra";
  thinking: "low" | "medium" | "high" | "xhigh" | "max";
  fastMode: boolean;
}

export interface WorkExecutionPreflight {
  allowed: boolean;
  result: WorkExecutionPreflightResult;
  decision: WorkExecutionPreflightDecision;
  fieldResults: Record<WorkExecutionField, WorkExecutionFieldResult>;
  reasonCodes: string[];
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
    fastMode: profile.fastMode,
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
    model: compareObservedField(authorizedProfile.model, observedProfile.model, capability.model,
      appliedSelection?.model ?? null, launchSelection.model),
    effort: compareObservedField(authorizedProfile.effort, observedProfile.effort, capability.effort,
      appliedSelection?.thinking ?? null, launchSelection.thinking),
    fastMode: compareObservedField(authorizedProfile.fastMode, observedProfile.fastMode, capability.fastMode,
      appliedSelection?.fastMode ?? null, launchSelection.fastMode),
  };
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
      requestedProfile,
      authorizedProfile,
      observedProfile,
      appliedSelection,
      capability,
      launchSelection,
    };
  }

  const unverified = Object.entries(fieldResults)
    .filter(([, result]) => result === "UNVERIFIED")
    .map(([field]) => `PROFILE_FIELD_UNVERIFIED_${field.toUpperCase()}`);
  if (unverified.length > 0 && authorizedProfile.verificationRequirement === "EXACT_PROFILE_REQUIRED") {
    return {
      allowed: false,
      result: "UNVERIFIABLE",
      decision: "WORK_EXECUTION_PROFILE_UNVERIFIABLE",
      fieldResults,
      reasonCodes: unverified,
      requestedProfile,
      authorizedProfile,
      observedProfile,
      appliedSelection,
      capability,
      launchSelection,
    };
  }
  if (unverified.length > 0) {
    return {
      allowed: true,
      result: "PARTIAL",
      decision: "PROFILE_FIELD_UNOBSERVABLE_PROCEEDED_BY_POLICY",
      fieldResults,
      reasonCodes: ["SIMPLE_DETERMINISTIC_UNOBSERVABLE_ALLOWED", ...unverified],
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
    result: "MATCH",
    decision: "WORK_EXECUTION_PROFILE_MATCH",
    fieldResults,
    reasonCodes: [],
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

function compareObservedField<T, U>(
  authorized: T,
  observed: T | null,
  capability: WorkProfileCapability,
  applied: U | null,
  requiredApplication: U,
): WorkExecutionFieldResult {
  if ((capability === "SET_AND_VERIFY" || capability === "SET_ONLY") && applied !== requiredApplication) return "MISMATCH";
  if (capability !== "SET_AND_VERIFY" && capability !== "VERIFY_ONLY") return "UNVERIFIED";
  if (observed === null) return "UNVERIFIED";
  return observed === authorized ? "MATCH" : "MISMATCH";
}

function mismatchedFieldCodes(results: WorkExecutionPreflight["fieldResults"]): string[] {
  return Object.entries(results)
    .filter(([, result]) => result === "MISMATCH")
    .map(([field]) => `PROFILE_FIELD_MISMATCH_${field.toUpperCase()}`);
}
