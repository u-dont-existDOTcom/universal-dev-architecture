# Mission Control task instructions

These scoped instructions supplement the repository root. Shared rationale lives in root patterns; this file keeps only Mission Control-specific bindings so the discovered chain stays within budget.

## Owner-request integrity gate

A direct owner request or correction to fix, improve, add, remove, preserve, display, route, or change owner-visible behavior is an active requirement, not conversational context.

Before substantive action: preserve exact owner wording/source digest; record the observable result and `non-satisfying proxies`; activate root owner-outcome, follow-up requirement-accretion, and task-time lesson rules; trace evidence to that request; continue unless a genuine owner decision remains.

For durable work use `docs/requirements/*.owner-requirement.json`. Allowed states include `RECORDED_NOT_IMPLEMENTED`, `IMPLEMENTED_NOT_LIVE_VERIFIED`, `LIVE_VERIFIED`, `BLOCKED_EXACT_REASON`, and `SUPERSEDED_BY_OWNER`. Do not say `fixed`, `done`, or equivalent unless the requested observable behavior is demonstrated at the correct boundary.

## Chat reasoning and Work execution authority

Inherit `patterns/chat-work-execution-routing-threshold.md` and `patterns/runtime-chat-work-authority-admission-and-internal-routing.md`; do not restate them as a second policy.

Local binding: `lib/chat-work-authority-gate.ts` and `npm run supervision:admit -- --input <request.json>`. Authenticated runtime admission required by nested instructions remains mandatory. A local check is not a runtime receipt. A non-allow decision blocks the affected action. A worker may not fabricate Chat provenance, reinterpret owner intent, add mandatory requirements, or legitimize its own semantic proposal through an owner-relay request.

Direct owner-authorized maintenance uses the shared pattern's separate recovery
path, not model-routing admission. Autonomous setter-evidence checks stay intact.

## Spending boundary

Current source-bound owner spending policy controls. Zero-spend excludes worker-authored paid-path revival; historical/hypothetical budgets do not override it.

## Internal routing and capability edges

Internal routing stays bound to authenticated transport, exact packet identity, and provider receipt; queue, delivery, ingestion, and semantic acceptance are distinct. It grants no external communication, publication, purchase, account-change, or missing-platform authority.

Use the topology in `patterns/chat-work-execution-routing-threshold.md`; **do not infer a native Work → originating Chat return edge** from Mission Control's mediated route. Capability edges remain directional with every user/UI/permission/authorization gate.

## Browser ownership and submission

Automate only explicitly automation-owned browser targets; never adopt manual/foreign targets. Standing authority includes creating/private-registering a missing `MISSION_CONTROL_ONLY` supervisor conversation while retaining private identity, pacing, fixed controls, and personal-chat exclusion.

For the exact ChatGPT rate-limit UI `too many chat requests are coming too quick`/`too quickly` with exactly one `Got it` control, dismiss and retry the same submission once after at least 30 seconds while preserving the repository-wide 60-second post-send interval. Changed/ambiguous repeat state fails closed.

Work selects authorized task-scoped access and the automatic reviewer; it cannot self-approve a product security prompt. Multi-host relays inherit `patterns/mission-control-multi-host-submission-scheduling.md`. Never use the owner's browser, clipboard, cookies, or profile.

## Completion and continuation

The owner-requested outcome—not a green subtask, PR, test, plan, or artifact—is the stopping target. Any stop names the unmet outcome, blocker, actor, and next executable action.

A consequential follow-up must pass the root follow-up goal/requirement-accretion gate before becoming a Work directive. A new assurance mechanism, proof burden, bridge, or blocker is not unfinished owner work merely because it is technically attractive.

## Time and timestamp truth

Current wall-clock time is obtainable from a trusted runtime or time service when exposed. Distinguish `CURRENT_CHECK_TIME`, `SOURCE_SENT_TIME`, `MISSION_CONTROL_CAPTURE_TIME`, and `TIMESTAMP_UNAVAILABLE`; never relabel capture time as source sent time. ChatGPT-originated messages show exact source date/time/timezone when available, otherwise `TIMESTAMP UNAVAILABLE · UNVERIFIED`.

## Learned-attractor correction

For the Somatic prose experiment, **The model can accurately state the defect and still reproduce it** because generation can remain in the same learned basin. Do not default to more self-critique/prohibition. Test mechanisms that can change search/generation behavior—isolated sampling, quality-diversity coverage, external selection, steering where available, preference adaptation, or owner-source transformation. n8n/Hermes may enforce process isolation; neither is presumed to alter the learned distribution.
