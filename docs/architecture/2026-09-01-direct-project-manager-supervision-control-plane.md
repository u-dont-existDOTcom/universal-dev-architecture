# Direct project-manager and supervisory-chat control plane

Date: 2026-09-01
Status: ACTIVE DESIGN CORRECTION
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
                 |        +-> exact visible decisions and requests
                 |
                 +-> CODEX EXECUTOR / TRANSPORT
                          |
                          +-> repositories, tests, apps, browsers, workers
```

### Project Manager Chat

Owns:

- verbatim capture of owner messages and authority changes;
- project-level prioritization and routing;
- deciding which supervisory lane must reason about a question;
- presenting consolidated status without inventing hidden reasoning;
- surfacing exact supervisor decision requests to the owner;
- maintaining the canonical task map and next active frontier.

Does not:

- impersonate a supervisor;
- rewrite a supervisor's decision as if it were exact;
- expose or claim hidden chain-of-thought;
- let a summary replace the source message;
- authorize execution without a source-bound decision receipt.

### Supervisory Chat

Owns the substantive reasoning for its assigned domain and returns visible, attributable outputs:

- decision;
- concise rationale or evidence summary;
- exact execution directive;
- uncertainty and limitations;
- owner decision request when needed.

When the supervisor requires owner judgment, Mission Control must expose a direct link and the exact question. The owner should normally answer in that supervisory chat. If the owner answers through the Project Manager Chat, the PM forwards the response verbatim and records both message identities; no paraphrase can acquire authority.

### Codex

Codex is a mechanical executor and transport agent.

Codex may:

- create/open chats mechanically;
- deliver exact packets;
- collect exact visible responses;
- modify files, run commands, test, deploy within authorization;
- write provenance receipts for observable transport and execution facts.

Codex may not:

- claim a model, mode, account, or chat identity it cannot verify;
- author supervisor interpretation, strategy, verdict, or reconciliation;
- summarize unseen reasoning as though it came from a chat;
- convert repository state into an acknowledgement of a new owner direction;
- decide that a direction is incorporated.

## Message and decision provenance

Every Project Manager or supervisory message must be represented by a first-class source receipt containing:

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

A chat link, label, copied summary, local subagent name, or `lastReviewAt` field is not a message receipt.

## Timestamp invariant

Every visible message row—owner, Project Manager, supervisor, worker, or system—must show:

1. absolute date and time in `Africa/Dakar`;
2. relative age;
3. source UTC ISO time in the detail or tooltip;
4. provenance state.

Missing source time renders `TIMESTAMP UNAVAILABLE · UNVERIFIED`. Such a message cannot establish that a chat is current.

The chat/project list must sort by the last **verified message time**, not merely by repository activity or link creation. Staleness thresholds must be visible.

## Decision-request routing

A supervisor request for owner input creates a `decision_request` bound to the exact source message. Mission Control then:

1. places the task in `OWNER_DECISION_REQUIRED`;
2. shows the exact question, options, recommendation, and direct chat link;
3. prevents Codex from choosing an option;
4. accepts an owner response only when bound to the request;
5. returns the exact response to the same supervisory lane;
6. requires a new supervisor decision receipt before execution resumes.

## Currentness rule

A task is not `CURRENT` merely because a message was delivered and a queue exists. Currentness requires:

- exact owner direction delivered;
- semantic acknowledgement from an authenticated worker or supervisory surface;
- acknowledgement bound to the direction body hash;
- direction-bound queue;
- reconciliation bound to that queue revision;
- verified reasoning-message timestamp within the applicable freshness horizon.

Unknown provenance or missing message time fails closed.
