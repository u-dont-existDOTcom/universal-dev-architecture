import { z } from "zod";
import { canonicalJson } from "./canonical";

export const CLAUDE_EXECUTION_CONTRACT_VERSION = "CLAUDE_CODE_SUBSCRIPTION_V1" as const;

export const claudeExecutionProviderBindingSchema = z.object({
  provider: z.literal("ANTHROPIC"),
  surface: z.literal("CLAUDE_CODE_CLI"),
  role: z.literal("EXECUTION"),
}).strict();

export const claudeExecutionProfileSchema = z.object({
  model: z.string().trim().regex(/^claude-[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/),
  effort: z.enum(["LOW", "MEDIUM", "HIGH", "XHIGH", "MAX"]),
  billingRoute: z.literal("SUBSCRIPTION"),
  assuranceRequirement: z.enum(["SET_REQUEST_SUFFICIENT", "CLIENT_REPORTED_MODEL_REQUIRED"]),
  expensiveEffortApproved: z.boolean(),
  contractVersion: z.literal(CLAUDE_EXECUTION_CONTRACT_VERSION),
}).strict().superRefine((profile, context) => {
  if (["XHIGH", "MAX"].includes(profile.effort) && !profile.expensiveEffortApproved) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expensiveEffortApproved"],
      message: `${profile.effort} requires an explicit source-bound expensive-effort approval.`,
    });
  }
});

export type ClaudeExecutionProviderBinding = z.infer<typeof claudeExecutionProviderBindingSchema>;
export type ClaudeExecutionProfile = z.infer<typeof claudeExecutionProfileSchema>;

export interface ClaudeLaunchSelection {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
}

export function parseClaudeExecutionProfile(value: unknown): ClaudeExecutionProfile {
  return claudeExecutionProfileSchema.parse(value);
}

export function claudeExecutionProfilesEqual(left: ClaudeExecutionProfile, right: ClaudeExecutionProfile): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function claudeLaunchSelectionFor(profile: ClaudeExecutionProfile): ClaudeLaunchSelection {
  return { model: profile.model, effort: profile.effort.toLowerCase() as ClaudeLaunchSelection["effort"] };
}
