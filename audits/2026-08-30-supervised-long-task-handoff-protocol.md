# Supervised long-task handoff protocol provenance — 2026-08-30

## Owner rule and decision

Joel established a cross-project protocol for long work that needs supervision. Chat remains the owner-facing supervisor and GitHub remains canonical. Before a fresh Codex worker begins, the task instructions and a full self-contained recovery handoff must be durable in GitHub, and the owner receives one very short paste-ready bootstrap instruction. When higher-level supervision is needed, a new Pro chat in Brave receives the complete context directly because it cannot reliably access GitHub. A supervisor that must access GitHub uses GPT with extra-high reasoning instead; work that does not justify Pro also defaults to extra-high.

Pro is the domain default for therapy or clinical-conceptual considerations in therapy-bot work and for research-methodology or scientific considerations in AskRigor work. Article work normally uses extra-high without Pro unless unusually complex. A Pro finding pauses work only when it exposes a genuine owner decision with material tradeoffs. Otherwise the worker applies the guidance, records the result in GitHub, and continues without asking the owner to approve continuation.

## Transfer rationale

Long supervised work can fail through context loss, a non-resumable worker handoff, a supervisor that cannot retrieve repository state, or unnecessary owner routing questions. The protocol separates transient supervision from durable authority, makes the context transfer explicit, and defines a continuation default. The domain defaults are owner-specific workflow preferences, not empirical claims that one model is universally superior in those domains.

## Limits and stronger constraints preserved

The complete handoff remains subject to current authority, secret, privacy, confidentiality, copyright, access, and data-sharing rules. It must not copy prohibited material merely to become self-contained. The protocol does not broaden task scope, credentials, spending, publication, destructive-action, or irreversible-change authority. A worker still pauses at any stronger existing boundary. If Brave or Pro is unavailable, the worker records that exact failure, uses an adequate available extra-high route, and continues; it pauses only when required supervision remains unavailable or another genuine pause boundary applies.

## Projection and verification

- Root agreement: `AGENTS.md`
- Canonical operational pattern: `patterns/codex-github-operating-system.md`
- Reusable root-agent template: `templates/AGENTS-CODEX.md`
- Compact universal bootstrap: `templates/AGENTS-UNIVERSAL-BOOTSTRAP.md`
- Lesson route: `LESSON-INDEX.md`
- Documentation-contract regression: `tests/test_supervised_long_task_handoff_protocol.py`

The regression verifies durable projection and the decision/routing vocabulary. It cannot prove that a browser surface is available, that a model label remains unchanged, or that a future worker has supplied substantively complete context.
