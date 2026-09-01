# Attractor diagnosis-control experiment

GPT already knows what it is doing wrong in the recurring Somatic prose failures. It can accurately name the polished symmetry, explanatory closure, abstraction, and semantic orbit, then generate them again. The missing capability is not diagnosis. Ordinary generation remains strongly attracted to a learned high-probability continuation basin.

This experiment therefore does **not** reward self-critique, add another critic, compare Claude with GPT, or stage a model debate.

## What Stage 1 actually tests

Stage 1 tests one narrower possibility: inherited conversational or workflow state may make the learned attraction even stronger by anchoring every new output to previous candidates, critiques, counters, and expected conclusions.

Two arms receive the same exact model request:

- **Direct fresh process:** one new execution process and empty task-local state per candidate.
- **n8n isolated execution:** one new workflow execution per candidate, with immutable input, no workflow static data, no memory, no sibling output, and no retry carrying prior prose.

The same exact model, mode, writer input, semantic seed, candidate count, word band, and blind evaluator are held fixed. n8n can improve process isolation and provenance. It cannot by itself change model weights, activations, logits, decoding objective, or learned continuation probabilities.

Hermes is not an immediate arm. A memory-disabled isolated Hermes profile duplicates the execution-isolation variable without supplying a distinct generative-control mechanism. Reopen Hermes only for a specific search, decoding, activation, or external-signal capability that a thinner runner cannot implement.

## Quality-diversity procedure

Before execution, assign each matched run a behavior cell. Runs do not see the archive. After generation, a non-authoritative classifier records structural descriptors and similarity to occupied cells. A blind evaluator then freezes PASS, FAIL, or UNCERTAIN from the literal prose. The owner remains the final editorial authority.

The archive keeps at most one current elite per behavior cell, selected first by semantic fidelity and then by blind editorial result. Diversity metrics are length-controlled and never substitute for prose judgment.

Accurate post-hoc diagnosis, agent agreement, model disagreement, and cosmetic wording variation around the same closure family do not count as progress.

## Required provenance

Each run must record:

```text
run_id
arm
orchestrator version
model provider and exact model/mode if verified
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

## Stage 1 decision boundary

- n8n is a semantic candidate only if it materially improves blind editorial pass rate or occupied behavior-cell coverage without reducing semantic fidelity.
- Better logging or cleaner execution boundaries with no prose improvement justify, at most, an infrastructure role.
- If both arms yield zero genuine passes, or the same broad failure family appears in at least 75 percent of outputs, reject orchestration as the primary remedy.

## Required next stage after shared failure

A shared failure moves the work below ordinary natural-language self-instruction, toward one or more of:

- diversity-aware or avoidance-aware decoding;
- activation or representation steering on an open model;
- preference adaptation or fine-tuning from accepted and rejected examples;
- quality-diversity search with external selection;
- owner-authored or owner-spoken source transformation rather than free reconstruction.

Do not respond to shared failure with another critic, explanation, persona, prohibition list, model debate, or longer prompt.

## Stop rules

- Do not add another model because an arm fails.
- Do not feed failure explanations or self-diagnosis into later writer prompts.
- Do not retry a run with previous execution data.
- Do not run Pangram unless a separate owner-authorized protocol permits it after a genuine cold pass.
- Stop after the fixed 16-candidate diagnostic budget.
- A null isolation result is informative and ends orchestration-first experimentation.