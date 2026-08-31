import { z } from "zod";
import { canonicalJson, sha256 } from "./canonical";
import type { MissionControlEventV2 } from "./schema";

export const SYMPHONY_UPSTREAM_COMMIT = "8001b52e3062495a16e520e4ceaf8f9de868c4d0";

const tokensSchema = z.object({
  input_tokens: z.number().nonnegative(),
  output_tokens: z.number().nonnegative(),
  total_tokens: z.number().nonnegative(),
}).passthrough();

const commonIssue = {
  issue_id: z.string().min(1),
  issue_identifier: z.string().min(1),
  issue_url: z.string().url().nullable(),
  worker_host: z.string().nullable(),
  workspace_path: z.string().nullable(),
};

const runningSchema = z.object({
  ...commonIssue,
  state: z.string(),
  session_id: z.string().nullable(),
  turn_count: z.number().int().nonnegative(),
  last_event: z.string().nullable(),
  last_message: z.string().nullable(),
  started_at: z.string().datetime({ offset: true }).nullable(),
  last_event_at: z.string().datetime({ offset: true }).nullable(),
  tokens: tokensSchema,
}).passthrough();

const retryingSchema = z.object({
  ...commonIssue,
  attempt: z.number().int().positive(),
  due_at: z.string().datetime({ offset: true }).nullable(),
  error: z.string().nullable(),
}).passthrough();

const blockedSchema = z.object({
  ...commonIssue,
  state: z.string().nullable(),
  error: z.string().nullable(),
  session_id: z.string().nullable(),
  blocked_at: z.string().datetime({ offset: true }).nullable(),
  last_event: z.string().nullable(),
  last_message: z.string().nullable(),
  last_event_at: z.string().datetime({ offset: true }).nullable(),
}).passthrough();

export const symphonyStateSchema = z.object({
  generated_at: z.string().datetime({ offset: true }),
  counts: z.object({
    running: z.number().int().nonnegative(),
    retrying: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  }),
  running: z.array(runningSchema),
  retrying: z.array(retryingSchema),
  blocked: z.array(blockedSchema),
  codex_totals: z.object({
    input_tokens: z.number().nonnegative(), output_tokens: z.number().nonnegative(),
    total_tokens: z.number().nonnegative(), seconds_running: z.number().nonnegative(),
  }).passthrough(),
  rate_limits: z.unknown().nullable(),
}).passthrough();

export type SymphonyStateV1 = z.infer<typeof symphonyStateSchema>;

export interface SymphonyAdapterResult {
  observations: Array<Extract<MissionControlEventV2, { type: "symphony_runtime_observed" }>>;
  diagnostics: string[];
  payloadSha256: string;
}

export function adaptSymphonyState(
  input: unknown,
  receivedAt: string,
  workerForIssue: (issueIdentifier: string) => string,
): SymphonyAdapterResult {
  const state = symphonyStateSchema.parse(input);
  const payloadSha256 = sha256(canonicalJson(input));
  const source = {
    system: "openai/symphony" as const,
    endpoint: "/api/v1/state" as const,
    upstream_commit: SYMPHONY_UPSTREAM_COMMIT,
    generated_at: state.generated_at,
    received_at: receivedAt,
    payload_sha256: payloadSha256,
  };
  const diagnostics: string[] = [];
  for (const kind of ["running", "retrying", "blocked"] as const) {
    if (state.counts[kind] !== state[kind].length) {
      diagnostics.push(`SYMPHONY_COUNT_MISMATCH:${kind}:declared=${state.counts[kind]}:observed=${state[kind].length}`);
    }
  }
  const observations: SymphonyAdapterResult["observations"] = [];
  for (const payload of state.running) observations.push({
    type: "symphony_runtime_observed",
    worker: workerForIssue(payload.issue_identifier),
    source,
    kind: "running",
    issue_id: payload.issue_id,
    issue_identifier: payload.issue_identifier,
    tracker_state: payload.state,
    payload,
  });
  for (const payload of state.retrying) observations.push({
    type: "symphony_runtime_observed",
    worker: workerForIssue(payload.issue_identifier),
    source,
    kind: "retrying",
    issue_id: payload.issue_id,
    issue_identifier: payload.issue_identifier,
    tracker_state: null,
    payload,
  });
  for (const payload of state.blocked) observations.push({
    type: "symphony_runtime_observed",
    worker: workerForIssue(payload.issue_identifier),
    source,
    kind: "blocked",
    issue_id: payload.issue_id,
    issue_identifier: payload.issue_identifier,
    tracker_state: payload.state,
    payload,
  });
  return { observations, diagnostics, payloadSha256 };
}
