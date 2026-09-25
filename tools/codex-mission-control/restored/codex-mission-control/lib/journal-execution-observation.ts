import { z } from "zod";

// This is factual control metadata, never journal content or a supervision verdict.
const rawState = z.object({
  stage: z.string().regex(/^[A-Z_]{1,80}$/),
  blocker: z.string().nullable(),
  completed_units: z.union([z.array(z.unknown()), z.number().int().nonnegative()]),
  completed_visual_pages: z.union([z.array(z.unknown()), z.number().int().nonnegative()]),
  total_units: z.number().int().nonnegative(),
  completion: z.object({ profile_committed: z.string() }),
});
const knownCodes = new Set(["COMPLETION_UNKNOWN", "INVALID_STRUCTURED_OUTPUT",
  "PRIVATE_INFERENCE_ISOLATION_UNAVAILABLE", "INFERENCE_NOT_SUBMITTED", "WORK_RETRY_LIMIT_EXCEEDED",
  "REFERENCE_SOURCE_BINDING_INVALID", "PRIVATE_INFERENCE_TOOL_USE_OBSERVED", "QUOTA_EXHAUSTED"]);
export function journalExecutionObservation(value: unknown) {
  const state = rawState.parse(value);
  const count = (value: unknown[] | number) => Array.isArray(value) ? value.length : value;
  const blocked = Boolean(state.blocker);
  return {
    phase: blocked ? "BLOCKED" as const : "IMPLEMENTING" as const,
    blockerCode: blocked ? knownCodes.has(state.blocker!) ? state.blocker! : "RUNTIME_BLOCKED" : null,
    summary: "JOURNAL_EXECUTION_OBSERVATION_V1\n" + JSON.stringify({
      stage: state.stage, blocked, completed_units: count(state.completed_units),
      completed_visual_pages: count(state.completed_visual_pages), total_units: state.total_units,
      profile_commit_claim: state.completion.profile_committed === "pass", semantic_authority: false,
    }),
  };
}
