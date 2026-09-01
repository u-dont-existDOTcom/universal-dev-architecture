# Attractor-independence experiment

This experiment tests orchestration-induced state independence without changing the model family. It is not a Claude-versus-GPT tournament and contains no writer/critic debate.

## Why this experiment exists

The prior n8n evaluation tests pass-through event parity. The prior Hermes experiment tests continuity after restart, offline return, and handoff. Neither asks whether isolated orchestration changes the distribution or editorial quality of prose. This experiment fills that gap.

## Causal comparison

The direct runner, n8n, and Hermes receive the same immutable candidate request. The only intended difference is the execution boundary and state carrier.

- Direct: fresh process and empty task-local directory.
- n8n: one independent workflow execution; no static workflow data, previous execution data, retries, or shared candidate store in the writer path.
- Hermes: one isolated profile or child session; memory, user profile, external memory provider, and session search disabled; no parent transcript injected into the writer.

The candidate sees only the minimal writer packet. The orchestrator records identity and transport facts but cannot interpret the owner direction, grade prose, select a winner, or edit the candidate.

## Quality-diversity procedure

Before execution, assign each run a behavior cell. Runs do not see the archive. After generation, a non-authoritative classifier records structural descriptors and similarity to occupied cells. A blind evaluator then freezes PASS, FAIL, or UNCERTAIN from the literal prose. The owner remains the final editorial authority.

The archive keeps at most one current elite per behavior cell, selected first by semantic fidelity and then by blind editorial result. Diversity metrics are length-controlled and never substitute for prose judgment.

## Required provenance

Each run must record:

```text
run_id
arm
orchestrator version
model provider/family/mode if verified
exact writer-packet SHA-256
semantic-seed SHA-256
behavior-cell assignment
started_at / completed_at
candidate SHA-256 and exact text
candidate word count
all inherited-state flags
memory/session-search state
blind-evaluation message receipt
cost and latency when exposed
```

Unknown runtime or inherited state invalidates the run rather than being guessed.

## Stop rules

- Do not add another model because an arm fails.
- Do not feed failure explanations into later writer prompts.
- Do not retry a run with previous execution data.
- Do not run Pangram unless a separate owner-authorized protocol permits it after a genuine cold pass.
- Stop after the fixed budget.
- If no arm yields a pass or credible coverage improvement, move to owner-speech or owner-authored source transformation.
