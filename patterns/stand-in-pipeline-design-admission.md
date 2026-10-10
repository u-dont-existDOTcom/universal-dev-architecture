# Design admission for pipelines whose model output stands in for a source

## Status

Current universal pattern, added 2026-10-09 at the owner's request after one project's incident (see **Transfer rationale and limits**). It adds a design-time check and an owner question. It lowers no gate an owner or project has declared.

## Problem

A project needed its assistant to use a person's private journal. The import that was built had models rewrite the journal into statements: facts, episodes, people and patterns. Model judges then checked each statement against the source, and a calibration gate decided whether the import could go on. Over about a week, the gate needed one fix after another:

- fidelity repairs;
- scoped re-reviews;
- a pooled gate;
- a critical-miss limit;
- a second judge.

Each fix was reasonable on its own. The calibration round still finished only a few units an hour, out of more than a thousand.

The simplest design was never measured against it: keep the person's words as the record, index where they are, and quote them when they're needed. Measured afterwards, that baseline found quotes in about a tenth of a second per call at the journal's real size. It needed no model calls to build. A paraphrase that isn't written can't be distorted, so nothing was left for the judges to guard. The rules that should have caught this existed:

- benchmark against strong baselines, and stop when a homemade method needs patch after patch (`patterns/research-before-reinvention.md`);
- keep exact source wording apart from interpretations (`patterns/source-interpretation-provenance.md`).

Nothing applied them to a system's design before it was built, or when its fixes kept coming. A design proposal also named its cost only as a direction, "more reading per conversation", and the owner had to ask whether that meant minutes per reply. Measured, a search took about a tenth of a second, and reading its quotes adds an estimated second.

## Rules

A **stand-in pipeline** writes model output that later readers use in place of a source. Examples:

- summaries;
- extracted facts or claims;
- a knowledge graph built by extraction;
- translations;
- transcripts tidied by a model;
- profiles built from records.

1. **Measure the simplest baseline first.** Before building a stand-in pipeline, write down the use-time baseline: keep the source as the record, and retrieve its exact words when they're needed. Measure the baseline on a pilot, or on a synthetic set the size of the real one:
   - the time per use, such as per reply;
   - the cost per use;
   - whether sample questions find the passages they should.

   A model-written layer is admitted only for a named need the baseline measurably fails. A latency over budget is one such need. A kind of question that retrieval can't answer is another.
2. **Keep model output as pointers, not records.** An admitted layer points at exact source spans: tags, labels, links and anchors used to find passages. Answers still read the source. A model-written statement never becomes the record a reader relies on without the quote beside it.
3. **Check mechanically what a program can.** Some properties a program can check:
   - an exact anchor;
   - negation, hedges, dreams, wishes and plans in the wording;
   - dates;
   - names.

   A program checks these, and model judges decide only what a program can't.
4. **Measure a judge before a gate rests on it.** Two independent judgments on the same sample record how often they agree. A gate that counts a judge's verdicts uses a measured agreement, or uses both judges, or a person (`patterns/convergent-review-acceptance-gates.md`).
5. **Sample like the whole, and stop when the sample settles it.**
   - Calibration samples are drawn at random from a recorded seed and checked in random order, with hazards stratified and reported apart.
   - A confidence bound stops the sample once pass or fail is settled.
   - A fixed, hand-picked set checked in page order, with a zero floor, is not a sample of the whole.
6. **Put numbers on a design before it launches.** A design proposal states its costs as numbers at full scale:
   - seconds per use;
   - hours or days for the whole run;
   - tokens or money;
   - each figure measured or bounded, and labeled as one or the other.

   A direction such as "more reading" or "slower" is not a cost. The owner sees these numbers with the design, before the build.
7. **Reopen the design when the fixes keep coming.** A third fix in a row to the same stage or gate of a stand-in pipeline starts this admission check again, against the baseline in rule 1, before the next fix. The repeated patching that `patterns/research-before-reinvention.md` names becomes a count anyone can see.

## Bounds

- **No build without the owner's decision.** An agent doesn't start building a stand-in pipeline that fails rule 1, 2 or 6. Instead it puts the design on the owner questions page (`patterns/owner-questions-page.md`), with the measured baseline, the numbers, and a recommendation.
- **A running pipeline isn't stopped by this pattern.** One that fails these rules goes on the owner questions page as a redesign proposal, with what it would cost to switch and what work carries over. It runs as declared until the owner decides.
- **Declared gates stay.** A gate the owner or the project declared is run as declared and changed only by them (`patterns/owner-goal-followup-and-requirement-accretion.md`, **Declared gates are not accretion**).

## Failure condition and repair

Failure condition, any one of:

- a stand-in pipeline is built, or its first full run starts, with no measured baseline;
- a model-written statement is shown to a reader as the record, without its source span;
- a gate counts one model judge's verdicts with no measured agreement;
- a design or redesign proposal names a cost only as a direction;
- a fourth fix in a row lands on the same stage or gate with no admission check after the third.

Repair:

1. Stop adding fixes to the stage.
2. Measure the baseline in rule 1.
3. Put the comparison, with full-scale numbers, on the owner questions page, with a recommendation.
4. Keep any work that carries over. For example, an extraction can seed the pointers in rule 2.

## Relationship to other patterns

- `patterns/research-before-reinvention.md` requires strong baselines and treats repeated patching as a signal. This pattern names the baseline for stand-in pipelines (rule 1) and makes the signal a count (rule 7).
- `patterns/source-interpretation-provenance.md` keeps exact source wording apart from interpretations when an agent reasons about a source. Rule 2 applies the same rule to a system's design.
- `patterns/convergent-review-acceptance-gates.md` owns how a gate over a model reviewer behaves once one exists. Rules 3 to 5 decide whether the gate should rest on a model at all, and on what sample.
- `patterns/development-assurance-lanes.md` requires expensive validation to name the decision it can change. Rule 6 asks the same of a design's costs before launch.
- `patterns/owner-questions-page.md` owns where the decision goes.

## Requirement-accretion declaration

- **Origin:** `OWNER`, 2026-10-09: "make sure you send the lessons to UDA because UDA should have blocked this stupid design from the beginning... altho make sure first this is actually scalable because you said it would take more time to search. if it takes like a few minutes to do each reply that's not good".
- **Decision it changes:** whether a stand-in pipeline is built at all, how it is gated, and what numbers the owner sees before it launches.
- **Why the simpler standard is insufficient:** the existing rules fire when an agent reasons about a source or picks a method. They didn't stop a system design that replaced a source with model output, or a run of fixes to its gate. The owner also had to ask for the cost in numbers.
- **Why it is scoped:** it applies only to stand-in pipelines. It adds one measurement before the build, and one owner question when a design fails it.

## Transfer rationale and limits

Promoted from one project's journal import. The project's own evidence stays in its repository.

- **The baseline needs the source.** Where the source can't be kept, for example when it must be deleted after processing, the stand-in is the only record. Then rules 3 to 6 still apply and rule 2 does not.
- **Some uses need no source words.** Aggregate counts and trend charts are examples. A layer built only for such uses is not a stand-in, because no reader relies on it for what the source says.
- **Retrieval has its own failure.** It can miss a passage a reader needed. Rule 1 measures recall on sample questions for that reason, and an admitted pointer layer exists to raise it.
- **Timings depend on the system.** The figures in **Problem** come from one project's storage and machine, and are an example, not a budget.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

InnerSignal's journal import (`u-dont-existDOTcom/innerSignalGraph`) had extracted and calibrated about a hundred of its 1,188 units. Its quote-first design is in that repository's plan `docs/superpowers/plans/2026-10-09-journal-quote-first.md`. The design indexes exact paragraph quotes with the date line each was written under, and adds mechanical wording cues (dream, wish, plan, hypothetical, negation, hedge, reported speech) at read time. A synthetic journal the real journal's size answered a quote search in about 0.1 seconds at the median, and in about 0.2 seconds at the slowest, on two CPUs.
