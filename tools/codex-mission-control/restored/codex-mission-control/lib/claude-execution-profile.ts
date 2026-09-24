import { z } from "zod";
import { canonicalJson } from "./canonical";

export const CLAUDE_EXECUTION_PROVIDER = "ANTHROPIC" as const;
export const CLAUDE_EXECUTION_SURFACE = "CLAUDE_CODE_CLI" as const;
export const CLAUDE_EXECUTION_ROLE = "EXECUTION" as const;

export const claudeExecutionProfileSchema = z.object({
  provider: z.literal(CLAUDE_EXECUTION_PROVIDER),
  surface: z.literal(CLAUDE_EXECUTION_SURFACE),
  role: z.literal(CLAUDE_EXECUTION_ROLE),
  model: z.string().trim().min(1).max(110)
    .regex(/^claude-[A-Za-z0-9][A-Za-z0-9._-]*$/),
  effort: z.enum(["LOW", "MEDIUM", "HIGH", "XHIGH", "MAX"]),
  billing: z.literal("SUBSCRIPTION"),
  assuranceRequirement: z.enum([
    "SET_REQUEST_SUFFICIENT",
    "CLIENT_REPORTED_MODEL_REQUIRED",
  ]),
  expensiveEffortApproved: z.boolean(),
  contractVersion: z.literal("TRUSTED_CLAUDE_CODE_V1"),
}).strict().superRefine((profile, context) => {
  const expensive = profile.effort === "XHIGH" || profile.effort === "MAX";
  if (expensive !== profile.expensiveEffortApproved) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expensiveEffortApproved"],
      message: expensive
        ? "XHIGH/MAX Claude effort requires explicit source-bound approval."
        : "Ordinary Claude effort must not carry an expensive-effort approval flag.",
    });
  }
});

export type ClaudeExecutionProfile = z.infer<typeof claudeExecutionProfileSchema>;

export function parseClaudeExecutionProfile(value: unknown): ClaudeExecutionProfile {
  return claudeExecutionProfileSchema.parse(value);
}

export function claudeExecutionProfilesEqual(
  left: ClaudeExecutionProfile,
  right: ClaudeExecutionProfile,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function launchSelectionForClaude(profile: ClaudeExecutionProfile): {
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
} {
  return {
    model: profile.model,
    effort: profile.effort.toLowerCase() as "low" | "medium" | "high" | "xhigh" | "max",
  };
}
