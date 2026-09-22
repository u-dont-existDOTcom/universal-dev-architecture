# Jev shadow precedence correction

- Owner outcome: continue low-cost Jev testing.
- Assurance lane: iteration, escalating to release only if the tested correction is merged.
- Live discovery: a current sanitized worker state combines an OPEN MANUAL_INTERVENTION_REQUIRED owner action with outcome_advancement UNKNOWN.
- Deterministic Mission Control order checks terminal and owner/blocker gates before project validity from SOURCE_MISSING/UNKNOWN.
- The first calibrated Jev action prompt put project validity too early and would therefore disagree on this conflict.
- Fix: preserve chain-invalid as highest integrity gate, then terminal, owner gate, external gate, project validity, mechanical recovery, reasoning review, stalled strategy, continuity gap, healthy.
- Jev remains shadow-only/non-authoritative.
- Privacy: only enum/boolean control-plane fields may be sent to Jev.
- Additional spend for this correction remains under USD 0.01.

## Calibration result

- Live daemon readiness: event chain valid, submission-authority ledger valid, ACTIVE_LEASE.
- Central runtime was not restarted or changed; OpenRouter credentials were not copied to the server.
- Six synthetic precedence-conflict cases plus the two sanitized live states were sent through OpenRouter Jev.
- Live degraded state was repeated three times: notify_owner every time, choice probability 0.98-0.99, owner-decision probability 0.97.
- Live healthy state was repeated three times: no_action_healthy every time, choice probability 0.99-1.00, owner-decision probability 0.04-0.05.
- Total corrected-precedence canary: 12/12 expected actions, average observed latency 639.6 ms, cost $0.000609756.
- Cumulative Jev calibration spend from the start of testing is approximately $0.005622582.
- Focused Jev tests: 7/7 PASS.
- TypeScript typecheck: PASS.
- Repository tests: 388/388 PASS.
- Deterministic audit: 0 errors; one pre-existing AGENTS-size warning.
- Exact-head full Mission Control tests/build are delegated to normal hosted PR CI to avoid duplicating the just-completed local full suite on the immediately preceding revision.
