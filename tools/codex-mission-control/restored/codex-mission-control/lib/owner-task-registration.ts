import { canonicalJson, sha256 } from "./canonical";
import { producerMayEmit, type AuthenticatedProducer } from "./ingestion-auth";
import { OWNER_TASK_EVENT_ID_PREFIX, OWNER_TASK_SOURCE_LOCATOR_PREFIX, OWNER_TASK_STANDARD_TERMS } from "./owner-task-source";
import type { MissionControlEventV2, StoredEvent } from "./schema";
import { ContractInvariantError, type EventStore } from "./store";

// The owner registers a new task in their own words, from the dashboard (#385, 2026-10-17). Mission Control had no way
// to add a task: a worker appears only after an owner source, an owner outcome and a task contract exist, and those are
// owner-authority records. The owner-action tool deliberately forwards no semantic content (PR #254 review), so an
// AI-written command cannot put words in the owner's mouth. This module is the one path that takes the owner's words.
// The daemon accepts it only with the owner's registration passphrase (lib/owner-task-passphrase.ts): the owner token
// that signs in to the dashboard is also held by scripts on the server, so a signed-in session alone doesn't show that
// the owner typed it. The store refuses this path's markers everywhere else (lib/owner-task-source.ts).
//
// Nothing here interprets the owner. Every text in the records is the owner's own answer or one of the fixed standard
// lines the form shows (OWNER_TASK_STANDARD_TERMS), and both are in the submission the source hash covers. The outcome
// and the contract are mechanical projections of it, so the contract matches its source by construction:
//   goal         -> the owner outcome's verbatim request, normalized result and its one required outcome, and the goal
//   mayUse       -> the contract's allowed scope (one item per line)
//   mustNever    -> the contract's forbidden scope (one item per line)
//   doneWhen     -> the contract's acceptance criteria (one per line) and its finish line

export { OWNER_TASK_SOURCE_LOCATOR_PREFIX } from "./owner-task-source";
export const OWNER_TASK_MISSION_ID = "mission-control";
const WORKER = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const MAX_NAME = 120;
const MAX_TEXT = 4_000;
const MAX_ITEMS = 20;

export interface OwnerTaskRegistrationInput {
  worker: string;
  name: string;
  goal: string;
  mayUse: string[];
  mustNever: string[];
  doneWhen: string[];
}

export interface OwnerTaskRegistrationResult {
  status: "TASK_REGISTERED" | "TASK_ALREADY_REGISTERED";
  worker: string;
  contractId: string;
  sourceSha256: string;
  events: StoredEvent[];
  duplicate: boolean;
}

function lines(value: unknown, field: string, required: boolean): string[] | string {
  if (typeof value !== "string") return `${field} must be text.`;
  if (value.length > MAX_TEXT) return `${field} is longer than ${MAX_TEXT} characters.`;
  const items = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (required && items.length === 0) return `${field} needs at least one line.`;
  if (items.length > MAX_ITEMS) return `${field} has more than ${MAX_ITEMS} lines.`;
  return items;
}

/** Separates the passphrase from the owner's answers, so it never reaches the parser, a record or an error message. */
export function splitOwnerTaskSubmission(value: unknown): { passphrase: unknown; registration: Record<string, unknown> } | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "The registration must be a JSON object.";
  const { passphrase, ...registration } = value as Record<string, unknown>;
  return { passphrase, registration };
}

export function parseOwnerTaskRegistration(value: unknown): OwnerTaskRegistrationInput | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "The registration must be a JSON object.";
  const allowed = ["worker", "name", "goal", "may_use", "must_never", "done_when"];
  const record = value as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !allowed.includes(key));
  if (extra.length) return `Unexpected field ${extra[0]}.`;
  const { worker, name, goal } = record;
  if (typeof worker !== "string" || !WORKER.test(worker)) {
    return "The task id is 1-80 lowercase letters, digits, hyphens or underscores, starting with a letter or digit.";
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME) return `The name is 1-${MAX_NAME} characters.`;
  if (typeof goal !== "string" || !goal.trim() || goal.length > MAX_TEXT) return `What the task should achieve is 1-${MAX_TEXT} characters.`;
  const mayUse = lines(record.may_use, "What it may use", true);
  if (typeof mayUse === "string") return mayUse;
  const mustNever = lines(record.must_never, "What it must never do", true);
  if (typeof mustNever === "string") return mustNever;
  const doneWhen = lines(record.done_when, "When it is done", true);
  if (typeof doneWhen === "string") return doneWhen;
  return { worker, name: name.trim(), goal: goal.trim(), mayUse, mustNever, doneWhen };
}

// The exact owner submission, as recorded and hashed: the owner's answers and the standard lines the form showed. Its
// SHA-256 is the owner source hash every later record binds.
export function ownerTaskSourceDocument(input: OwnerTaskRegistrationInput): string {
  return canonicalJson({
    kind: "MISSION_CONTROL_OWNER_TASK_REGISTRATION_V1",
    worker: input.worker,
    name: input.name,
    goal: input.goal,
    may_use: input.mayUse,
    must_never: input.mustNever,
    done_when: input.doneWhen,
    standard_terms: OWNER_TASK_STANDARD_TERMS,
  });
}

export function ownerTaskRegistrationEvents(input: OwnerTaskRegistrationInput, occurredAt: string, verifierFingerprint?: string): Array<{
  schema_version: 2; event_id: string; mission_id: string; occurred_at: string; data: MissionControlEventV2;
}> {
  const worker = input.worker;
  const sourceSha256 = sha256(ownerTaskSourceDocument(input));
  const tag = sourceSha256.slice(0, 16);
  const requestId = `owner-request:${worker}:registration`;
  const receiptId = `owner-source:${worker}:registration`;
  const outcomeId = `owner-outcome:${worker}`;
  const goalOutcomeId = `outcome:${worker}:goal`;
  const contractId = `contract:${worker}`;
  const gap = OWNER_TASK_STANDARD_TERMS.starting_gap;
  const outcomeBody = {
    owner_outcome_id: outcomeId,
    owner_request_id: requestId,
    epoch: 1,
    source_receipt_id: receiptId,
    owner_source_sha256: sourceSha256,
    verbatim_owner_request: [input.goal],
    normalized_result: input.goal,
    required_outcomes: [{ id: goalOutcomeId, text: input.goal, terminal_required: true, status: "UNKNOWN" as const, direct_evidence_receipt_ids: [] }],
    non_satisfying_proxies: [...OWNER_TASK_STANDARD_TERMS.not_proof_of_done],
    current_gap: gap,
    gap_status: "OPEN" as const,
    supersedes: null,
  };
  const outcomeSha256 = sha256(canonicalJson(outcomeBody));
  const contractBody = {
    worker_name: input.name,
    contract_id: contractId,
    revision: 1,
    owner_outcome_id: outcomeId,
    owner_outcome_epoch: 1,
    owner_outcome_sha256: outcomeSha256,
    goal: input.goal,
    acceptance_criteria: input.doneWhen,
    allowed_scope: input.mayUse,
    forbidden_scope: input.mustNever,
    effective_finish_line: input.doneWhen.join("\n"),
    required_owner_outcome_ids: [goalOutcomeId],
    omitted_owner_outcome_ids: [],
    weakened_owner_outcome_ids: [],
    proxy_substitutions: [],
    authorized_scope_changes: [],
    parent_outcome_remains_open: true,
  };
  const contractSha256 = sha256(canonicalJson(contractBody));
  const envelope = (suffix: string, data: MissionControlEventV2) => ({
    schema_version: 2 as const,
    event_id: `${OWNER_TASK_EVENT_ID_PREFIX}${worker}:${tag}:${suffix}`,
    mission_id: OWNER_TASK_MISSION_ID,
    occurred_at: occurredAt,
    data,
  });
  return [
    envelope("source", {
      type: "owner_source_recorded",
      worker,
      receipt_id: receiptId,
      owner_request_id: requestId,
      canonical_locator: `${OWNER_TASK_SOURCE_LOCATOR_PREFIX}${worker}/${tag}`,
      source_sha256: sourceSha256,
      // The contract below is a mechanical projection of these exact bytes, so its copy is the source itself.
      worker_copy_sha256: sourceSha256,
      capture_integrity: "VERIFIED",
      acquisition_mode: "OWNER_REATTESTED",
      receipt_capability: "OWNER_REATTESTED",
      comparison: "MATCH",
      freshness: "CURRENT",
      limitations: [
        `Submitted from the owner's signed-in Mission Control session with the owner's registration passphrase, which the daemon checked against its stored verifier${verifierFingerprint ? ` (fingerprint ${verifierFingerprint})` : ""}.`,
        "Every text is the owner's own answer or a standard line the form showed; the contract copies them without interpretation.",
      ],
    } as MissionControlEventV2),
    envelope("outcome", { type: "owner_outcome_recorded", worker, ...outcomeBody, owner_outcome_sha256: outcomeSha256, supersedes_outcome_sha256: null } as MissionControlEventV2),
    envelope("contract", { type: "task_contract_recorded", worker, ...contractBody, task_contract_sha256: contractSha256 } as MissionControlEventV2),
    envelope("reconciliation", {
      type: "objective_reconciliation_recorded",
      worker,
      reconciliation_id: `reconciliation:${worker}:1`,
      owner_outcome_id: outcomeId,
      owner_outcome_epoch: 1,
      owner_outcome_sha256: outcomeSha256,
      task_contract_sha256: contractSha256,
      freshness: "CURRENT",
      matrix: [{
        owner_requirement_id: goalOutcomeId,
        owner_requirement: input.goal,
        worker_interpretation: input.goal,
        task_criterion: input.doneWhen.join("\n"),
        acceptance_evidence_receipt_ids: [],
        status: "MAPPED_DIRECT",
        authorized_change: null,
      }],
      current_gap: gap,
      gap_status: "OPEN",
      unmet_owner_outcome_ids: [],
      unknown_owner_outcome_ids: [goalOutcomeId],
      non_satisfying_proxies: outcomeBody.non_satisfying_proxies,
      proposed_required_directive: OWNER_TASK_STANDARD_TERMS.first_step,
    } as MissionControlEventV2),
  ];
}

export function registerOwnerTask(
  store: EventStore,
  input: OwnerTaskRegistrationInput,
  producer: AuthenticatedProducer,
  history: readonly StoredEvent[],
  occurredAt = new Date().toISOString(),
  verifierFingerprint?: string,
): OwnerTaskRegistrationResult {
  if (producer.kind !== "OWNER_AUTHORITY") throw new ContractInvariantError("Only the owner may register a task.");
  const sourceSha256 = sha256(ownerTaskSourceDocument(input));
  const existing = history.filter((event) => event.worker === input.worker);
  const prior = existing.find((event) => event.data.type === "owner_source_recorded");
  const registeredBefore = prior?.data.type === "owner_source_recorded"
    && prior.data.canonical_locator.startsWith(OWNER_TASK_SOURCE_LOCATOR_PREFIX);
  if (registeredBefore && prior.data.type === "owner_source_recorded" && prior.data.source_sha256 === sourceSha256) {
    // The same owner submission again (a double click, a retry): nothing new is recorded.
    return {
      status: "TASK_ALREADY_REGISTERED", worker: input.worker, contractId: `contract:${input.worker}`, sourceSha256,
      events: existing.filter((event) => event.eventId.startsWith(`${OWNER_TASK_EVENT_ID_PREFIX}${input.worker}:`)), duplicate: true,
    };
  }
  if (registeredBefore) {
    throw new ContractInvariantError(`Task ${input.worker} was already registered with different answers, and a registration can't be changed here; choose another task id.`);
  }
  if (existing.length > 0) {
    // Some ids carry records without being a task on the dashboard (a capability challenge, say), so say what is there.
    const types = [...new Set(existing.map((event) => event.data.type))];
    const shown = types.slice(0, 3).join(", ") + (types.length > 3 ? ` and ${types.length - 3} more kinds` : "");
    throw new ContractInvariantError(`The task id ${input.worker} is already used by ${existing.length} Mission Control record${existing.length === 1 ? "" : "s"} (${shown}); choose another task id.`);
  }
  const envelopes = ownerTaskRegistrationEvents(input, occurredAt, verifierFingerprint);
  for (const envelope of envelopes) {
    if (!producerMayEmit(producer, envelope.data)) {
      throw new ContractInvariantError(`The owner producer cannot record ${envelope.data.type}.`);
    }
  }
  // A worker shows on the live dashboard once something records its connection state. No worker adapter exists yet, so
  // Mission Control itself records the honest state: configured, not connected. This is a SYSTEM fact, not an owner one.
  const connection = ownerTaskConnectionEvent(input.worker, sourceSha256.slice(0, 16), occurredAt);
  const system = ownerTaskRegistrationSystemProducer(input.worker);
  if (!producerMayEmit(system, connection.data)) throw new ContractInvariantError("The registration cannot record the task's connection state.");
  const events = store.appendOwnerTaskRegistration([
    ...envelopes.map((event) => ({ event, producer })),
    { event: connection, producer: system },
  ], history);
  return { status: "TASK_REGISTERED", worker: input.worker, contractId: `contract:${input.worker}`, sourceSha256, events, duplicate: false };
}

export const OWNER_TASK_REGISTRATION_SYSTEM_PRODUCER_ID = "system:owner-task-registration";

export function ownerTaskRegistrationSystemProducer(worker: string): AuthenticatedProducer {
  return { id: OWNER_TASK_REGISTRATION_SYSTEM_PRODUCER_ID, kind: "SYSTEM", workerScopes: [worker], taskScopes: [`task:${worker}`] };
}

function ownerTaskConnectionEvent(worker: string, tag: string, occurredAt: string) {
  return {
    schema_version: 2 as const,
    event_id: `${OWNER_TASK_EVENT_ID_PREFIX}${worker}:${tag}:connection`,
    mission_id: OWNER_TASK_MISSION_ID,
    occurred_at: occurredAt,
    data: {
      type: "worker_connection_observed",
      worker,
      connection_id: `registration:${worker}`,
      state: "OFFLINE_CONFIGURED",
      runtime_kind: "NATIVE_WORKER",
      endpoint_id: `registration:${worker}`,
      observed_at: occurredAt,
      lease_expires_at: null,
      source: null,
      detail: "Registered by the owner; no worker is connected yet.",
    } as MissionControlEventV2,
  };
}
