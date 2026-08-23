# Independent evaluation separation

## Problem

A second review is not necessarily an independent review. When the evaluator sees the developer's rationale, prior verdicts, rejected alternatives, local repair history, detector scores, or explanations for why a contested choice exists, those materials can anchor what the evaluator notices and how it interprets the artifact.

This matters in article editing, code review, research synthesis, model evaluation, safety review, design critique, benchmark adjudication, and other workflows where the producer has spent enough time with an artifact to normalize its remaining defects.

## Existing-work basis

This pattern is an **adaptation**, not a new theory of review.

The strongest reusable baseline is independent verification and validation (IV&V). NASA's IV&V guidance, drawing on IEEE verification-and-validation standards, treats independence as more than asking the developer to review their own work again: technical independence requires assessors who were not involved in development, while managerial independence gives the assessment function meaningful control over what and how it evaluates. The underlying value is a genuinely different perspective capable of finding errors that development personnel may overlook.

Adjacent empirical evidence supports an information-separation component. Randomized second-opinion pathology research has found that exposure to a prior diagnosis can shift later diagnoses and viewing behavior, undermining independence. Large breast-screening evidence likewise found that an unblinded second reader was more likely to conform to the first reader's recall decision. Blinded interpretation of study results has also been proposed and tested as a way to reduce interpretation bias.

Useful public references:

- NASA IV&V Overview: https://www.nasa.gov/ivv-overview/
- NASA-STD-8739.8B, software assurance / IV&V: https://standards.nasa.gov/sites/default/files/standards/NASA/B/0/NASA-STD-87398RevB.pdf
- Effects of Prior Diagnosis on Second Opinions and Pathologist Viewing Behaviors (randomized trial; PMID 41020455): https://pubmed.ncbi.nlm.nih.gov/41020455/
- Optimising breast cancer screening reading: blinding the second reader to the first reader's decisions (PMID 34117912): https://pubmed.ncbi.nlm.nih.gov/34117912/
- Blinded interpretation of study results can feasibly and effectively diminish interpretation bias (PMID 24560088): https://pubmed.ncbi.nlm.nih.gov/24560088/

The transfer is conceptual. Ordinary project review does **not** become standards-compliant IV&V merely because it uses a fresh worker or blind first pass.

## Reuse decision

- **Already solved:** development and evaluation should be meaningfully separated when independence is important; prior judgments can bias a nominal second opinion.
- **Composable:** technical separation, evaluator scope autonomy, blind first-pass review, explicit finding records, and later reconciliation with authoritative context.
- **Domain-specific adaptation needed:** what information must be withheld versus supplied so the evaluator can understand the artifact without inheriting the producer's conclusions.
- **Not established here:** a universal quantitative threshold for when an independent review is worth its coordination cost, or proof that any particular model/provider is a sufficiently independent evaluator.

Use **adaptation**: preserve the independence principle and blind-first-pass logic, but calibrate scope and information disclosure to the artifact's risk and domain.

## Durable rule

When independent evaluation is materially valuable, **independence must be real enough to change the evaluator's information state and perspective**. A role-play prompt inside the same saturated development context is self-review, not independent review.

Prefer a fresh person, model context, worker, process, or organization that was not responsible for producing the evaluated artifact. Give the evaluator the literal artifact, the intended contract or requirements, and only the minimum authoritative context needed to avoid false findings. Withhold producer rationale and prior judgments during the initial diagnostic pass unless they are themselves part of the object being evaluated.

## Information firewall

For the first independent pass, normally provide:

- the exact artifact or natural evaluation boundary;
- the intended user/audience and required outcome;
- governing requirements, locks, safety constraints, or acceptance criteria that the evaluator must know;
- factual/source context that is necessary to interpret the artifact correctly.

Normally withhold until after the first-pass findings are frozen:

- why the producer chose the current solution;
- prior reviewers' conclusions;
- detector or benchmark scores that are not themselves the evaluation target;
- rejected alternatives and defenses of the current implementation;
- local repair history and explanations of known weak spots;
- the producer's prediction of what the evaluator should find.

Do not hide information whose absence would make the review invalid. The goal is reduced anchoring, not artificial ignorance.

## Two-stage evaluation

### Stage 1 — independent diagnosis

The evaluator inspects the artifact and records findings before seeing the producer's rationale or previous verdicts. Where practical, let the evaluator choose which regions or failure modes deserve attention rather than forcing the producer's issue list to define the whole review.

Record at least:

- evaluated artifact identity/boundary;
- evaluator identity or model/context identity when reproducibility matters;
- information disclosed and intentionally withheld;
- findings and confidence;
- strongest remaining weakness;
- areas not evaluated or not understood.

### Stage 2 — reconciliation

After Stage 1 is frozen, expose the relevant rationale, provenance, prior decisions, and constraints. Reconcile each material finding against the project's actual authority and evidence.

Classify findings as:

- confirmed defect or weakness;
- useful alternative worth owner/domain consideration;
- false positive caused by missing context;
- conflict with an explicit owner/requirements decision;
- factual claim requiring external verification;
- unresolved disagreement requiring higher-authority adjudication.

Do not let the independent evaluator silently become edit, merge, publication, safety, or owner authority. Independence improves diagnosis; it does not establish supremacy.

## Risk-adjusted trigger

Use this pattern when the expected value of a fresh perspective exceeds coordination cost, especially for:

- final or publication/release candidates;
- high-stakes, irreversible, paid, safety-sensitive, or security-sensitive work;
- long-running work whose primary context contains extensive repair history or local rationale;
- artifacts repeatedly revised by the same worker;
- contentious judgments where prior verdicts could anchor later reviewers;
- cases where self-review keeps returning the same answer despite unresolved evidence.

Skip or downgrade to ordinary self-review for trivial edits, obvious mechanical changes, or low-risk work where independence would add ceremony without meaningful information gain.

## Failure modes

- **Same-context theater:** instructing the drafting model to "act independent" while it retains all prior rationale.
- **Anchored handoff:** giving the independent reviewer a long explanation of what is probably wrong before it reads the artifact.
- **Context starvation:** withholding requirements or locks needed to judge the artifact correctly.
- **Authority inversion:** automatically implementing an outside reviewer's suggestion because it is independent.
- **Consensus laundering:** treating agreement between two similarly primed evaluators as independent corroboration.
- **Opaque independence claim:** reporting "independent review passed" without saying what was independent and what information the reviewer had.
- **Universalizing the trigger:** requiring a separate reviewer for every minor task regardless of cost or risk.

## Relationship to other universal patterns

- Use `patterns/external-evaluation-reproducibility.md` when historical evaluator outputs, versions, boundaries, or repeated scores matter.
- Use `patterns/transformation-preservation-proof.md` when implementing a review finding would transform a protected source artifact; independent diagnosis does not waive preservation traceability.
- Use `patterns/editorial-authority-and-lossless-editing.md` for author/owner authority in editorial work.
- Use `patterns/research-before-reinvention.md` before expanding this into a bespoke scoring system or reviewer-selection algorithm.

## Origin and promotion evidence

Promoted 2026-08-23 from `u-dont-existDOTcom/joel-articles` after comparing its canonical article-writing architecture against the public `distinctive-article-writing` v1.0.0 skill.

The external skill contained one genuinely non-duplicative useful mechanism: it preferred an independent model or fresh context for distinctiveness review. The article skill already had strong cold audits but did not require real context separation. The owner-specific rule was therefore adapted and strengthened rather than copied: it requires genuine context/model separation, an anti-anchoring information boundary, diagnostic-only authority, and reconciliation through the existing owner/provenance/preservation gates.

Originating owner-specific promotion:

- repository: `u-dont-existDOTcom/joel-articles`
- merged pull request: #43, "Add independent final-reader audit to article skill"
- merge commit: `90f23c4d6530d9f1a9abda372e7a716bec6c0aef`

## Limits

- Independence reduces some shared-context and anchoring risks; it does not guarantee correctness.
- Two evaluators can share the same blind spots, training data, organizational incentives, or domain assumptions.
- A fresh model context is weaker independence than a genuinely separate expert or organization when stakes are high.
- Blinding can remove useful context as well as biasing context; disclose the minimum information required for valid evaluation.
- Empirical evidence from medicine and scientific interpretation supports the general anchoring concern but does not quantify the benefit for every software, research, or editorial workflow.
- Final authority remains with the governing requirements, evidence, owner/domain authority, and applicable safety/release controls.