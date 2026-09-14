# Mission Control task instructions

These scoped instructions supplement the repository root. The root and canonical patterns own shared rationale; keep this file to Mission Control-specific bindings so the discovered instruction chain remains within budget.

## Owner-request integrity gate

A direct owner request or correction to fix, improve, add, remove, preserve, display, route, or change owner-visible behavior is an active requirement, not conversational context.

Before substantive action: preserve the exact owner wording/source digest; record the observable result and `non-satisfying proxies`; activate the root owner-outcome, follow-up requirement-accretion, and task-time lesson rules; trace implementation/evidence to that request; continue automatically unless a genuine owner decision remains.

For durable work use `docs/requirements/*.owner-requirement.json` and the repository validator. Allowed states include `RECORDED_NOT_IMPLEMENTED`, `IMPLEMENTED_NOT_LIVE_VERIFIED`, `LIVE_VERIFIED`, `BLOCKED_EXACT_REASON`, and `SUPERSEDED_BY_OWNER`. Do not say `fixed`, `done`, or equivalent unless the requested observable behavior is demonstrated at the correct boundary.

## Chat reasoning and Work execution authority

Inherit `patterns/chat-work-execution-routing-threshold.md` and `patterns/runtime-chat-work-authority-admission-and-internal-routing.md`; do not restate them as a second policy.

Local binding: `lib/chat-work-authority-gate.ts` and `npm run supervision:admit -- --input <request.json>` evaluate local policy. The authenticated runtime admission required by nested instructions remains mandatory before controlled execution. A local check is not a runtime receipt. A non-allow decision blocks the affected action. A worker may not fabricate Chat provenance, reinterpret owner intent, add mandatory requirements, or use an owner-relay request to legitimize its own semantic proposal.

## Spending boundary

Current source-bound owner spending policy controls. Zero-spend excludes worker-authored paid-path revival; only the authorized reasoning actor may formulate a new proposal, and later owner authority is still required where applicable.

## Internal supervisor routing and capability edges

Bind internal routing to the configured supervisor directory, authenticated transport, exact packet digest, and provider receipt. Queue, attempt, delivery, response ingestion, and semantic acceptance are distinct. Internal routing does not authorize external recipients, publication, purchases, account changes, or missing platform gates. An unavailable route is a scoped transport blocker, not permission to make the owner a courier.

Use the current topology in `patterns/chat-work-execution-routing-threshold.md`; **do not infer a native Work → originating Chat return edge** from Mission Control's mediated route. Capability edges are directional and retain every user/UI/permission/authorization gate.

## Browser ownership, rate limits, and multi-host submission

Browser automation may operate only on explicitly automation-owned windows/targets. Persist ownership IDs; never adopt, navigate, submit into, close, or count manual/foreign targets. If ownership is lost, create a dedicated automation window.

For the exact ChatGPT rate-limit UI `too many chat requests are coming too quick`/`too quickly` with exactly one `Got it` control, dismiss it and retry the exact same submission once after at least 30 seconds while preserving the repository-wide minimum 60-second interval after any crossed send boundary. A second, ambiguous, or changed result fails closed; inspect only the bounded provider/system dialog, never assistant-response content.

Standing authority includes creating/private-registering a missing `MISSION_CONTROL_ONLY` supervisor conversation without repeat approval; preserve automation ownership, private locators, fixed controls, global pacing, and personal-chat exclusion.

Work selects authorized task-scoped access and the automatic reviewer. Only an outcome-changing access tradeoff goes to Joel; Work cannot self-approve a product security prompt. Multi-host relays inherit `patterns/mission-control-multi-host-submission-scheduling.md`: fenced active/passive epochs, per-send admission, global pacing, MC-only provenance, exact target ownership, and fail-closed takeover. Never use the owner's browser, clipboard, cookies, or profile.

## Completion and continuation

The default is the owner-requested outcome, not a green subtask, commit, PR, test, plan, or prepared artifact. Stop only for live-verified completion, a genuine owner-only semantic choice, exhausted external capability, or a real safety/security/privacy/irreversibility boundary. Any stop names the unmet outcome, blocker, actor, and next executable action.

A consequential follow-up must pass the root follow-up goal/requirement-accretion gate before it becomes a Work directive. A new assurance mechanism, proof burden, bridge, or blocker is not unfinished owner work merely because it is technically attractive.

## Time and timestamp truth

Current wall-clock time is obtainable from a trusted runtime or time service when exposed. Distinguish `CURRENT_CHECK_TIME`, `SOURCE_SENT_TIME`, `MISSION_CONTROL_CAPTURE_TIME`, and `TIMESTAMP_UNAVAILABLE`; never relabel capture time as source sent time. ChatGPT-originated messages must show exact source date/time/timezone when available, otherwise `TIMESTAMP UNAVAILABLE · UNVERIFIED`, with capture time separately labeled if shown.

## Learned-attractor correction

For the Somatic prose experiment, **The model can accurately state the defect and still reproduce it** because generation can remain in the same learned basin. Do not default to more self-critique/prohibition. Test mechanisms that can change search/generation behavior—isolated sampling, quality-diversity coverage, external selection, steering where available, preference adaptation, or owner-source transformation. n8n/Hermes may enforce process isolation; neither is presumed to alter the learned distribution.
