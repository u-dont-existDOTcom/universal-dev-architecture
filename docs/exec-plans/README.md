# Execution plans

Complex, multi-session work is tracked here so a fresh worker can recover intent, decisions, progress, validation, and next actions without the old chat.

- Active plans: `active/`
- Completed plans: `completed/`
- Superseded plans retained for provenance: `superseded/`

Move a plan to completed only after final verification and closeout are recorded. Move an overtaken plan to superseded with an explicit pointer to its replacement. Current project requirements and verified repository state outrank a stale plan.
