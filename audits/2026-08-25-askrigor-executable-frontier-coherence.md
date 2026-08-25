# AskRigor executable-frontier coherence promotion

## Source

- Origin repository: `u-dont-existDOTcom/AskRigor`
- Source PR: #98
- Source candidate commit:
  `0f706fcb07c37eea14267688715d091ccba72f1f`
- Source merge commit:
  `ab2433c5d774081dff4fecb2f78600b213b250a2`
- Source plan:
  `docs/superpowers/plans/2026-08-25-phase-k-terminal-discovery-and-finalization-repair.md`
- Date: 2026-08-25

## Failure

A real Custom GPT acceptance replay reached unfinished controller state with no
next capability. The client projected finalization, which the server correctly
denied. Sanitized checkpoint inspection showed that a later terminal provider
failure had contradicted a useful retained discovery frontier and prevented an
independent native discovery lane from running. Separate review then found that
blocked deterministic operations were recorded as complete and that an
all-terminal/no-candidate case threw instead of returning stable controller
state.

The checked-in Gemini/Spark worker skill was not the main breadth defect. A
compact API overlay weakened it by asking for too few candidates and less
reasoning effort.

## Transferable lesson

The failure is not specific to health research or YouTube. In any
server-controlled multi-stage workflow, a nonfinal state needs a coherent
executable frontier or an explicit terminal boundary. Operation state, retained
partial frontier, client projection, and transition receipts must agree.
Integration wrappers must be tested together with the specialist contract they
wrap.

## Causal regression paths

AskRigor PR #98 adds hostile coverage for:

- terminal external scouting followed by native discovery;
- retained frontier reconciliation after a later terminal failure;
- retryable work that cannot be bypassed;
- no `CONTINUE_RESEARCH` to finalize mapping;
- stable public terminal/no-candidate output;
- truthful blocked-terminal transition traces;
- server-derived required module execution; and
- compact Gemini breadth and reasoning defaults.

The exact source candidate passed the complete deterministic AskRigor gate:
typecheck, 1,383 tests with six declared skips, and production build. An
independent focused re-review passed 25/25 and found no remaining issue in the
three reviewed repair paths.

PR head checks passed in deterministic run `32886699690`, workflow-policy run
`32886699278`, CodeQL run `32886692801`, and the separate CodeQL check
`97928835154`. PR #98 then merged on 2026-08-25 as
`ab2433c5d774081dff4fecb2f78600b213b250a2`.

## Disposition

Promoted to `patterns/executable-frontier-coherence.md` because the control-flow
and integration-composition rules apply across agentic research, deployment,
ingestion, migration, and evaluation systems.

## Limits

- AskRigor's provider and module applicability policy is not promoted.
- A terminal lane does not universally authorize a bounded answer.
- Product deployment and real Custom GPT acceptance remain AskRigor release
  gates; this universal promotion does not claim they have passed.
- The pattern enforces coherent state and liveness, not semantic truth.
