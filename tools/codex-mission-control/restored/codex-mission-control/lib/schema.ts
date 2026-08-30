import { z } from "zod";

const WorkerId = z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/);
const NonEmpty = z.string().trim().min(1);
const Url = z.string().url().refine((value) => value.startsWith("https://"), {
  message: "Supervisor chat links must use HTTPS",
});

export const objectiveCreatedSchema = z.object({
  type: z.literal("objective_created"),
  worker: WorkerId,
  worker_name: NonEmpty,
  goal: NonEmpty,
  acceptance_criteria: z.array(NonEmpty).min(1),
  allowed_scope: z.array(NonEmpty).min(1),
  forbidden_scope: z.array(NonEmpty).default([]),
  expected_max_diff_lines: z.number().int().positive().optional(),
  supervisor_chat_url: Url,
  supervisor_chat_label: NonEmpty.default("Open Pro supervisor chat"),
});

export const workerHeartbeatSchema = z.object({
  type: z.literal("worker_heartbeat"),
  worker: WorkerId,
  objective: NonEmpty.optional(),
  status: z.enum(["working", "blocked", "done"]).default("working"),
  current_step: NonEmpty,
  completed_steps: z.array(NonEmpty).default([]),
  next_steps: z.array(NonEmpty).max(3).default([]),
  files_touched: z.array(NonEmpty).default([]),
  tests: z.object({
    passing: z.number().int().nonnegative(),
    failing: z.number().int().nonnegative(),
    lint: z.enum(["passing", "failing", "not_run"]).default("not_run"),
    build: z.enum(["passing", "failing", "not_run"]).default("not_run"),
  }),
  plan_changed: z.boolean().default(false),
  plan_change_reason: z.string().nullable().default(null),
  blocker: z.string().nullable().default(null),
  assumptions: z.array(NonEmpty).default([]),
  assumptions_materially_changed: z.boolean().default(false),
  diff_lines: z.number().int().nonnegative().default(0),
  repeated_failure_count: z.number().int().nonnegative().default(0),
  architecture_rewrite: z.boolean().default(false),
  architecture_rewrite_explained: z.boolean().default(false),
  destructive_action: z.boolean().default(false),
  touched_other_worker_area: z.boolean().default(false),
  major_contract_violation: z.boolean().default(false),
});

export const planChangedSchema = z.object({
  type: z.literal("plan_changed"),
  worker: WorkerId,
  previous_plan: z.array(NonEmpty),
  new_plan: z.array(NonEmpty),
  reason: z.string().nullable(),
});

export const commandRunSchema = z.object({
  type: z.literal("command_run"),
  worker: WorkerId,
  command: NonEmpty,
  exit_code: z.number().int().nullable(),
  summary: z.string().default(""),
});

export const filesChangedSchema = z.object({
  type: z.literal("files_changed"),
  worker: WorkerId,
  files: z.array(NonEmpty).min(1),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  destructive_action: z.boolean().default(false),
  touched_other_worker_area: z.boolean().default(false),
});

export const testsRunSchema = z.object({
  type: z.literal("tests_run"),
  worker: WorkerId,
  command: NonEmpty,
  passing: z.number().int().nonnegative(),
  failing: z.number().int().nonnegative(),
  previously_passing_regressed: z.boolean().default(false),
});

export const commitCreatedSchema = z.object({
  type: z.literal("commit_created"),
  worker: WorkerId,
  sha: NonEmpty,
  message: NonEmpty,
});

export const blockerReportedSchema = z.object({
  type: z.literal("blocker_reported"),
  worker: WorkerId,
  blocker: NonEmpty,
  legitimate_dependency: z.boolean().default(false),
});

export const supervisorVerdictSchema = z.object({
  type: z.literal("supervisor_verdict"),
  worker: WorkerId,
  verdict: z.enum(["ON_TRACK", "WATCH", "REDIRECT"]),
  alignment: z.number().min(0).max(1),
  reason: NonEmpty,
  corrective_action: z.string().nullable().default(null),
  review_after: NonEmpty,
  work_no_longer_serves_objective: z.boolean().default(false),
});

export const redirectIssuedSchema = z.object({
  type: z.literal("redirect_issued"),
  worker: WorkerId,
  reason: NonEmpty,
  corrective_action: NonEmpty,
});

export const taskCompletedSchema = z.object({
  type: z.literal("task_completed"),
  worker: WorkerId,
  summary: NonEmpty,
});

export const supervisorChatLinkSetSchema = z.object({
  type: z.literal("supervisor_chat_link_set"),
  worker: WorkerId,
  supervisor_chat_url: Url,
  supervisor_chat_label: NonEmpty.default("Open Pro supervisor chat"),
  reason: NonEmpty,
});

export const eventSchema = z.discriminatedUnion("type", [
  objectiveCreatedSchema,
  workerHeartbeatSchema,
  planChangedSchema,
  commandRunSchema,
  filesChangedSchema,
  testsRunSchema,
  commitCreatedSchema,
  blockerReportedSchema,
  supervisorVerdictSchema,
  redirectIssuedSchema,
  taskCompletedSchema,
  supervisorChatLinkSetSchema,
]);

export type MissionControlEvent = z.infer<typeof eventSchema>;
export type ObjectiveCreatedEvent = z.infer<typeof objectiveCreatedSchema>;
export type WorkerHeartbeatEvent = z.infer<typeof workerHeartbeatSchema>;
export type SupervisorVerdictEvent = z.infer<typeof supervisorVerdictSchema>;
export type SupervisorChatLinkSetEvent = z.infer<typeof supervisorChatLinkSetSchema>;

export interface StoredEvent {
  id: number;
  worker: string;
  type: MissionControlEvent["type"];
  occurredAt: string;
  data: MissionControlEvent;
}

export function parseEvent(input: unknown): MissionControlEvent {
  return eventSchema.parse(input);
}
