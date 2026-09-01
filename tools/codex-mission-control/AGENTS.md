# Mission Control task instructions

These instructions apply to all work under `tools/codex-mission-control/` and supplement the repository root instructions. The nested generated Next.js instructions remain applicable.

## Owner-request integrity gate

A direct owner request or correction to fix, improve, add, remove, preserve, display, route, or change an owner-visible behavior is an active requirement, not conversational context.

Before the next substantive action:

1. Preserve the owner wording verbatim in the current owner-outcome or task requirement record, with source time when available and an exact digest.
2. State the requested observable result, the evidence that can prove it, and the adjacent results that do **not** satisfy it. Record those adjacent results explicitly as `non-satisfying proxies`.
3. Activate `patterns/owner-outcome-invariant-and-contract-laundering-prevention.md` and `patterns/task-time-lesson-activation.md` in the current task contract.
4. Trace implementation and verification back to the literal request. A summary, issue, plan, schema, test, PR, or CI result is not completion unless that was the requested result.
5. Continue automatically to the next safe implementation step. Ask the owner only when a real semantic choice remains unresolved.

For durable work, store the requirement under `docs/requirements/*.owner-requirement.json` and validate all current records with:

```sh
python3 scripts/validate_owner_request_integrity.py docs/requirements/*.owner-requirement.json
```

A request may be reported only as one of:

- `RECORDED_NOT_IMPLEMENTED`
- `IMPLEMENTED_NOT_LIVE_VERIFIED`
- `LIVE_VERIFIED`
- `BLOCKED_EXACT_REASON`
- `SUPERSEDED_BY_OWNER`

Do not say `fixed`, `done`, or equivalent unless the requested observable behavior has been demonstrated at the correct boundary. A test of a helper function does not prove the live UI or source integration. A live demonstration does not erase known untested paths.

When an owner says a requirement was previously requested but not fixed, treat that as evidence that task-time activation failed. Repair the active contract and enforcement point before offering another explanation-only closeout.

## Chat reasoning and Work execution authority

The Project Manager Chat or an explicitly selected specialist ChatGPT supervisor owns:

- proposals;
- methodology;
- prioritization;
- spending design;
- consequential tradeoffs;
- scientific interpretation;
- supervisory verdicts;
- selection of the next strategy.

Codex and Work are execution-only. They may perform bounded repository, browser, terminal, deployment, data-acquisition, test, and artifact operations that Chat cannot execute directly. They may not originate, expand, recommend, or attribute a proposal, methodology, priority, spending plan, or consequential choice.

Before any controlled action, evaluate the request using `lib/chat-work-authority-gate.ts`. The executable form is:

```sh
npm run supervision:admit -- --input <chat-work-authority-request.json>
```

A non-allow decision is controlling. Codex/Work may not reinterpret it as advice or continue by asking Joel to authorize Codex's own proposal.

A Codex/Work-authored semantic proposal is invalid even if it is inexpensive, technically plausible, or later summarized in a ChatGPT-shaped voice.

A Chat-originated directive must have a source-bound message identity and exact body digest. A Codex summary, copied text, local subagent, chat title, opened browser tab, or assertion that a chat already decided something is not a reasoning receipt. Unknown or mismatched source provenance fails closed.

When Chat can complete the work directly, keep it in Chat. Delegate only the mechanical residue that requires external tools. Every execution result returns automatically to the source reasoning chat; Codex/Work may not decide the next consequential step from its own receipt.

## Spending boundary

A zero-spend owner decision is an active authority state, not merely an execution budget field.

While such a decision is current:

- paid model API inference is forbidden;
- Codex/Work may not author a paid smoke proposal or pilot ceiling;
- no older or hypothetical nonzero manifest can revive the path;
- ChatGPT consumer/Pro/Extra High use remains the default reasoning and evaluation surface when available under the owner's plan;
- any later nonzero-spend proposal must originate in a verified reasoning chat and still requires a newer explicit owner decision before execution.

A guard that prevents the API call but permits Codex to invent and advocate a paid path is insufficient.

## Internal supervisor routing

Owner-directed routing among the Project Manager Chat, specialist supervisor chats, and Codex/Work is pre-authorized internal control-plane transport.

For a configured internal supervisor route:

- route factual state automatically;
- preserve the exact packet and digest;
- capture the destination chat/message identity and response provenance;
- never ask Joel to relay the packet;
- never ask Joel to say `send it`;
- never treat routine internal routing as third-party representational communication requiring another action-time confirmation;
- never use this exception for an external recipient, publication, purchase, account change, or other genuinely external representational action.

The more-specific standing owner authorization for internal supervision routing controls over generic browser confirmation guidance. If the destination chat is genuinely missing or inaccessible, report that exact transport blocker after attempting the authorized route; do not convert the owner into the courier.

## Completion and continuation

The default is full completion of the owner-requested outcome.

A green subtask, commit, pull request, test run, plan, or prepared artifact triggers the next eligible implementation, verification, deployment, or live-acceptance step. It is not a stopping condition while the parent outcome remains open.

Stop only when:

- the exact owner outcome is live-verified;
- a genuine owner-only semantic choice remains;
- an unavailable external capability blocks the remaining path after all nonblocked work is complete; or
- a safety, security, privacy, or irreversible external-action boundary requires owner confirmation.

Any stop must name the precise unmet outcome, blocker, actor who can clear it, and next executable action. Do not return merely because one bounded slice is complete.

## Time and timestamp truth

Current wall-clock time is obtainable from a trusted runtime or time service when the active surface exposes one. Do not claim that GPT or ChatGPT has literally no way to know the current time when a system clock, user-time tool, dedicated time tool, authenticated provider timestamp, or authorized operating-system clock is available.

Keep these facts distinct:

- `CURRENT_CHECK_TIME`: the wall-clock time checked now;
- `SOURCE_SENT_TIME`: the time the source chat/provider says a message was sent;
- `MISSION_CONTROL_CAPTURE_TIME`: the time Mission Control observed or recorded it;
- `TIMESTAMP_UNAVAILABLE`: no trustworthy source time exists.

Never relabel capture time as source sent time. Every ChatGPT-originated message displayed in Mission Control must visibly show its exact source date/time and timezone when available. If unavailable, display `TIMESTAMP UNAVAILABLE · UNVERIFIED`; capture time may be shown separately and labelled accurately.

## Learned-attractor correction

For the Somatic prose experiment, the working problem is not lack of diagnosis. The model can accurately state the defect and still reproduce it because generation remains concentrated in a learned high-probability basin. Do not add more self-critique, explanation, model debate, or prohibition as the default repair.

Test control mechanisms that can alter search or generation behavior: genuinely isolated sampling, quality-diversity coverage, external selection, decoding/activation steering where technically available, preference adaptation, or owner-source transformation. n8n and Hermes may enforce process isolation; neither is presumed to change the learned generation distribution.
