# Convergent acceptance gates over noisy reviewers

## Status

Current universal pattern, promoted 2026-10-03 from one project's incident (see **Transfer rationale and limits**). It adds no gate to any project and does not lower a gate that the owner or a project has declared.

## Problem

A pipeline that accepts a work unit only when a language-model reviewer reports zero findings, and re-reviews the whole unit after every repair, can fail to converge. Reviews vary from run to run, so each repair fixes what one review flagged and the next review flags something else.

In the originating case, findings per cycle ran 2, 3, 4 in one run and 5, 1, 3 in another. One repair by a stronger model reached zero findings, and the next reviewer, an audit that every reference item was kept, still called five items unsupported.

Two mechanisms produce this:

- **The gate rejects correct work.** Suppose each item in a correct unit of n items draws a false flag independently with probability p. The unit then passes a zero-finding gate with probability (1 - p)^n. With p = 0.05 and n = 27 that is about 25%. Requiring all N units to pass multiplies the chances: if each unit passes with probability q, all N pass with probability q^N. Even q = 0.99 gives 0.99^162, about 20%, across 162 units.
- **Whole-unit re-review draws new false flags.** Each full re-review is a fresh draw, and it covers items that already passed and did not change. Repairs can end up chasing the reviewer's variance instead of the unit's defects.

## Rules

1. **Re-review the change, not the whole unit.** After a repair, send the reviewer only the earlier findings and the items the repair changed. Carry forward every item that passed and did not change. Give each item a stable ID when it is first produced, and match items to their earlier verdicts mechanically, by ID and exact content (a hash is enough), never by asking the reviewer. An item whose ID or content does not match counts as changed.
2. **Bound the repairs and degrade by item.** Fix the number of repair cycles before the first cycle runs. When the repairs run out, withhold only the items still flagged and mark them for review, keep every other item, and record each omission that is still flagged (a reference item the reviewer says the output lacks) as a gap in the output. Do not discard the unit, and do not halt the pipeline: one unit's leftover flags never stop units that do not depend on it. A unit that consumes or checks the withheld items waits until they are reviewed, or runs without them and records the gap; it never treats them as accepted.
3. **Gate on aggregates with hard floors.** Accept a run on aggregate measures with floors stated in advance, not on every unit reaching zero findings. An example set is pooled recall against a frozen reference (the share of all reference items, across all units, that the output kept) at or above a stated level, plus zero critical misses. Where units are not interchangeable, because each customer, source or experiment must keep its own required items, add a per-unit or per-stratum minimum to the floors: a pooled measure lets strong units hide one that kept nothing. Freeze the reference before the gate runs, and never trade a hard floor against another measure. Report the failed units and the error counts beside the aggregate, each measure on its own line, so a passing aggregate hides neither.
4. **Estimate the false-failure rate before running at scale.** Before a gate runs over many units, estimate how often it will fail correct work, using the formulas in the Problem section. Take p from a pilot on units independently known to be correct (the frozen reference, for example), or from earlier cycles' records only for items independently known to be correct, with any findings adjudicated false. Estimate p as adjudicated false flags divided by all reviewed known-correct items, including unflagged items; exclude genuine defects and unadjudicated records. When those labels are unavailable, treat p as a guess and say so. Apply the estimate to each hard floor too: a zero-critical-misses floor is a zero-findings gate over the m critical items alone, so it fails correct work with probability 1 - (1 - p)^m. If the estimate would reject enough correct work to change the decision, redesign the gate with rules 1 to 3 before the run, not after.
5. **Track findings per cycle and stop early when they do not fall.** Record the number of findings after every cycle, with the item IDs. Declare a stall rule along with the repair bound, for example "two repairs in a row that leave the count the same or higher". When the count stays flat or bounces across repairs, stop spending rounds and apply rule 2. Put the question on the owner questions page (`patterns/owner-questions-page.md`) with the per-cycle counts, what each cycle changed, and the options (for example accept the partial result with its gaps, change the gate, or have a person review the flagged items). Keep the independent units moving while the question waits.

## Bounds

- **Declared gates stay hard.** The rules shape a gate that an agent or pipeline designs, or that a project leaves open. They never lower a gate the owner or the project's authority has declared blocking. For a declared zero-finding gate, run it as declared, put the false-failure estimate and the proposed aggregate gate on the owner questions page as a proposal, and keep running the declared gate until the owner or the project authority changes it (`patterns/owner-goal-followup-and-requirement-accretion.md`, **Declared gates are not accretion**).
- **A directive's ceiling stays a ceiling.** If a controlling directive fixes a repair limit, the stall rule can end repairs sooner and never extends them (`patterns/structured-output-failure-boundary.md`).
- **A bound ends spend and proves nothing else.** Stopping repairs does not show that the unit, the repair method, or the reviewer is wrong. The next step is diagnosis or an owner decision (`patterns/outcome-advancement-and-strategy-efficacy.md`, section 9.4).

## Failure condition and repair

Failure condition, any one of:

- a gate needs zero findings from a model reviewer on every unit and no false-failure estimate was made;
- a repair cycle re-reviews items that passed and did not change;
- repairs have no bound fixed in advance, or findings per cycle are not recorded;
- a unit is discarded, or the pipeline halted, because some items stay flagged.

Repair: make the estimate; switch to the change-only review of rule 1; fix a bound and a stall rule; move acceptance to the aggregate of rule 3 (as a proposal when the gate is declared); withhold items and record gaps as in rule 2; and put the counts on the owner questions page.

## Relationship to other patterns

- `patterns/independent-evaluation-separation.md` treats a reviewer's findings as diagnostic evidence. This pattern limits how far a noisy reviewer's variance can decide acceptance.
- `patterns/test-efficiency-and-verification-budget.md` skips reruns of unchanged deterministic checks to save time. Rule 1 applies the same idea to a reviewer for a different reason: a rerun can return a different answer for an unchanged item.
- `patterns/external-evaluation-reproducibility.md` asks for repeat distributions from nondeterministic evaluators. The pilot in rule 4 produces one for false flags.
- `patterns/executable-frontier-coherence.md` keeps one failed lane from suppressing independent lanes. Rule 2 applies that to units: independent units continue, and a unit that depends on withheld items waits or records the gap.
- `patterns/owner-questions-page.md` is where rule 5 escalates.
- `patterns/logic-failure-map.md` places this pattern at LF-7.7, and at LF-5.2 for the repair loop.

## Requirement-accretion declaration

- Origin: a failure observed in project work and filed by an agent session on 2026-10-03, not an owner statement. Rules 1 to 4 follow from arithmetic anyone can recompute; rule 5 follows from the recorded cycle counts.
- Decision it changes: whether a noisy-reviewer gate may reject or discard correct work, and when repair spending stops.
- Why the simpler standard is insufficient: a zero-finding gate over whole units fails correct work at a computable rate, and each whole-unit re-review adds fresh false flags.
- Why it is scoped: it covers only gates whose checker is a noisy reviewer. It adds no blocking gate and lowers no declared one.

## Transfer rationale and limits

Promoted from one project's pipeline that accepted work units on a language-model reviewer's zero-finding report. The project's own evidence stays in its repository; this pattern keeps only what transfers.

- The formulas assume false flags are independent at one constant rate p. Real flags cluster, since one misreading can flag several items, and p differs by item type and by reviewer. Treat the formulas as planning estimates, and prefer a pass rate measured on known-correct units.
- Carrying an item forward assumes its verdict depends only on that item and the frozen reference. When a verdict depends on other items (order, duplicates, consistency across items), declare the dependency and count a change to the other item as a change to this one.
- An aggregate can hide a bad unit, which is why rule 3 reports failed units and error counts beside it. A frozen reference is only as sound as its own provenance.
- The pattern addresses false flags. A reviewer that misses real defects needs a different reviewer or a deterministic check.
- It makes no claim about which reviewer or model is better.
