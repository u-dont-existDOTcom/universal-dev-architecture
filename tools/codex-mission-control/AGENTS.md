# Mission Control task instructions

These scoped instructions supplement the repository root. Prefer the canonical root/pattern documents for rationale and full detail; keep this file to Mission Control-specific enforcement so the discovered instruction chain stays within budget.

## Owner-request integrity gate

A direct owner request or correction to fix, improve, add, remove, preserve, display, route, or change owner-visible behavior is an active requirement, not conversational context.

Before the next substantive action:

1. preserve the owner wording in the current owner-outcome/task requirement record with source identity/digest;
2. record the requested observable result, proof boundary, and explicit `non-satisfying proxies`;
3. activate `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md` and `patterns/task-time-lesson-activation.md`;
4. trace implementation and verification back to the literal request; and
5. continue automatically unless a genuine unresolved owner decision remains.

For durable work, use `docs/requirements/*.owner-requirement.json` and validate with `python3 scripts/validate_owner_request_integrity.py docs/requirements/*.owner-requirement.json`.

Allowed request states are `RECORDED_NOT_IMPLEMENTED`, `IMPLEMENTED_NOT_LIVE_VERIFIED`, `LIVE_VERIFIED`, `BLOCKED_EXACT_REASON`, and `SUPERSEDED_BY_OWNER`. Do not say `fixed`, `done`, or equivalent unless the requested observable behavior is demonstrated at the correct boundary. If the owner says a prior request was not fixed, treat that as task-time activation failure and repair the active contract/enforcement point.

## Chat reasoning and Work execution authority

The Project Manager Chat or selected specialist ChatGPT supervisor owns proposals, methodology, prioritization, spending design, consequential tradeoffs, scientific interpretation, supervisory verdicts, and next-strategy selection. Codex/Work is execution-only.

Before controlled execution use `lib/chat-work-authority-gate.ts` via `npm run supervision:admit -- --input <chat-work-authority-request.json>`. A non-allow decision controls. Chat-originated directives require source-bound message identity and exact body digest; copied text, summaries, titles, tabs, or local subagents are not reasoning receipts.

Keep work in Chat when Chat can do it directly, including ordinary GitHub reads/writes, issue/PR updates, architecture, review, supervision, and substantive supervisory prose. Delegate only terminal/computer execution or genuinely long-range repository operations. Persist execution evidence through the verified Mission Control/controller route; Codex/Work may not select the next consequential step from its own receipt, and **do not infer a native Work → originating Chat return edge**.

## Spending boundary

A current zero-spend owner decision forbids paid model API inference and worker-authored paid proposals. Consumer-plan ChatGPT/Pro/Extra High remains the default reasoning/evaluation surface where available. Any later paid path requires a newer verified Chat proposal plus explicit owner authority.

## Internal supervisor routing and capability edges

Owner-directed routing among Project Manager Chat, specialist supervisor chats, and Codex/Work is pre-authorized internal control-plane transport. Route factual state automatically with exact packet/digest and destination provenance; never make the owner relay it or say `send it`. This exception is only for internal supervision, never external communication, publication, purchase, or account changes.

Treat capabilities as exact directional source → destination edges with user/UI/permission/authorization gates. Current established topology: Chat → Work requires explicit user acceptance; native Work ↔ Work coordination exists within Work; Work → the originating Chat is unavailable. Mission Control may provide mediated supervision/control, but that does not transfer semantic reasoning authority or prove a missing native edge. A required click/approval blocks unattended automation until satisfied.

## Browser ownership, rate limits, and multi-host submission

Browser automation may operate only on explicitly automation-owned windows/targets. Persist exact ownership IDs; never adopt, navigate, submit into, close, or count manual/foreign targets. If ownership is lost, create a dedicated automation window.

For the exact ChatGPT rate-limit UI `too many chat requests are coming too quick`/`too quickly` with exactly one `Got it` control, dismiss that control and retry the exact same submission once after at least 30 seconds, while preserving the repository-wide minimum 60-second submission interval after any crossed send boundary. A second/ambiguous/changed result fails closed. Detection may inspect only the bounded provider/system dialog, never assistant response content.

- route factual state automatically;
- preserve the exact packet and digest;
- capture the destination chat/message identity and response provenance;
- never ask Joel to relay the packet;
- never ask Joel to say `send it`;
- never treat routine internal routing as third-party representational communication requiring another action-time confirmation;
- never use this exception for an external recipient, publication, purchase, account change, or other genuinely external representational action.

When an owner-authorized route requires a missing dedicated supervisor surface,
creating and privately registering a fresh `MISSION_CONTROL_ONLY` conversation
is part of this standing internal authority. Do it without asking the owner to
approve conversation creation again, while preserving exact automation target
ownership, private locator handling, fixed control verification, global pacing,
and the prohibition on adopting personal/user conversations.

The more-specific standing owner authorization for internal supervision routing controls over generic browser confirmation guidance. If the destination chat is genuinely missing or inaccessible, report that exact transport blocker after attempting the authorized route; do not convert the owner into the courier.

Model every capability as an exact directional source → destination edge together with its user, UI, permission, and authorization gates. Current architecture facts are: Chat → Work requires explicit user acceptance; native Work ↔ Work coordination exists within Work; Work → the originating Chat is unavailable. Mission Control should reuse native Work-internal coordination, while retaining autonomous control-plane routing of supervision and escalation plus durable control across the Chat/Work boundary through verified routes. This does not transfer semantic reasoning authority to Mission Control. Its authorized internal routing is a mediated control-plane path, not evidence that the missing native edge exists. A required click or approval blocks unattended automation until satisfied.

For the mechanical Work permission level, the executor selects the broadest
task-scoped access already authorized by the owner and requests it up front; it
does not ask Joel to choose routine approval modes. The automatic reviewer
handles eligible escalations. This is a narrow exception to the prohibition on
Work-originated recommendations: if a genuine technical permission tradeoff
remains, Work may describe that tradeoff in plain English and recommend the
safer outcome, but Chat/owner remains the decision authority. Work cannot
self-approve or automate a direct product security prompt raised for its own
action.

## Browser ownership and provider rate-limit recovery

Mission Control browser automation must operate only on an explicitly automation-owned browser window and explicitly automation-owned targets within that window.

Persist the exact window and target IDs across restarts. Eligibility requires
both registry ownership and Chrome membership in that exact window; neither a
matching URL, target order/activity, nor window membership alone is ownership.
Never adopt, activate, navigate, repurpose, submit into, close, or count a
manual/foreign target, even inside the relay profile/window. If owned state is
lost, create a dedicated automation window rather than adopting another tab.
Registered supervisor surfaces stay separate from the owner's personal/manual
tabs and windows.

When the ChatGPT system UI reports the bounded rate-limit condition `too many chat requests are coming too quick`/`too quickly` and exposes exactly one `Got it` control, click that exact control. This is permitted system-UI recovery, not assistant-output inspection. Then retry the exact same submission once after at least 30 seconds. Preserve the global submission gate: if the blocked attempt already crossed the actual click/submission boundary, wait until both the provider retry delay and the repository-wide minimum 60-second submission interval are satisfied. A second rate-limit result, ambiguous dialog/button, or changed target/session fails closed; do not loop or reinterpret the task.

The modal detector may inspect only the bounded provider/system dialog needed to identify this condition and the exact `Got it` control. It must not inspect, copy, hash, parse, or serialize assistant response content, and it does not widen the existing accessibility/network/app-state/OCR/export privacy boundary.

## Multi-host submission and conversation ownership

For multi-host relays, apply
`patterns/mission-control-multi-host-submission-scheduling.md`: active/passive
fenced epochs, one durable per-send admission before browser mutation, global
boundary pacing, `MISSION_CONTROL_ONLY` conversation provenance plus exact
target ownership, and fail-closed takeover. Use only the designated remote
browser/profile; never the owner's browser, clipboard, cookies, or profile.

## Completion and continuation

The default is full completion of the owner-requested outcome. Green subtasks, commits, PRs, tests, plans, or prepared artifacts are not stopping conditions while the parent outcome remains open. Stop only for exact live-verified completion, a genuine owner-only semantic choice, an exhausted external capability, or a real safety/security/privacy/irreversibility boundary. Any stop must name the unmet outcome, blocker, actor, and next executable action.

## Time and timestamp truth

Current wall-clock time is obtainable from a trusted runtime or time service when the active surface exposes one. Distinguish `CURRENT_CHECK_TIME`, `SOURCE_SENT_TIME`, `MISSION_CONTROL_CAPTURE_TIME`, and `TIMESTAMP_UNAVAILABLE`; never relabel capture time as source sent time. ChatGPT-originated messages shown in Mission Control must display exact source date/time/timezone when available, otherwise `TIMESTAMP UNAVAILABLE · UNVERIFIED`, with capture time separately labeled if shown.

## Learned-attractor correction

For the Somatic prose experiment, **The model can accurately state the defect and still reproduce it** because generation can remain in the same learned basin. Do not default to more self-critique/prohibition. Test mechanisms that can change search/generation behavior—isolated sampling, quality-diversity coverage, external selection, steering where available, preference adaptation, or owner-source transformation. n8n/Hermes may enforce process isolation; neither is presumed to alter the learned distribution.
