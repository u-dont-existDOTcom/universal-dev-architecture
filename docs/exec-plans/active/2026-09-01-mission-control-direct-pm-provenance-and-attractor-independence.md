# Execution directive: direct PM control plane, provenance, timestamps, and attractor-independence test

Date: 2026-09-01
Branch: `task/mission-control-direct-pm-attractor-independence-20260901`
Base: PR #51 head `b77487ae58e2c78538c0b7c48ecb2ee5c8261222`
Status: ACTIVE BOUNDED IMPLEMENTATION
Reasoning owner: ChatGPT project-manager/supervisor lane
Mechanical executor: Codex

## Owner outcome

Repair the control plane so Joel talks primarily to an overall Project Manager Chat, Codex is transport/execution rather than the conversational authority, supervisory chats are directly attributable and reachable for owner decisions, every visible ChatGPT message has an exact date/time, and the Somatic humanization experiment tests structural state independence without defaulting to a second model or model debate.

## Preserved owner corrections

1. Do not treat Claude or another model as the remedy. The Authorial Graph multi-model debate failed: Claude congratulated, GPT criticized, the agents argued, and no useful work resulted.
2. The suspected failure is in the shared structural attractor and interaction architecture.
3. n8n may create stronger execution-state independence, but that has not been tested for prose outcomes.
4. Hermes has not been tested for reaching the humanization goal; its completed experiment covered continuity mechanics only.
5. Codex as the owner's primary conversational surface creates whisper-down-the-lane distortion.
6. Every ChatGPT message must visibly include the date and time sent so old chats can be distinguished.

Do not soften, reinterpret, or replace these corrections.

## Work slice A — remove semantic authorship from the polling sidecar

Modify:

- `tools/codex-mission-control/restored/codex-mission-control/scripts/run-worker-adapter.mjs`
- `tools/codex-mission-control/restored/codex-mission-control/scripts/verify-live-worker-acceptance.mjs`
- `tools/codex-mission-control/restored/codex-mission-control/tests/adapter-experiments.test.ts`

Required behavior:

- The sidecar may emit delivery acknowledgement, repository-bound connection evidence, and a transport-status worker message.
- It must not emit `direction_acknowledged`, `work_queue_published`, `structured_blocker_recorded`, `change_proposal_recorded`, or `direction_reconciled` merely by reading repository state.
- After sidecar delivery alone, a direction remains `AWAITING_ACKNOWLEDGEMENT`.
- The live acceptance script must pass only a transport acceptance and must fail if semantic events came from the sidecar.

## Work slice B — exact message timestamps

Modify/add:

- `components/WorkerChannel.tsx`
- `lib/message-time.ts`
- `tests/message-time.test.ts`

Immediate behavior:

- Every ledgered owner/worker message shows `YYYY-MM-DD HH:MM:SS Africa/Dakar`, relative age, and UTC ISO source time in `dateTime`/tooltip.
- Malformed or absent time shows `TIMESTAMP UNAVAILABLE · unverified`.
- Generic transport acknowledgement must not make the UI show semantic `ACKNOWLEDGED`.
- The UI must state explicitly that external ChatGPT transcript timestamps are not verified until provider-bound message events exist.

This slice does not falsely claim the external ChatGPT timestamp requirement is complete.

## Work slice C — first-class Project Manager and supervisor messages

Add a v2 event, projection, UI panel, and hostile tests for exact visible ChatGPT messages. Suggested event name: `reasoning_message_recorded`.

Required fields:

```text
worker
message_id
thread_id
surface_role: PROJECT_MANAGER | SUPERVISOR
provider_surface
model_mode: verified value or UNKNOWN
account_workspace: verified value or UNKNOWN
author_role: OWNER | ASSISTANT | SYSTEM
sent_at_source
received_at_mission_control
body_sha256
exact_visible_body or immutable provider locator
parent_message_id
owner_direction_id / decision_request_id
acquisition_method
provenance_status: VERIFIED | OWNER_ATTESTED | UNVERIFIED
limitations
```

Producer and authority rules:

- A SUPERVISOR producer may record its own visible messages.
- A provider-direct collector may record transcript evidence but cannot author a decision.
- A WORKER/Codex producer cannot emit a message attributed to ChatGPT Project Manager, Extra High, or Pro.
- Unknown model or account identity remains `UNKNOWN`; local subagent names cannot populate provider/model fields.
- A decision or execution directive may reference only a verified or owner-attested source message.

UI acceptance:

- Show the transcript in chronological order with absolute Dakar time, relative age, UTC source time, and provenance badge.
- Sort chat cards by last verified source-message time.
- Missing message-level transcript evidence makes reasoning currentness `UNVERIFIED`, regardless of a valid chat URL or `lastReviewAt` summary.

## Work slice D — direct owner decision routing

Implement the control flow in `docs/architecture/2026-09-01-direct-project-manager-supervision-control-plane.md`.

- Project Manager Chat is the default owner-facing surface.
- Supervisory chats issue exact `decision_request` records.
- Mission Control displays the exact question and direct chat link.
- Joel can answer directly in the supervisor chat.
- If he answers through the PM chat, the response is forwarded verbatim with source and destination message IDs.
- Codex cannot answer, paraphrase, or choose.
- Execution resumes only after a new source-bound supervisor decision receipt.

## Work slice E — attractor-independence experiment

Implement the manifest in:

- `experiments/attractor-independence/experiment.json`
- `experiments/attractor-independence/README.md`

Do not execute paid model calls without separate authorization. Build the deterministic orchestration, provenance validation, randomization, archive, and reporting path first.

The model family remains fixed across direct, n8n, and Hermes arms. No debate, self-refinement, cross-candidate communication, or critic-to-writer feedback is permitted.

## Source archive and verification

After modifying restored Mission Control source:

1. run `tools/codex-mission-control/package-source.sh`;
2. verify archive reconstruction and SHA-256;
3. run focused tests;
4. run the full Mission Control test suite once;
5. run TypeScript typecheck and production build;
6. run the repository audit once;
7. push and verify hosted CI at the exact head.

Do not claim this directive complete while the restored source and source archive differ.

## Completion claims

Allowed intermediate claims:

- `TRANSPORT_SEMANTIC_LAUNDERING_REMOVED`
- `INTERNAL_MESSAGE_TIMESTAMPS_EXPLICIT_EXTERNAL_TRANSCRIPT_PENDING`
- `PROJECT_MANAGER_SUPERVISOR_TRANSCRIPT_PROVENANCE_IMPLEMENTED`
- `ATTRACTOR_ISOLATION_HARNESS_READY_NOT_EXECUTED`

Overall completion requires all work slices A–E, source archive parity, hosted green CI, and one live demonstration in which an owner decision request moves from supervisor to Joel without Codex paraphrase.
