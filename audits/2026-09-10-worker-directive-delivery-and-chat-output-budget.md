# Worker directive delivery and chat-output budget promotion

Date: 2026-09-10

## Origin

Originating workflow: AskRigor evaluation supervision.

Owner correction: after a reasoning chat had already decided what a Codex worker should do, the chat supplied analysis about the intended worker instructions but did not immediately deliver the actual runnable directive. The owner then had to ask again for the instructions. The owner also identified repeated scrollback/output-cost friction from very large operational instruction payloads being pasted directly into chat instead of delivered as files.

The correction is interaction-architecture level rather than AskRigor-specific: once worker execution is selected, explaining the handoff without delivering it is an incomplete operational turn; large reusable operational payloads should use an artifact surface rather than consume chat history.

## Transfer rationale

The failure transfers across repositories because it depends on the Chat -> worker control boundary, not on AskRigor semantics. The same defect can occur for:

- Codex implementation prompts;
- Work execution directives;
- migration plans;
- evaluation protocols;
- long review packets;
- deployment runbooks;
- multi-repository handoffs.

The remedy composes with existing universal controls:

- `patterns/chat-work-execution-routing-threshold.md` decides whether Chat or Work/Codex should execute;
- `patterns/chat-led-reasoning-codex-execution-separation.md` keeps reasoning authority in Chat;
- `patterns/human-readable-operational-references.md` requires usable owner-facing artifact delivery;
- `patterns/worker-directive-delivery-and-chat-output-budget.md` closes the remaining same-turn delivery and output-size gap.

## Promoted invariant

When worker execution is the selected next step and Chat has enough information to author the directive, the turn is not operationally complete until the complete runnable directive is either sent through the supported handoff or delivered to the owner in a directly usable form.

Long reusable operational payloads should not be pasted into ordinary chat when they materially bloat scrollback. Roughly a couple rendered pages or less may use one fenced code block; longer payloads default to `.md`/text artifacts with a concise chat summary and direct link.

## Limits

- This does not make Codex/Work the default execution surface.
- It does not transfer strategy, methodology, architecture, safety, scientific, editorial, or supervisory judgment to Codex.
- It does not require hiding consequential decisions in artifacts; critical decisions and caveats remain visible in chat.
- It does not prohibit inline long-form content when the owner explicitly requests inline delivery or the content itself is the primary conversational product rather than a reusable operational payload.
- The approximate word/character threshold is a fallback heuristic, not a substitute for judging actual scrollback burden.

## Canonical implementation

- `AGENTS.md` — root enforcement and routing reference.
- `LESSON-INDEX.md` — universal discovery entry.
- `patterns/worker-directive-delivery-and-chat-output-budget.md` — normative rule.
- `tests/test_worker_directive_delivery_output_budget.py` — regression checks.
