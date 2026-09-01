# Universal autonomous continuation rule provenance audit — 2026-08-15, updated 2026-08-28

## Decision and source

Joel supplied the standing cross-project rule on 2026-08-15: “don't just give me one sentence keep going that's a universal rule always next step.” On 2026-08-28, Joel extended the same rule to minimize redundant approval requests and ordinary implementation questions across governed surfaces. This is owner-authored operational policy. Its consolidated durable operational meaning is:

Across Chat, Work, Codex/agent execution, and browser or computer-use, once the requested outcome and authority are clear, continue through routine, reversible, in-scope execution. Do not ask for approval merely to inspect or edit in-scope files, run commands or tests, debug failures, browse for task-required information, validate results, or take the obvious next step.

Do not convert ordinary implementation decisions into owner decisions. Infer low-risk, reversible details from the stated goal, repository evidence, existing architecture, and conventions. An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step.

Ask the owner only when materially different viable choices have consequential tradeoffs and the correct choice cannot reasonably be inferred; an action is destructive or difficult to reverse; an action has meaningful external consequences such as publishing, sending communications, purchases or spending, or security, account, or privacy consequences; the work requires material scope expansion or new authority; genuinely unavailable required information, permission, or credential blocks progress; or there is an explicit request to stop. These boundaries preserve applicable safety, access, and authorization controls.

When the execution environment or security sandbox presents an approval gate, do not add a redundant conversational approval request; use the environment's gate directly. The gate remains authoritative, and this rule never bypasses a required approval.

## Transfer rationale

The rule is transferable because routine reversible execution, owner follow-up input, and harness approval gates recur across Chat, Work, local/agent execution, and browser/computer-use tasks. The consolidated rule separates environment-enforced approval from owner judgment, reduces approval chatter and acknowledgment-only stalls, and makes durable plans and recovery checkpoints executable without broadening authority.

## Limits

This rule does not broaden scope or authority and does not turn a genuine owner decision into an implementation detail. It preserves all stronger protections: materially different viable choices with consequential tradeoffs, actions that are destructive or difficult to reverse, publishing, sending communications, purchases or spending, security, account, or privacy consequences, material scope expansion or new authority, genuinely unavailable required information, permission, or credential, and an explicit request to stop. It remains subordinate to current explicit owner instructions, environment-enforced approval gates, and applicable safety requirements.

## Projection and verification

- Root agreement: `AGENTS.md`
- Universal operational pattern: `patterns/codex-github-operating-system.md`
- Reusable root-agent template: `templates/AGENTS-CODEX.md`
- Reusable universal bootstrap template: `templates/AGENTS-UNIVERSAL-BOOTSTRAP.md`
- Lesson route: `LESSON-INDEX.md`
- Causal regression: `tests/test_universal_next_step_rule.py`

Test-first evidence is exact: at test-only head `9d6687ed7ba3334efc333b77bd6c1c0817573979`, Universal architecture tests run `31856407051` / job `94941896599` failed because the projections and audit were absent (63 tests ran; 31 assertion failures and 2 missing-file errors), while Repository policy run `31856407065` succeeded. Code-bearing head/tree `3dfe834b718520457833a19953c4f7b573ec25f1` / `350c3b879a673436661a1e046d9e1bc51e778b86` then passed Universal architecture tests run `31856554150` / job `94942298836` with 63/63 tests and audit summary 0 errors, 3 truthful hosted-control warnings, and 0 informational findings; Repository policy run `31856554153` / job `94942299028` also succeeded. The final evidence-only head must retain green checks before review or merge.

The regression is a documentation-contract check. The 2026-08-28 extension adds every governed surface, the routine-action examples, the complete judgment/safety boundaries, the universal bootstrap projection, and the no-duplicate-conversational-approval rule. It can prevent accidental removal of that contract, but it cannot prove that an unobserved worker will apply the rule correctly or override an execution environment that independently requires approval.
