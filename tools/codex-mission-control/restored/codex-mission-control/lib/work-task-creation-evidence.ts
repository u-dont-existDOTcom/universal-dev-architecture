import type { StoredEvent } from "./schema";
import { workTaskCreationSelectionAppliedSchema } from "./schema";
import { launchSelectionFor, workExecutionProfilesEqual, type WorkExecutionProfile, type WorkLaunchSelection } from "./work-execution-profile";

/** Only authenticated durable producer metadata establishes trust. Payload role claims do not. */
export function trustedTaskCreationEvidence(events: StoredEvent[], binding: {
  worker: string; authorizationId: string; directiveId: string; directiveRevision: number;
  taskId: string; profile: WorkExecutionProfile; evidenceId: string | null;
}): { evidenceId: string; selection: WorkLaunchSelection } | null {
  if (!binding.evidenceId) return null;
  const event = events.find((item) => item.data.type === "work_task_creation_selection_applied"
    && item.data.evidence_id === binding.evidenceId && item.data.worker === binding.worker);
  const data = event?.data;
  if (!event || data?.type !== "work_task_creation_selection_applied"
    || event.producerKind !== "SYSTEM" || event.producerId !== data.producer_id
    || !workTaskCreationSelectionAppliedSchema.safeParse(data).success
    || data.authorization_id !== binding.authorizationId || data.directive_id !== binding.directiveId
    || data.directive_revision !== binding.directiveRevision || data.task_id !== binding.taskId
    || !workExecutionProfilesEqual(data.authorized_profile, binding.profile)) return null;
  const selection = { model: data.model_setter, thinking: data.effort_setter, fastModeRequest: data.fast_request };
  const expected = launchSelectionFor(binding.profile);
  if (selection.model !== expected.model || selection.thinking !== expected.thinking
    || selection.fastModeRequest !== expected.fastModeRequest
    || data.fast_setter !== null && data.fast_setter !== expected.fastModeRequest
    || expected.fastModeRequest === "ENABLE_FAST" && data.fast_setter === null) return null;
  return { evidenceId: data.evidence_id, selection };
}

export function receiptHasTrustedSetterEvidence(event: StoredEvent, events: StoredEvent[]): boolean {
  const data = event.data;
  if (data.type !== "execution_receipt_recorded" || data.work_execution === "LEGACY_MODEL_PROFILE_UNSPECIFIED") return false;
  const binding = data.work_execution;
  const evidence = trustedTaskCreationEvidence(events, {
    worker: data.worker!, authorizationId: binding.authorization_id, directiveId: data.directive_id,
    directiveRevision: data.directive_revision, taskId: data.task_id,
    profile: binding.authorized_profile, evidenceId: binding.setter_evidence_id,
  });
  return evidence !== null && JSON.stringify(evidence.selection) === JSON.stringify(binding.applied_selection);
}
