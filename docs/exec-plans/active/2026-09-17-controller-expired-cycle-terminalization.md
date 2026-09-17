# Controller expired-cycle terminalization and capability-gate correction

Status: CANDIDATE READY — UNMERGED

Assurance lane: release candidate for an unmerged reviewable PR. Targeted hard gate: no send/admission ambiguity may be erased by terminalization.

## Owner outcome

`OPEN`. The remaining root gap is one successful fresh PM-mediated controller fixture at the real consumer seam. This repair removes two generating blockers without performing the fixture or any capability probe.

## Active lesson contract

- Owner correction: preserve the exact expired cycle evidence, terminalize only when central and local ambiguity are clear, and never revive it from a late artifact. Failure is any deletion, replay, or terminalization across unresolved admission/send evidence. Enforcement: mechanical focused tests plus diff review.
- Requirement-accretion gate: the three-current-receipt prerequisite is assistant-inferred and has no established material-safety necessity. Failure is retaining it as a mandatory blocker without naming a distinct unsafe action. Repair is to restore the simpler direct consumer-seam path. Enforcement: semantic code-path analysis plus focused relay regression.
- Test efficiency: run focused tests during implementation and one release checkpoint only after the candidate is stable. Failure is redundant unchanged full-suite reruns. Enforcement: `scripts/test_efficiency.py`.
- Owner-outcome traceability: tests, a PR, and a terminalization receipt are supporting evidence; the root outcome remains open until the live fixture succeeds. Enforcement: requirement record, current state, and final owner brief.
- No live capability probe, no production mutation, no merge. Enforcement: execution receipt and Git/GitHub state readback.

## Smallest implementation plan

1. Add a second truthful controller terminal step for route expiry, entered only after a fresh central scheduler read proves ledger integrity and no unresolved admission, open target transition, or safety halt, and local controller evidence contains no unresolved send/Retry boundary.
2. Preserve the prior step and all send, recovery, admission, and artifact evidence; make repeat terminalization idempotent and make terminal state short-circuit before artifact reconciliation.
3. Treat both successful completion and safe expiry as terminal for duplicate-request and ordinary relay admission, while preserving successful `COMPLETE` behavior unchanged.
4. Remove the per-chat capability-receipt check from ordinary route admission. Keep the explicit capability command and diagnostic state, while relying on the already-required exact registration, target/window, provider-session, controls, app selection, central admission, and direct seam receipts.
5. Add focused regressions for every owner-named case and the direct admission path without current capability receipts.
6. Update the requirement, current state, and a plain-English execution receipt; run release gates once; review the exact diff; open an unmerged PR.

## Stop conditions

- Any unresolved central admission, safety halt, target transition, local send intent/click ambiguity, or in-flight crossed boundary remains.
- A safe terminalization would require deleting or rewriting historical evidence.
- Removing capability receipts exposes an unsafe destination or authority action not already fail-closed by the existing exact controls.
- Login/MFA, wrong-account, missing-chat, privacy/security, production, or new owner-authority boundary appears.

## Next direct evidence

Focused tests must show safe expiry is terminal and non-monopolizing, unsafe expiry remains nonterminal, repeated calls do not mutate the receipt, late artifacts are ignored, completed cycles are unchanged, and a route lacking current capability receipts reaches the existing direct binding-preload boundary rather than a manufactured preflight blocker.

## Candidate result

- Safe expiry now records a separate `EXPIRED` terminal state only after a fresh central integrity read proves there is no unresolved admission, target transition, or safety halt and local evidence proves there is no unresolved send/continue/Retry boundary.
- The terminal receipt records the prior step, expiry, prior error, central clearance, last admission identity, send summaries, and consumed artifact identities without deleting the original cycle evidence.
- `EXPIRED` short-circuits before route or artifact reconciliation, so repeat calls are idempotent and a late artifact cannot revive the cycle. Both relay admission and duplicate-request checks treat it as terminal.
- The three-chat capability receipt state remains visible as a diagnostic, and the explicit capability commands remain available. It is no longer an ordinary-route prerequisite because it prevents no unsafe action that is not already rejected at the direct consumer seam.
- Focused regressions and the complete relay suite pass. The deterministic repository audit is error-free. Canonical `main` currently has 10 unrelated Work model-routing policy-suite failures, also reflected by its red hosted repository-compliance run; this focused candidate does not absorb that separate repair. No live capability probe, provider send, production change, deployment, merge, or fixture occurred.
