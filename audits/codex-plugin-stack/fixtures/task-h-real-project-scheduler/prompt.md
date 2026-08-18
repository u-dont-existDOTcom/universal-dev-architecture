# Task H — real-project crash-resilient schedule runner

Work in this real historical snapshot of `universal-dev-architecture` (146 tracked files, roughly 24,000 lines). Implement a crash-resilient batch scheduler for the existing Codex plugin benchmark. This is an implementation task; do not stop for design approval or ask the owner to choose an execution mode.

The feature has three integration surfaces: scheduler core, CLI wiring, and regression tests. You may use independent agents only where they genuinely help. If the current condition exposes Codex Coordinator, explicitly activate it and use its shared-checkout claim board only when runtime task identifiers and safe ownership boundaries are actually available; otherwise proceed autonomously with parent-local agents or serial work.

Requirements:

1. Add `scripts/codex_plugin_benchmark/scheduler.py` with this public function:

   `run_schedule(schedule_path: Path, output_root: Path, codex_root: Path, model: str, reasoning_effort: str, timeout_s: float) -> list[dict[str, object]]`

2. A schedule is JSON containing a `trials` list. Each entry has `task_id`, `condition_id`, and positive integer `repetition`. Reject malformed schedules before invoking any model run.
3. Execute remaining trials synchronously in schedule order through the existing `run_trial(TrialSpec(...))`. Do not detach work, use Process Jobs, or return while an owned trial is running.
4. Write an atomic recovery ledger after every trial decision/result at `<output_root>/schedule-ledger-<schedule filename stem>.json`. Every entry records `run_id`, one-based `schedule_index`, and `state`.
5. Resume safely:
   - if `<output_root>/<run_id>/metadata.json` exists and has `terminal: true`, record `skipped-existing-terminal` and do not invoke `run_trial`;
   - if the run directory exists without terminal metadata, move it intact under `<output_root>/excluded/` using a collision-safe name that contains the run ID, then rerun that trial;
   - never overwrite or delete incomplete evidence.
6. Catch ordinary per-trial exceptions, record `runner-exception` plus `error_type` and a bounded `error`, persist the ledger, and continue later trials. Redact values attached to case-insensitive `token=`, `key=`, or `secret=` markers from the persisted error, and never serialize a full environment.
7. Add `run-schedule` to the existing CLI with `--schedule`, `--output`, `--codex-root`, `--model`, `--reasoning-effort`, and `--timeout`. Defaults must match the existing single-run command. Exit zero only when every entry is `completed` or `skipped-existing-terminal`; otherwise exit nonzero after finishing the schedule.
8. Add focused tests for validation, ordered execution, terminal skipping, incomplete-evidence relocation, exception continuation, ledger naming/content, and CLI exit behavior. Preserve all existing commands and behavior.
9. Run the focused tests and the full repository unit suite. Inspect the final diff before claiming completion.
