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