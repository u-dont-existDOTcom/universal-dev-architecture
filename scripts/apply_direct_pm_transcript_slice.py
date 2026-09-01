#!/usr/bin/env python3
"""One-shot fail-closed patch for the direct PM/supervisor transcript slice."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "tools" / "codex-mission-control" / "restored" / "codex-mission-control"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one patch marker, found {count}: {old[:100]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def patch_schema() -> None:
    path = APP / "lib" / "schema.ts"
    marker = "export const executionDirectiveRecordedSchema = z.object({\n"
    event = '''export const reasoningMessageRecordedSchema = z.object({
  type: z.literal("reasoning_message_recorded"),
  worker: WorkerId,
  message_id: StableId,
  thread_id: StableId,
  surface_role: z.enum(["PROJECT_MANAGER", "SUPERVISOR"]),
  provider_surface: z.enum(["CHATGPT_CONSUMER", "CHATGPT_WORK", "OPENAI_API", "UNKNOWN"]),
  model_mode: NonEmpty.max(200).default("UNKNOWN"),
  account_workspace: NonEmpty.max(200).default("UNKNOWN"),
  author_role: z.enum(["OWNER", "ASSISTANT", "SYSTEM"]),
  sent_at_source: Timestamp.nullable().default(null),
  received_at_mission_control: Timestamp,
  body_sha256: Sha256,
  exact_visible_body: NonEmpty.max(50_000).nullable().default(null),
  immutable_provider_locator: Url.nullable().default(null),
  parent_message_id: StableId.nullable().default(null),
  owner_direction_id: StableId.nullable().default(null),
  decision_request_id: StableId.nullable().default(null),
  acquisition_method: z.enum(["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT", "OWNER_ATTESTED", "CODEX_COPIED", "UNKNOWN"]),
  provenance_status: z.enum(["VERIFIED", "OWNER_ATTESTED", "UNVERIFIED"]),
  limitations: z.array(NonEmpty).default([]),
  recorded_by: StableId,
}).superRefine((message, context) => {
  if (!message.exact_visible_body && !message.immutable_provider_locator) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["exact_visible_body"], message: "A reasoning message requires exact visible body text or an immutable provider locator." });
  }
  if (message.provenance_status === "VERIFIED"
    && (!message.sent_at_source || message.provider_surface === "UNKNOWN"
      || !["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT"].includes(message.acquisition_method))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["provenance_status"], message: "VERIFIED requires a source timestamp, known provider surface, and provider-direct or independent-reader acquisition." });
  }
  if (message.provenance_status === "OWNER_ATTESTED" && message.acquisition_method !== "OWNER_ATTESTED") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["acquisition_method"], message: "OWNER_ATTESTED provenance requires owner-attested acquisition." });
  }
  if (message.acquisition_method === "CODEX_COPIED" && message.provenance_status !== "UNVERIFIED") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["provenance_status"], message: "CODEX_COPIED reasoning is UNVERIFIED and cannot acquire ChatGPT authority." });
  }
});

'''
    replace_once(path, marker, event + marker)
    old_union = '''  supervisionRouteRecordedSchema, researchVerdictRecordedSchema,
  reasoningSupervisionRecordedSchema, executionDirectiveRecordedSchema, codexExecutionStartedSchema, executionReceiptRecordedSchema,
'''
    new_union = '''  supervisionRouteRecordedSchema, researchVerdictRecordedSchema,
  reasoningMessageRecordedSchema, reasoningSupervisionRecordedSchema, executionDirectiveRecordedSchema, codexExecutionStartedSchema, executionReceiptRecordedSchema,
'''
    replace_once(path, old_union, new_union)


def patch_ingestion_auth() -> None:
    path = APP / "lib" / "ingestion-auth.ts"
    replace_once(
        path,
        '  "owner_decision_recorded", "supervision_route_recorded", "research_verdict_recorded", "reasoning_supervision_recorded",\n',
        '  "owner_decision_recorded", "supervision_route_recorded", "research_verdict_recorded", "reasoning_message_recorded", "reasoning_supervision_recorded",\n',
    )
    replace_once(
        path,
        '  "owner_message_recorded",\n]);\n',
        '  "owner_message_recorded", "reasoning_message_recorded",\n]);\n',
    )
    replace_once(
        path,
        '  "supervision_alert_recorded",\n]);\n',
        '  "supervision_alert_recorded", "reasoning_message_recorded",\n]);\n',
    )
    replace_once(
        path,
        '  "evidence_receipt_recorded", "symphony_runtime_observed", "live_worker_evidence_observed", "symphony_adapter_diagnostic_recorded",\n]);\n',
        '  "evidence_receipt_recorded", "symphony_runtime_observed", "live_worker_evidence_observed", "symphony_adapter_diagnostic_recorded",\n  "reasoning_message_recorded",\n]);\n',
    )
    marker = '''function embeddedIdentityMatches(producer: AuthenticatedProducer, event: MissionControlEventV2): boolean {
  if (event.type === "evidence_receipt_recorded") {
'''
    replacement = '''function embeddedIdentityMatches(producer: AuthenticatedProducer, event: MissionControlEventV2): boolean {
  if (event.type === "reasoning_message_recorded") {
    if (event.recorded_by !== producer.id || producer.kind === "WORKER") return false;
    if (producer.kind === "OWNER_AUTHORITY") {
      return event.author_role === "OWNER"
        && event.acquisition_method === "OWNER_ATTESTED"
        && event.provenance_status === "OWNER_ATTESTED";
    }
    if (producer.kind === "SUPERVISOR") {
      return event.author_role === "ASSISTANT"
        && event.acquisition_method !== "CODEX_COPIED";
    }
    if (producer.kind === "COLLECTOR") {
      return ["OWNER", "ASSISTANT", "SYSTEM"].includes(event.author_role)
        && ["PROVIDER_DIRECT", "INDEPENDENT_READER_DIRECT"].includes(event.acquisition_method)
        && event.provenance_status === "VERIFIED";
    }
    return false;
  }
  if (event.type === "evidence_receipt_recorded") {
'''
    replace_once(path, marker, replacement)


def patch_store() -> None:
    path = APP / "lib" / "store.ts"
    marker = '''    const contracts = events.filter((event) => event.data.type === "task_contract_recorded");

    if (data.type === "owner_outcome_recorded") {
'''
    replacement = '''    const contracts = events.filter((event) => event.data.type === "task_contract_recorded");

    if (data.type === "reasoning_message_recorded") {
      if (data.exact_visible_body && sha256(data.exact_visible_body) !== data.body_sha256) {
        throw new ContractInvariantError("Reasoning-message body SHA-256 does not match the exact visible body.");
      }
      if (data.provenance_status === "VERIFIED" && !data.sent_at_source) {
        throw new ContractInvariantError("Verified reasoning messages require source send time.");
      }
    }

    if (data.type === "owner_outcome_recorded") {
'''
    replace_once(path, marker, replacement)


def patch_worker_channel() -> None:
    path = APP / "components" / "WorkerChannel.tsx"
    replace_once(
        path,
        'import { formatMessageTimestamp } from "@/lib/message-time";\n',
        'import { formatMessageTimestamp } from "@/lib/message-time";\nimport { ReasoningTranscript } from "@/components/ReasoningTranscript";\n',
    )
    marker = '''    <div className="channel-grid">
'''
    replacement = '''    <ReasoningTranscript timeline={worker.timeline} />

    <div className="channel-grid">
'''
    replace_once(path, marker, replacement)
    replace_once(
        path,
        '                  data-timestamp-verified={timestamp.verified ? "true" : "false"}\n                >',
        '                  data-timestamp-verified={timestamp.verified ? "true" : "false"}\n                  suppressHydrationWarning\n                >',
    )


def patch_worker_detail() -> None:
    path = APP / "components" / "WorkerDetail.tsx"
    marker = '    case "reasoning_supervision_recorded": return `${data.reasoning_supervisor_surface} ${data.reasoning_supervisor_chat_epoch}: ${data.next_reasoning_review_trigger}`;\n'
    replacement = '''    case "reasoning_message_recorded": return `${data.surface_role.replaceAll("_", " ")} ${data.author_role} · ${data.provenance_status}: ${data.exact_visible_body ?? data.immutable_provider_locator ?? "message content unavailable"}`;
    case "reasoning_supervision_recorded": return `${data.reasoning_supervisor_surface} ${data.reasoning_supervisor_chat_epoch}: ${data.next_reasoning_review_trigger}`;
'''
    replace_once(path, marker, replacement)


def main() -> None:
    patch_schema()
    patch_ingestion_auth()
    patch_store()
    patch_worker_channel()
    patch_worker_detail()
    print("DIRECT_PM_TRANSCRIPT_SLICE_PATCHED")


if __name__ == "__main__":
    main()
