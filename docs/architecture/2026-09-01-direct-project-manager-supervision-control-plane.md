# Direct project-manager and supervisory-chat control plane

Date: 2026-09-01
Status: ACTIVE DESIGN CORRECTION · 2026-09-02 TRANSPORT ERRATUM APPLIED
Applies to: Mission Control, HumanDesign, Somatic humanization, and other long-running supervised work

## Failure being corrected

The owner currently interacts primarily with Codex while Codex opens, manages, summarizes, or claims to relay reasoning chats. That creates a whisper chain:

`owner -> Codex -> supervisor chat -> Codex interpretation -> owner`

The HumanDesign incident showed that this is not merely lossy. Codex can substitute a local subagent for a claimed ChatGPT surface, paraphrase unverified reasoning, or turn its own inference into a supervisor decision.

## Controlling architecture

The primary human interface becomes an **overall Project Manager Chat**.

```text
OWNER <-> PROJECT MANAGER CHAT
                 |
                 +-> SUPERVISORY CHAT(S)
                 |        |
                 |        +-> visible decisions and requests
                 |
                 +-> CODEX / WORK EXECUTOR
                          |
                          +-> terminal, long-range repo work, tests, apps, browsers
```

### Project Manager Chat

Owns:

- verbatim capture of owner messages and authority changes;
- project-level prioritization and routing;
- deciding which supervisory lane must reason about a question;
- presenting consolidated status without inventing hidden reasoning;
- surfacing exact supervisor decision requests to the owner;
- maintaining the canonical task map and next active frontier;
- routine GitHub reads/writes, issue/PR updates, reviews, and ordinary repository supervision when available directly in Chat.

Does not:

- impersonate a supervisor;
- rewrite a supervisor's decision as if it were exact;
- expose or claim hidden chain-of-thought;
- let a summary replace the source decision artifact;
- authorize execution without a source-bound decision receipt.

### Supervisory Chat

Owns the substantive reasoning for its assigned domain and returns visible, attributable outputs:

- decision;
- concise rationale or evidence summary;
- exact execution directive;
- uncertainty and limitations;
- owner decision request when needed.

When the supervisor requires owner judgment, Mission Control must expose a direct link and the exact question. The owner should normally answer in that supervisory chat. If the owner answers through the Project Manager Chat, the PM forwards the response verbatim and records both message identities; no paraphrase can acquire authority.

### Personal Pro same-chat escalation

When an ordinary Extra High turn is insufficient, the preferred Personal Pro path keeps the evidence and reasoning handoff inside one conversation context:

```text
Extra High reader
  -> same conversation Pro reasoner
  -> same conversation Extra High writer
  -> canonical GitHub decision receipt
  -> Mission Control
```

The final Extra High writer may perform exact-copy or explicitly structured transformation only. Mission Control records Pro-content provenance as `SAME_CHAT_WRITER_ATTESTED`; without a provider-direct source it must not claim independent observation of the Pro output.

### Codex / Work

Codex and Work are mechanical executors, not reasoning destinations.

They may:

- run terminal/local-computer operations;
- perform genuinely long-range repository execution under a Chat-authored directive;
- create/open/reuse browser chats mechanically;
- select an authorized visible model/mode when directed;
- submit exact control prompts;
- observe non-content transport state such as URL, composer readiness, generation-start/stop controls, and exact visible model-control labels;
- modify files, run commands, test, deploy when explicitly authorized;
- write provenance receipts for observable transport and execution facts.

They may not:

- extract, copy, parse, summarize, hash, or otherwise transport assistant response text from the ChatGPT page;
- claim a backend model, account, mode, or chat identity they cannot directly verify at the permitted UI/control boundary;
- author supervisor interpretation, strategy, methodology, prioritization, verdict, owner decision, or substantive supervisory prose;
- convert repository state into an acknowledgement of a new owner direction;
- decide that a direction is incorporated;
- take routine GitHub work away from Chat merely because Work also has GitHub or terminal access.

Use Work only when terminal/computer execution is required or when repository execution is genuinely long-range. "Work would help" is not a routing criterion.

## Message and decision provenance

Provider-direct message provenance and Mission Control decision-artifact provenance are distinct.

When a provider-direct/independent message source is actually available, a Project Manager or supervisory message may contain:

```text
message_id
thread_id / session_id
surface_role: PROJECT_MANAGER | SUPERVISOR
provider_surface
model_and_mode_if_verified
account_or_workspace_if_verified
author_role
sent_at_source
received_at_mission_control
absolute Africa/Dakar rendering
UTC ISO rendering
body_sha256
exact_visible_body or immutable provider locator
parent_message_id
owner_direction_id / decision_request_id when applicable
acquisition_method
provenance_status: VERIFIED | OWNER_ATTESTED | UNVERIFIED
limitations
```

A chat link, label, copied summary, browser observation, local subagent name, or `lastReviewAt` field is not a provider message receipt.

For the Personal Pro same-chat GitHub return path, Mission Control instead binds the canonical decision artifact to:

```text
decision_request_id
one-time nonce
evidence capsule ID/hash
current owner-outcome ID/epoch/hash
registered chat ID
reasoning lane
ordered no-content relay-stage receipts
GitHub repository / issue / authorized writer
canonical decision digest
same-chat writer attestation when Pro was used
```

This artifact can authorize the bounded next cycle when all bindings validate, but it does not become independent provider-direct proof of the hidden Pro response.

## Timestamp invariant

Every visible source message row—owner, Project Manager, supervisor, worker, or system—must show:

1. absolute date and time in `Africa/Dakar`;
2. relative age;
3. source UTC ISO time in the detail or tooltip when actually available;
4. provenance state.

Missing provider source time renders `TIMESTAMP UNAVAILABLE · UNVERIFIED` for provider-message currentness. Relay observation times and GitHub creation times must remain explicitly labeled as observation/artifact times; they cannot be relabeled as provider source timestamps.

## Decision-request routing

A supervisor request for owner input creates a `decision_request` bound to the exact source or canonical decision artifact. Mission Control then:

1. places the task in `OWNER_DECISION_REQUIRED`;
2. shows the exact question, options, recommendation, and direct chat link;
3. prevents Codex/Work from choosing an option;
4. accepts an owner response only when bound to the request;
5. returns the exact response to the same supervisory lane;
6. requires a new supervisor decision receipt before execution resumes.

## Currentness rule

A task is not `CURRENT` merely because a browser prompt was delivered or a queue exists. Currentness requires the applicable source-bound evidence, including:

- exact owner direction;
- direction-bound queue/reconciliation where applicable;
- current chat capability receipts;
- exact request/evidence/owner-epoch binding;
- required ordered relay-stage receipts;
- a valid canonical GitHub decision receipt or provider-direct reasoning receipt;
- no unresolved ambiguity at the execution-authority boundary.

Unknown provenance, stale capability evidence, missing stage receipts, or a clicked-but-unverified browser submission fails closed.
