# Benchmark AskRigor against Sakana-style planted research errors

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by ChatGPT research assistant
- From: primary paper https://arxiv.org/abs/2610.11087 (PDF https://arxiv.org/pdf/2610.11087)
- Owner request: no; the owner requested an assessment, not an additional mandatory gate or implementation
- Existing pull request: none
- Supersedes: none

## What to do

Run a **bounded, nonblocking development experiment**. Do not deploy Sakana or create a mandatory reviewer by default.

1. Build 20–50 human-checked error fixtures on public/licensed papers and source-to-answer summaries. Mutate one specific defect per case: core finding contradicted by results; altered denominator, percentage, units, follow-up, comparator, population or intervention; unsupported causal extrapolation; omitted harm; selectively reported subgroup; duplicated cohort; citation that does not entail the answer; prompt-injection hidden in PDF. Include untouched clean controls and documented natural errors. Freeze originals, mutants, human gold labels, versions and hashes. Never mutate canonical evidence.
2. Compare current AskRigor behavior against (A) a cheap blind one-pass semantic challenge and (B) a three-pass comprehend -> source-linked test -> critique sequence. Keep model, source coverage and modality identical when estimating the design effect; separate model-family/ensemble effects into further experiments.
3. Evaluate recall for *core* versus peripheral defects, false objections on clean documents, wrong-source citations, actual decision-changing corrections, time and cost. Human-adjudicate detection instead of accepting a generic criticism as a true positive. Preserve discovery/validation separation and an untouched test set.
4. If additional reviewing is demonstrably useful, consider a **risk-triggered, source-anchored independent challenger** for decision-important claims, not an automatic four-review gate. Test PDF figure/table/appendix reading only when text extraction loses decisive evidence. Ensure untrusted source content cannot instruct the reviewer.
5. Do not run paid model APIs or publish changes without existing authorization. AskRigor's current repository policy records zero approved paid-model API spending.

## Why

Sakana's paper uses 257 conference papers and 1,164 inserted contradictions. Its **three-pass Review Agent alone** detected core planted errors in **60.79%** of single reviews and **73.43%** with four; the four-review mean over all error positions was **40.95%**. Real withdrawn-paper exact-error matching was **16.11%** on 211 papers, with **26.07%** for similar criticisms. It flagged manipulative content in only **8 of 50** injected papers. Crucially, Table 12 shows that the headline benchmark did **not** use the other two Sakana agents. These largely machine-judged results do not establish an applicable medical-review accuracy, precision or safety rate.

AskRigor already checks source-linked full-text coverage and method/audit fields. Its audit receipts explicitly state that source linkage and checklist completion do **not** prove semantic correctness. Test evidence-to-conclusion entailment, not a duplicated checklist. The paper states its code and data are **available on request**, not a confirmed public installable service.

## Check first

- Compare with existing AskRigor claim-integrity and finalizer tests; keep privacy, provenance, source and community-evidence requirements.
- Verify paper Tables 3, 12 and 14 and limitations; calibrate synthetic and real error detection separately.
- Check Sakana's code/data availability and license before proposing direct reuse; keep model, evaluation setting, cost and false-positive rates explicit.
- Preserve current owner no-paid-API-spend decision; a successful pilot is not automatic permission for deployment.
