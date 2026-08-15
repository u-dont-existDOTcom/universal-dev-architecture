# Universal next-step continuation rule provenance audit — 2026-08-15

## Decision and source

Joel supplied the standing cross-project rule in the active task: “don't just give me one sentence keep going that's a universal rule always next step.” This is owner-authored operational policy. Its durable operational meaning is:

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

## Transfer rationale

The rule is transferable because answers, corrections, uploads, and requested clarifications commonly arrive during unfinished work in any repository or project. They change the active task state; they are not, by themselves, evidence that the requested outcome is complete. Continuous next-step advancement reduces acknowledgment-only stalls and makes durable plans and recovery checkpoints executable.

## Limits

This rule does not broaden scope or authority and does not turn a genuine owner decision into an implementation detail. It preserves the pause boundaries named above: genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, and explicit request to stop. It also remains subordinate to current explicit owner instructions and applicable safety requirements.

## Projection and verification

- Root agreement: `AGENTS.md`
- Universal operational pattern: `patterns/codex-github-operating-system.md`
- Reusable root-agent template: `templates/AGENTS-CODEX.md`
- Lesson route: `LESSON-INDEX.md`
- Causal regression: `tests/test_universal_next_step_rule.py`

Test-first evidence is exact: at test-only head `9d6687ed7ba3334efc333b77bd6c1c0817573979`, Universal architecture tests run `31856407051` / job `94941896599` failed because the projections and audit were absent (63 tests ran; 31 assertion failures and 2 missing-file errors), while Repository policy run `31856407065` succeeded. Code-bearing head/tree `3dfe834b718520457833a19953c4f7b573ec25f1` / `350c3b879a673436661a1e046d9e1bc51e778b86` then passed Universal architecture tests run `31856554150` / job `94942298836` with 63/63 tests and audit summary 0 errors, 3 truthful hosted-control warnings, and 0 informational findings; Repository policy run `31856554153` / job `94942299028` also succeeded. The final evidence-only head must retain green checks before review or merge.

The regression is a documentation-contract check. It can prevent accidental removal of the rule and its boundaries, but it cannot prove that an unobserved worker will apply the rule correctly.
