// What marks a task the owner registered from the dashboard, kept free of other imports so the store, the comparator,
// the projection and the registration form can all use it. The store refuses these markers on every route except the
// owner's registration (EventStore.appendOwnerTaskRegistration), so no other caller can make a record look like one.
export const OWNER_TASK_SOURCE_LOCATOR_PREFIX = "mission-control://owner-session/task-registration/";
export const OWNER_TASK_EVENT_ID_PREFIX = "owner-task-registration:";

// The fixed lines Mission Control adds to every task the owner registers. The form shows them, and they are part of the
// submission that the owner source's SHA-256 covers, so every text in the task's owner-authority records is either the
// owner's own words or one of these lines the owner saw before submitting.
export const OWNER_TASK_STANDARD_TERMS = {
  version: 1,
  not_proof_of_done: ["tests pass", "supervisor approval", "a report that says it is done"],
  starting_gap: "Registered by the owner; no work has started.",
  first_step: "Ask the task's supervisor for the first bounded step within the allowed scope.",
} as const;

// The state of a registered task before its supervisor has recorded anything: nothing is wrong and nothing waits on the
// owner; the task is waiting for its supervisor.
export const OWNER_TASK_AWAITING_SUPERVISION_REASON = "OWNER.TASK_REGISTERED_AWAITING_SUPERVISION";

interface SourceLike { type?: string; canonical_locator?: unknown; acquisition_mode?: unknown }
interface OutcomeLike { type?: string; epoch?: unknown }
interface EventLike { eventId: string; data: { type: string } }

export function isOwnerTaskRegistrationSource(source: SourceLike | undefined | null): boolean {
  return Boolean(source && source.type === "owner_source_recorded"
    && typeof source.canonical_locator === "string"
    && source.canonical_locator.startsWith(OWNER_TASK_SOURCE_LOCATOR_PREFIX)
    && source.acquisition_mode === "OWNER_REATTESTED");
}

/** Whether an event to be appended carries a task-registration marker: its event id, or the owner-session locator. */
export function carriesOwnerTaskRegistrationMarker(eventId: string, data: { type: string; canonical_locator?: unknown }): boolean {
  return eventId.startsWith(OWNER_TASK_EVENT_ID_PREFIX)
    || data.type === "owner_source_recorded" && typeof data.canonical_locator === "string"
      && data.canonical_locator.startsWith(OWNER_TASK_SOURCE_LOCATOR_PREFIX);
}

// The current supervision rules were introduced at owner-outcome epoch 4 for the tasks that existed then. A task the
// owner registers afterwards starts at epoch 1 but is new, so the current rules apply to it from the start.
export function outcomeUnderCurrentSupervision(outcome: OutcomeLike | undefined | null, source: SourceLike | undefined | null): boolean {
  if (!outcome || outcome.type !== "owner_outcome_recorded") return false;
  return (typeof outcome.epoch === "number" && outcome.epoch >= 4) || isOwnerTaskRegistrationSource(source);
}

/** A registered task whose history is still only its registration (and connection observations): no supervisor has
 * recorded anything for it yet. */
export function ownerTaskAwaitingFirstSupervision(events: readonly EventLike[], currentSource: SourceLike | undefined | null): boolean {
  return isOwnerTaskRegistrationSource(currentSource) && events.length > 0 && events.every((event) =>
    event.eventId.startsWith(OWNER_TASK_EVENT_ID_PREFIX) || event.data.type === "worker_connection_observed");
}
