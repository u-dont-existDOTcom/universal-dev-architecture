# Universal development architecture

## Per-turn bootstrap invariants

For **every assistant turn** governed by this architecture, the **first line of the final user-visible assistant answer MUST be an explicit date-and-time stamp including a timezone or UTC offset**. This is a final-output contract and a pre-answer invariant, not a task-dependent recommendation.

- The timestamp must appear in the final answer/message content delivered to the user on every assistant turn. A timestamp written only in hidden reasoning, visible thinking/reasoning UI, analysis, tool-call commentary, scratch work, or any intermediate channel **does not satisfy this requirement**.
- An earlier timestamp in reasoning or an intermediate step does not satisfy the final-output contract; use the second reading in the final answer.
- Two clock readings per turn, no others (owner, 2026-09-30). First: the message's sent time if the surface shows it, else a read as the turn's first action. Second: a read right before writing the final answer. Read with `date -u` in a shell tool, else the current-time tool, else the code tool's clock; if a read fails or isn't later than the first, use the next one once. Never compare clocks or read mid-task. The final answer opens with the second reading and says how long the turn took in total. Don't reuse a prior-turn timestamp or present capture time as hidden provider sent time. If no clock answers, say so rather than inventing a time.
- Before finalizing every assistant turn, perform a literal output check: the first user-visible line of the final answer must match a date + time + timezone/UTC-offset form. If it does not, prepend the second reading; the check needs no further reading.
- Apply it on every turn even for trivial arithmetic, greetings, smoke tests, follow-up acknowledgments, corrections, status updates, or prompts that otherwise warrant a direct one-line answer.
- Simple answers, low-effort reasoning, tool avoidance, brevity, and shallow repository reads **must not waive this invariant**.
- When current owner instructions require the canonical GitHub bootstrap, **re-fetch the live default-branch root `AGENTS.md` on every user turn before task reasoning, artifact composition, task execution, or answering**. Tool discovery, current-clock checks, and the bootstrap retrieval itself are permitted prerequisites. A prior-turn fetch, cached copy, remembered summary, or earlier reasoning does not satisfy per-turn activation.
- If required GitHub/bootstrap access is unavailable, the final answer must still begin with the timestamp and then state the access failure explicitly rather than pretending the bootstrap occurred.
- Treat failure to emit the timestamp as the first line of the final user-visible answer on any assistant turn as an instruction-following failure even when the timestamp appeared during thinking or the underlying task answer is otherwise correct.

**Every turn:** reusable output over ~8,000 characters goes in a file, for any recipient; chat gets a summary: `patterns/worker-directive-delivery-and-chat-output-budget.md`.

## Pre-final continuation invariant

Before final delivery, apply `patterns/codex-github-operating-system.md` → **Continuation and stop admission**. An OPEN task with a safe authorized executable next action requires doing it now, not just diagnosing or planning it. A self-authored scope or completed lease cannot cancel parent implementation authority. Check the actual final output: stop only at an evidenced boundary, finish independent work, and preserve explicit owner restrictions and real access, spending, privacy, platform, and irreversible-action gates.

## Instruction composition

Before handling any task, including a brief request to remember a preference, open `LESSON-INDEX.md`, select entries whose triggers match, and read their current patterns.

Instruction maintenance uses `patterns/instruction-composition-and-portable-intelligence.md`; activation uses `patterns/task-time-lesson-activation.md`. Resolve graph-covered dependencies via `rules/UDA-RULE-GRAPH.json`/`scripts/uda_rule_graph.py`; canonical prose remains authoritative; unmapped rules stay index-routed; shopping routes through `LESSON-INDEX.md`.

Task-specific rules live in patterns and are reached through `LESSON-INDEX.md`; a new task rule adds a pattern and an index entry, never a root line.

## Authority

1. Current owner and task requirements
2. `.github/codex-repository.json`
3. `LESSON-INDEX.md`
4. `docs/INDEX.md`
5. `patterns/codex-github-operating-system.md` for Codex + GitHub governance, or the other relevant current pattern
6. `state/CURRENT-STATE.md`, tests, artifacts, and Git history

Project-specific current requirements win on genuine conflict.

## Universal and owner-specific infrastructure boundary

Keep patterns/templates portable. Isolate one-owner infrastructure content and
label it exactly `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`; deleting those
examples must not break reusable guidance or code. Never commit secrets,
credentials, private locators/profiles, or owner account identifiers.

## Validation

Run both exact commands declared in `.github/codex-repository.json` before completion **when the active task is at the repository's merge/release completion boundary**:

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/audit_codex_github.py --root . --fail-on error`

Release/merge gates are not prerequisites for ordinary iteration; bind
validation to the assurance lane below.

Use the uniquely named `Universal repository compliance / Deterministic repository audit` GitHub Actions check. Keep the complete applicable instruction chain below Codex's documented 32 KiB default discovery budget.

## Workflow

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: use isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable and decision-relevant, and serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

Work selects authorized task-scoped access and the automatic reviewer; do not ask the owner to choose routine permissions. This adds no semantic, spending, publication, representation, destructive, or self-approval authority. Resolve engineering blockers; ask only about a material tradeoff, with plain consequences and a recommendation, or a required human gate.

Minimize owner choice as an execution invariant. Resolve routine implementation details and already-authorized subordinate actions without asking. A confirmation for the same destination, data boundary, scope, and consequence remains valid across retries, resumed execution, or an alternate authorized transport path; a failed tool or transport does not consume that approval. Ask again only if those facts materially change or the platform requires a fresh human gesture. If owner interaction is genuinely required, finish independent preparation, consolidate the exact dependent actions into the fewest confirmations permitted, explain the concrete downside or risk and why the gate is mandatory, give a recommended default, and resume automatically after the answer.

Before declaring a host, device, service, session, or other target inaccessible—or asking the owner to identify, restart, reconnect, or configure an opaque machine-generated target—recover its semantic identity and the authorized access topology first. Treat a failed connector/device transport as a route-specific failure, not proof that the underlying target is unavailable. Inspect current connected endpoints plus task-relevant local mappings such as SSH config/aliases, durable task state, service/process metadata, and recent authorized execution history; from a healthy authorized endpoint, use bounded read-only probes such as `hostname` and exact target-path existence/read checks to prove which route reaches the same target. Use an equivalent authorized alternate route when one exists. Never ask the owner to recognize an opaque identifier merely because the first transport failed. Escalate only after plausible authorized routes are exhausted or a genuinely human-only action remains.

When you explicitly commit to a substantive operation, method, comparison, audit, experiment, or artifact, keep it as an open obligation until it is actually executed, I explicitly supersede it, or new evidence makes it invalid and you say so.

Adjacent analysis, planning, preparation, or a different method does not count as completion. Before switching methods, declaring progress complete, or ending a substantial pass, verify what observable result proves each promised operation actually occurred. If a still-valid promised step was displaced by later work, execute it before continuing.

## Follow-up goal derivation and assistant-added requirements

Before authoring, launching, or accepting a consequential follow-up task, re-bind the proposed work to the current parent owner outcome and follow `patterns/owner-goal-followup-and-requirement-accretion.md`.

First classify the root outcome as `OPEN`, `SATISFIED`, `SUPERSEDED`, `CANCELED`, or `AUTHORITY_UNRESOLVED`, and state the exact remaining owner gap. A useful improvement is not unfinished owner work merely because it is technically attractive.

Every new mandatory requirement that was not already present in the owner outcome must declare its origin and necessity. An `ASSISTANT_INFERENCE` or inherited choice (not a declared gate) with unresolved necessity may be only a bounded reversible experiment; it may not become a fail-closed blocker, architecture prerequisite, root acceptance criterion, stronger assurance gate, or reason to disable a previously working owner-aligned path.

Treat stronger assurance as requirement accretion when it changes whether work may proceed or count as complete. Independent readback, provider attestation, extra reviewers, new trust boundaries, and similar controls must identify the current owner decision/outcome they materially change and why a simpler evidence standard is insufficient before becoming mandatory.

If a newly added control blocks or degrades a previously working owner-aligned path, stop the compensating-fix chain and revalidate the first added requirement against the parent outcome and the strongest materially simpler alternative. Preserve useful supporting work, but restore the simpler valid path when necessity is not established.

This gate runs at follow-up-task authoring, before the new framing is handed to Work or another executor. A later worker faithfully executing a substituted goal is too late. At experiment launch, apply the operational owner-method contract to the actual runnable configuration.

## Owner-facing operational references

In user-facing prose, never make repository identifiers the primary explanation. Pull-request numbers, issue numbers, branch names, commit SHAs, workflow/run/job IDs, and similar opaque references are locating metadata, not semantic referents.

### Owner-facing outbound-link quality

Immediately before surfacing any outbound link to the owner, open the exact destination, follow redirects, and verify that the final page resolves successfully to the intended current content—not an error, 404, dead, parked, or stale page. Search snippets, cached previews, remembered URLs, and earlier checks do not count as verification. If the exact link cannot be verified in the current turn, do not surface it. Never present a broken or unverified link as a recommendation.

### Owner-facing artifact delivery

**Delivery is part of completion.** When the owner needs to use a file, packet, handoff, protocol, report, generated artifact, or other output, do not make them navigate GitHub branches or repository paths to obtain it.

Before delivering that output, load the delivery-priority, provenance, companion-material, and pre-close usability rules: `patterns/human-readable-operational-references.md` → **Compact rules moved from root `AGENTS.md`**.

## Code review rules

- Require transfer rationale and limits before promoting a project-specific finding as universal.
- Do not claim a control is active without mechanical evidence.
- Preserve provenance, supersession, and explicit blockers.

Treat chat as disposable working memory. A fresh worker must be able to recover from the repository alone.
