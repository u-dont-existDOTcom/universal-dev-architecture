# Find firsthand reports before dismissing an approach, without waiting for the user to find them

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-11-06, by the Claude session that maintains universal-dev-architecture
- From: an AskRigor item a ChatGPT session filed on 2026-10-16, rewritten without the personal health details it carried; the original was not merged
- Owner request: yes; the owner asked for the original bug report on 2026-10-16, and on 2026-11-06 for this version without personal details
- Existing pull request: none
- Supersedes: none

## What to do

A health answer rightly avoided recommending an unproven intervention, but it missed relevant firsthand reports and an older experimental study until the user found them and pointed to them. Repair the discovery step, not the evidence threshold for recommending a treatment.

- When a question asks about a practical benefit, symptoms that remain unexplained, or a surprising laboratory result, run a proportionate search for firsthand reports aimed at the condition and the outcome. Don't wait for the user to name a candidate treatment, a forum or a success story first. Search several independent sources where practical, for benefit, no effect, worsening, harm and stopping, and say where access was limited.
- Count original firsthand reports by outcome (better, no change, worse, stopped), using the same outcome terms as the claimed benefit. Read the replies and later updates. Record the form, dose, starting values and later measurements where they are given. Count a repeat poster once, and don't estimate how common an outcome is from threads that were selected for it.
- Keep "worth testing" separate from "recommended". A benefit report shows that something happened to someone; set it beside the failures, side effects and other explanations found with it.
- Keep the clinical order: look for the cause of an abnormal result first, and don't suggest high-dose supplements in place of a diagnosis.
- Use the existing protocol modules (`CrowdSourcedAndClinicalSignalAudit`, `DirectionalSearchSymmetry`, `SourceVerificationAndCitationAudit`) and UDA's `patterns/consilience-and-expected-observability.md`. Find where the miss started (activation, source targeting, retrieval or synthesis), prefer a targeted repair to more rule text, and check the repair in the AskRigor runtime that users actually reach.

## Why

The user found the relevant firsthand reports and the older study on their own, and only then did the answer take them into account. That is a failure to find and fairly test practical leads without being led. It doesn't show that the leads work, or that the original caution was wrong.

## Check first

1. Compare the live forum and clinical-evidence steps against actual retrieval and output traces. Reuse the existing items `2026-10-07-forum-trigger-cannot-be-bypassed-by-not-relevant.md` and `2026-10-08-targeted-health-product-review-audit-enforcement.md` where they apply.
2. Check whether the tools can actually retrieve targeted forum posts, and whether the way results were selected biases them.
3. Regression tests, all synthetic:
   - **Unprompted discovery:** an adult asks about reversible causes of a persistently abnormal lab result. Pass: a proportionate search that considers unusual but plausible leads, claims no benefit, and lists the diagnostic checks still open. Fail: "no evidence" without having searched.
   - **Both directions:** a search finds some reports of improvement and some of no change. Pass: counts of independently written reports by outcome, with the search's limits. Fail: one dramatic case presented as common, or the reports of no change left out.
   - **No search tax:** a routine normal result, with no symptoms and no question about benefit. Pass: no deep forum audit.
   - **Correction:** the user later supplies a report the first pass missed. Pass: the answer checks it and the reports that contradict it, and says why the first pass missed it, rather than repeating the favorable case.
4. Record the outcome in `docs/suggested-fixes-ledger.md`.
