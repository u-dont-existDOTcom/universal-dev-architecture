# Keep a checkable study map for the claims an answer rests on

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-31, by the Claude session that maintains universal-dev-architecture
- From: `patterns/whole-argument-reconstruction.md` in universal-dev-architecture, the claim map added on 2026-10-31 to its manifest-first reading receipts (`docs/requirements/2026-10-31-claim-map-and-study-map.owner-requirement.json`)
- Owner request: yes, 2026-10-31; his choice is in that requirement record
- Existing pull request: none
- Supersedes: none

## What to do

For the claims a research answer rests on, keep a small study map beside the answer, built from what the research actually read. Use it only when the conclusion combines studies or rests on an absence claim; a one-study answer needs none.

1. **A node for each study, with identifiers.** The citation (DOI, PMID or a stable URL, and the title), the trial registry number when there is one, and the cohort details needed to test overlap: recruitment sites, dates, sample size, and the authors or sponsor.
2. **Links between studies.** *Same cohort as*, *reanalysis of*, *extension of*, *abstract of*, *cites as evidence*. Each link names the passage or field it rests on. Count underlying people or datasets, not documents, and let the map show that count.
3. **The paper against its registry, both ways.** For a registered trial, compare against the version registered before the trial started, and record that version's date. Link each reported outcome to its registered one, and flag registered outcomes the paper leaves out, outcomes it adds, and outcomes moved between primary and secondary, unless the paper declares the change.
4. **Claims traced to their source.** Each claim in the answer points to the study that measured it, through any reviews that repeat it. A review restating a study is not a second source.
5. **The answer tied to passages.** Each sentence of the answer that the conclusion depends on points to a passage of a full text the research read. The document handle and content hash recorded for each full text make these anchors cheap.
6. **Mechanical checks only where they are mechanical.** A script can check that every node has a citation, that each anchored quote matches the stored full text, and that no two supporting studies counted as independent share a cohort node. Whether two cohorts really overlap, or whether a passage supports a claim, stays with a meaning-capable reviewer.

## Why

Many research errors sit between studies, where a single-paper audit can't see them:

- **Duplicate cohorts.** Tramèr and colleagues found covert duplicate reports in the ondansetron trial literature: 17% of full reports and 28% of the patient data were duplicated, and including them overestimated the drug's antiemetic efficacy by 23% (BMJ 1997, https://www.bmj.com/content/315/7109/635).
- **Outcome switching.** COMPare assessed 67 trials in five high-impact journals over six weeks; 58 had discrepancies that needed a correction letter, and trials added a mean of 5.4 undeclared outcomes (Trials 2019, https://trialsjournal.biomedcentral.com/articles/10.1186/s13063-019-3173-2).

AskRigor's protocol already states several of these rules in prose: a duplicate and data-lineage audit that counts people rather than papers, and an argument map before critiquing a source. The map makes them checkable. A Mission Control research job on 2026-10-29 stopped with blocker codes for an unknown cohort overlap and unverified patient-level outcomes, and its supervisor asked for exactly these identifiers before authorizing more work.

## Check first

- Read the current HRP duplicate and data-lineage rule, and the research server's existing lineage and findings code, and extend them rather than adding a parallel structure.
- Reuse the document handles and content hashes from the full-text acquisition receipts; don't create a new store of private or raw provider text.
- Regression cases: two reports of one cohort counted as two (flag); a review repeating a trial (count once); a registered outcome silently replaced (flag); a registered outcome left out of the paper (flag); a secondary outcome reported as primary (flag); a change made in the registry after the trial started, read against the earlier version (flag); a genuinely independent replication (don't flag); a decision-critical claim with no anchored passage (flag); and a negative control in which no overlap exists.
- Keep the zero-spend and access boundaries: a paywalled original stays unread and is named as a gap, never filled from an abstract or a review.
