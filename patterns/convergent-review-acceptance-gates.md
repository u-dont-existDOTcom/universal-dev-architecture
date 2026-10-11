# Convergent acceptance gates over noisy reviewers

## Status

Current universal pattern, promoted 2026-10-03 from one project's incident (see **Transfer rationale and limits**). It adds no gate to any project and does not lower a gate that the owner or a project has declared.

Amended 2026-10-09 with rules 6 to 9, after the same project's run stopped on a hard floor that one model verdict tripped, at the owner's request: "make sure UDA doesn't allow ridiculous designs like this anymore".

## Problem

A pipeline that accepts a work unit only when a language-model reviewer reports zero findings, and re-reviews the whole unit after every repair, can fail to converge. Reviews vary from run to run, so each repair fixes what one review flagged and the next review flags something else.

In the originating case, findings per cycle ran 2, 3, 4 in one run and 5, 1, 3 in another. One repair by a stronger model reached zero findings, and the next reviewer, an audit that every reference item was kept, still called five items unsupported.

Two mechanisms produce this:

- **The gate rejects correct work.** Suppose each item in a correct unit of n items draws a false flag independently with probability p. The unit then passes a zero-finding gate with probability (1 - p)^n. With p = 0.05 and n = 27 that is about 25%. Requiring all N units to pass multiplies the chances: if each unit passes with probability q, all N pass with probability q^N. Even q = 0.99 gives 0.99^162, about 20%, across 162 units.
- **Whole-unit re-review draws new false flags.** Each full re-review is a fresh draw, and it covers items that already passed and did not change. Repairs can end up chasing the reviewer's variance instead of the unit's defects.

A hard floor on a labeled class of items has the same weakness, and two more. In the second case, a round stopped on a floor of zero critical misses after 93 of its 162 units, with pooled recall at 99.1% against a 95% floor. One model had labeled items critical at its own discretion, with no written definition, while the judge worked from its own list. The judge's verdict on critical items moved between audited versions of the same unit in 4 of the 6 units that failed. One version kept every reference item, but its audit claimed it was incomplete without naming anything it had left out, so the version could not pass. And the only way past the tripped floor was to start the round again from zero.

For a recall floor r over n known-correct reference items, the allowed misses are k = n - ceil(r*n). Under the same independence and constant-p model, the false-failure probability is P(Binomial(n, p) > k) = sum from j = k + 1 to n of C(n, j) p^j (1 - p)^(n - j), where C(n, j) counts combinations. With k = 0 this reduces to the zero-miss formula above. For example, r = 0.95, n = 100 and p = 0.01 allow k = 5 misses and give about 0.0535% false failures, versus about 63.4% for zero allowed misses.

## Rules

1. **Re-review the change, not the whole unit.** After a repair, send the reviewer only the earlier findings and the items the repair changed. Carry forward every item that passed and did not change. Give each item a stable ID when it is first produced, and match items to their earlier verdicts mechanically, by ID, exact content and the complete evaluator configuration (reviewer prompt, rubric, model/version, sampling settings and frozen reference; hashes are enough), never by asking the reviewer. An item whose ID, content or evaluator configuration does not match counts as changed; a configuration change counts every affected item as changed and requires re-review before aggregate acceptance.
2. **Bound the repairs and degrade by item.** Fix the number of repair cycles before the first cycle runs. When the repairs run out, withhold only the items still flagged and mark them for review, keep every other item, and record each omission that is still flagged (a reference item the reviewer says the output lacks) as a gap in the output. Do not discard the unit, and do not halt the pipeline: one unit's leftover flags never stop units that do not depend on it. A unit that consumes or checks the withheld items waits until they are reviewed, or runs without them and records the gap; it never treats them as accepted.
3. **Gate on aggregates with hard floors.** Accept a run on aggregate measures with floors stated in advance, not on every unit reaching zero findings. An example set is pooled recall against a frozen reference (the share of all reference items, across all units, that the output kept) at or above a stated level, plus a stated limit on confirmed critical misses (rules 4, 6 and 7). Where units are not interchangeable, because each customer, source or experiment must keep its own required items, add a per-unit or per-stratum minimum to the floors: a pooled measure lets strong units hide one that kept nothing. Freeze the reference before the gate runs, and never trade a hard floor against another measure. Report the failed units and the error counts beside the aggregate, each measure on its own line, so a passing aggregate hides neither.
4. **Estimate the false-failure rate before running at scale.** Before a gate runs over many units, estimate how often it will fail correct work, using the formulas in the Problem section. Take p from a pilot on units independently known to be correct (the frozen reference, for example), or from earlier cycles' records only for items independently known to be correct, with any findings adjudicated false. Estimate p as the number of distinct reviewed known-correct items receiving at least one adjudicated false flag divided by all reviewed known-correct items, including unflagged items; count each item once even if it has multiple false findings, and exclude genuine defects and unadjudicated records. When those labels are unavailable, treat p as a guess and say so. State the confidence level and method, and size a representative pilot in advance for the tolerable false-failure rate at the intended scale. Use a one-sided upper confidence bound p_upper in place of the point estimate p in every unit/run and hard-floor calculation, or a one-sided lower confidence bound on each directly measured floor pass rate. Under the independent constant-p model, zero false flags among t known-correct items give the exact one-sided bound p_upper = 1 - alpha^(1/t) at confidence 1 - alpha; with t = 20 and alpha = 0.05 this is about 13.9%, not zero. Likewise, if all u independent known-correct units pass a floor, its exact lower bound is q_lower = alpha^(1/u), not 1. Report the pilot counts and bounds; if the pilot is too small to rule out material rejection, enlarge it with a predeclared sample size or redesign before scale, rather than admitting the gate on a point estimate. Apply the binomial tail to each aggregate, per-unit and per-stratum floor using its own n, p and allowed misses k, or measure that floor's false-failure rate on independently known-correct work. Apply the estimate to each hard floor too: a zero-critical-misses floor is a zero-findings gate over the m critical items alone, so it fails correct work with probability 1 - (1 - p)^m. If the conservative bound would reject enough correct work to change the decision, redesign the gate with rules 1 to 3 and 6 to 9 before the run, not after. A floor of zero over many model judgments is admissible only when the bound supports it; otherwise state the floor as an allowed count k from the bound, or make the check deterministic.
5. **Track findings per cycle and stop early when they do not fall.** Record the number of findings after every cycle, with the item IDs. Declare a stall rule along with the repair bound, for example "two repairs in a row that leave the count the same or higher". When the count stays flat or bounces across repairs, stop spending rounds and apply rule 2. Put the question on the owner questions page (`patterns/owner-questions-page.md`) with the per-cycle counts, what each cycle changed, and the options (for example accept the partial result with its gaps, change the gate, or have a person review the flagged items). Keep the independent units moving while the question waits.
6. **Confirm a blocking verdict before it stops work.** When one model's verdict would trip a hard floor, stop a run or discard completed work, get a second, independent judgment of that verdict first. Use a different model family where one is available, otherwise a fresh run under its own identity, or a deterministic check. Count the violation only when the second judgment agrees, and record and report the rest as unconfirmed. When no second judgment can be had, the first verdict stands, so confirmation never hides a violation. The second judge rules only on what the first flagged; it adds no violations of its own.
7. **Define every label a gate counts, once, for every role.** A gate that counts a label, such as critical, blocking or high severity, needs one written definition of it. Give that definition, in the same words, to every role that assigns the label and every role that judges against it. A label that one role assigns at its own discretion may be reported, never gated.
8. **Read a review's status from what it names.** A claimed status never overrides the review's own verdicts. A review that names no finding, no item left unassessed and no proposed repair has nothing to repair, whatever status it claims. One that claims it is incomplete counts as finished only when its coverage can be checked mechanically and is complete; otherwise it stays incomplete.
9. **A tripped gate keeps the work it already checked.** Design every gate stop so the run can continue under changed rules without redoing what already passed, and record each continuation with the stop it replaced. Starting over is a cost to justify on the owner questions page, never the only way on. Report the stop to the owner when it happens, with what restarts it.

## Bounds

- **Declared gates stay hard.** The rules shape a gate that an agent or pipeline designs, or that a project leaves open. They never lower a gate the owner or the project's authority has declared blocking. For a declared zero-finding gate, run it as declared, put the false-failure estimate and the proposed aggregate gate on the owner questions page as a proposal, and keep running the declared gate until the owner or the project authority changes it (`patterns/owner-goal-followup-and-requirement-accretion.md`, **Declared gates are not accretion**).
- **A directive's ceiling stays a ceiling.** If a controlling directive fixes a repair limit, the stall rule can end repairs sooner and never extends them (`patterns/structured-output-failure-boundary.md`).
- **No new gates of this kind.** An agent never designs a gate that fails rules 6 to 9. When it finds an existing one, including a declared one, it puts the redesign on the owner questions page as a proposal, as for a declared zero-finding gate.
- **A bound ends spend and proves nothing else.** Stopping repairs does not show that the unit, the repair method, or the reviewer is wrong. The next step is diagnosis or an owner decision (`patterns/outcome-advancement-and-strategy-efficacy.md`, section 9.4).

## Failure condition and repair

Failure condition, any one of:

- a gate needs zero findings from a model reviewer on every unit and no false-failure estimate was made;
- a repair cycle re-reviews items that passed and did not change under the same evaluator configuration, or carries a verdict across an evaluator configuration change;
- repairs have no bound fixed in advance, or findings per cycle are not recorded;
- a unit is discarded, or the pipeline halted, because some items stay flagged;
- one model's verdict can trip a hard floor, stop a run or discard work without a second, independent judgment;
- a gate counts a label that no single written definition gives to every role that assigns or judges it;
- a reviewer's claimed status can hold back work that its own verdicts pass;
- the only way past a tripped gate discards work that already passed, or the stop is not reported when it happens.

Repair: make the estimate; switch to the change-only review of rule 1; fix a bound and a stall rule; move acceptance to the aggregate of rule 3 (as a proposal when the gate is declared); withhold items and record gaps as in rule 2; add the confirmation of rule 6; write the label's definition for every role (rule 7); read statuses from what reviews name (rule 8); make the stop resumable and reported (rule 9); and put the counts on the owner questions page.

## Relationship to other patterns

- `patterns/independent-evaluation-separation.md` treats a reviewer's findings as diagnostic evidence. This pattern limits how far a noisy reviewer's variance can decide acceptance.
- `patterns/test-efficiency-and-verification-budget.md` skips reruns of unchanged deterministic checks to save time. Rule 1 applies the same idea to a reviewer for a different reason: a rerun can return a different answer for an unchanged item.
- `patterns/external-evaluation-reproducibility.md` asks for repeat distributions from nondeterministic evaluators. The pilot in rule 4 produces one for false flags.
- `patterns/executable-frontier-coherence.md` keeps one failed lane from suppressing independent lanes. Rule 2 applies that to units: independent units continue, and a unit that depends on withheld items waits or records the gap.
- `patterns/owner-questions-page.md` is where rules 5 and 9 escalate.
- `patterns/logic-failure-map.md` places this pattern at LF-7.7, and at LF-5.2 for the repair loop.

## Requirement-accretion declaration

- Origin: a failure observed in project work and filed by an agent session on 2026-10-03, not an owner statement. Rules 1 to 4 follow from arithmetic anyone can recompute; rule 5 follows from the recorded cycle counts.
- Decision it changes: whether a noisy-reviewer gate may reject or discard correct work, and when repair spending stops.
- Why the simpler standard is insufficient: a zero-finding gate over whole units fails correct work at a computable rate, and each whole-unit re-review adds fresh false flags.
- Why it is scoped: it covers only gates whose checker is a noisy reviewer. It adds no blocking gate and lowers no declared one.
- Amendment origin (rules 6 to 9): **OWNER**, 2026-10-09: "make sure UDA doesn't allow ridiculous designs like this anymore", said of the second case in the Problem section. Decision it changes: whether a single model verdict on a label without a shared definition may stop a run or discard work. Why the simpler standard is insufficient: rules 1 to 5 kept a hard floor of zero for labeled items as an example, and that floor stopped a run that met its recall target, on a verdict the same judge reversed elsewhere. Why it is scoped: it constrains how gates over model judgments are designed; it adds no gate and lowers no declared one.

## Transfer rationale and limits

Promoted from one project's pipeline that accepted work units on a language-model reviewer's zero-finding report. The project's own evidence stays in its repository; this pattern keeps only what transfers.

- The formulas assume false flags are independent at one constant rate p. Real flags cluster, since one misreading can flag several items, and p differs by item type and by reviewer. Treat the formulas as planning estimates, and prefer a pass rate measured on known-correct units with its confidence bound.
- Carrying an item forward assumes its verdict depends only on that item, the frozen reference and the bound evaluator configuration. When a verdict depends on other items (order, duplicates, consistency across items), declare the dependency and count a change to the other item as a change to this one.
- An aggregate can hide a bad unit, which is why rule 3 reports failed units and error counts beside it. A frozen reference is only as sound as its own provenance.
- The pattern addresses false flags. A reviewer that misses real defects needs a different reviewer or a deterministic check.
- It makes no claim about which reviewer or model is better.
- The second case came from the same project's calibration of a journal import. Its evidence is content-free counts in that project's repository. Rule 6 assumes the second judge's errors are not the same as the first's; a judge from the same model family, given the same packet, is a weaker check than a different family or a deterministic test.
