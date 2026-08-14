# Universal coordination rule provenance audit — 2026-08-14

## Decision and source

Joel supplied the standing cross-project owner rule in the active task: when multiple safe in-scope execution approaches achieve the same outcome, automatically choose the better-coordinated approach without asking the owner to select an execution mode. Better coordination means isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable, and serialize shared mutable state.

## Evidence type and limits

This is owner-authored operational policy, not an external, canonical, anecdotal, or independently validated finding. It is directly authoritative for coordination choices, but it does not broaden task authority and does not replace substantive owner decisions. Standing grant: delegation, subagents, and parallel investigation are permitted when they improve coordination without conflicting writes, and only as paired delegation plus independent review when safely separable. Shared mutable writes are serialized. It does not authorize a new product decision, external communication, credentials or access changes, spending, publication, destructive action, or irreversible data change.

## Projection and verification

- Root agreement: `AGENTS.md`
- Universal operational pattern: `patterns/codex-github-operating-system.md`
- Reusable root-agent template: `templates/AGENTS-CODEX.md`
- Causal regression: `tests/test_universal_coordination_rule.py`

The regression requires every projection to retain the execution-mode boundary, all four coordination mechanisms, and both authority limits. It is a documentation-contract check; it cannot prove that a future worker will apply the rule correctly in an unobserved task.

Independent review of the initial candidate found that its detailed projection could detach delegation from independent review. The follow-up causal regression and paired-permission wording close that gap.
