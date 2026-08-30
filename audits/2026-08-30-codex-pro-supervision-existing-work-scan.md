# Existing-Work Scan: Codex–Pro Supervision Mission Control

**Date:** 2026-08-30  
**Decision:** Reuse + adapt + compose; invent only the supervision bridge and objective-drift layer.

## Independent conception preserved

The original design was four or more Codex workers emitting structured heartbeats to separate Pro supervisors, all summarized on a local dashboard that detects objective drift rather than merely activity. Pro web chats cannot be assumed to access GitHub, and the dashboard must remain an audit surface rather than another autonomous supervisor.

## Solved

- OpenAI Symphony: issue-driven dispatch, isolated workspaces, App Server execution, concurrency, continuation, retries, reconciliation, tracker adapters, host-side tracker tools, and basic observability.
- OpenAI harness engineering: repository-local authority, agent-legible environments, tests, guardrails, worktree isolation, and human intent/acceptance criteria.
- Linear: rich workflow states, dependencies/blockers, priorities, and human-operable task state.
- GitHub: durable contracts, code, history, pull requests, CI, and evidence.
- Anthropic agent-evaluation practice: deterministic + model + human graders; structured rubrics; `Unknown`; calibration; outcome and trajectory review.
- Anthropic long-running harness practice: Git checkpoints, progress artifacts, clean handoffs, and end-to-end testing.
- OpenTelemetry: emerging common vocabulary for agent, workflow, plan, and tool telemetry.

## Partially solved

- Runtime dashboards exist, but do not make owner-intent fidelity their primary operator signal.
- Model judges can assess semantic work but remain biased and need exact evidence, multidimensional rubrics, and calibration.
- Long-running recovery exists, but some Symphony reference state is in-memory.
- Parallel agent teams work when tasks are separable, but shared bottlenecks and global-objective drift remain risks.

## Not supplied as an existing product

- A self-contained GitHub-to-Pro evidence bridge when the Pro web chat cannot reliably retrieve GitHub.
- An optional Extra High reader constrained to evidence retrieval rather than judgment.
- Persistent Pro supervisor association per durable task.
- Objective-drift taxonomy and score dimensions.
- Owner-decision gating and automatic continuation after the decision.
- An attention-first dashboard combining Codex, tracker, GitHub, reader, and Pro state.

## Build decision

- **Reuse:** Symphony, Linear, GitHub, App Server, CI, OpenTelemetry vocabulary.
- **Adapt:** artifact handoffs, independent evaluator separation, trajectory evaluation, risk-adjusted assurance.
- **Compose:** deterministic collector -> optional Extra High dossier -> Pro review.
- **Invent:** packet/review protocols, drift taxonomy, owner-attention projection.
- **Experiment:** whether Extra High materially improves completeness over deterministic packets.
- **Do not build:** custom scheduler or workflow engine until stock Symphony fails a documented requirement.

## Strongest baseline comparison

The new system must be benchmarked against:

1. stock Symphony + its dashboard;
2. deterministic GitHub packet directly to Pro;
3. Pro attempting direct GitHub retrieval;
4. deterministic packet + Extra High dossier to Pro.

The custom layer is justified only where it improves drift detection, evidence completeness, owner-interruption burden, or recovery without degrading execution reliability.
