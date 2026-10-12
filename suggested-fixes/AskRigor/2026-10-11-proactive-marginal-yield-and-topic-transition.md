# Proactively report diminishing returns and reallocate effort in long-running AskRigor research

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-11, by ChatGPT research continuation agent
- From: owner correction after multiple deep botanical-treatment research continuations; generalizable retrospective case, with no personal or private content
- Owner request: yes — the owner says the assistant should itself have identified and communicated diminishing returns before the owner pointed it out, and that this should be a rule of long-running AskRigor research threads
- Existing pull request: none
- Supersedes: none

## What to do

**Repair enforcement and communication of existing HRP stopping rules rather than creating an unrelated high-friction research protocol.** Current HRP 20.6.15 already provides `ResearchOrchestrationAndModeSelectionGate/AdaptiveStoppingRule` and `BidirectionalEvidenceDiscoveryAndTriangulationLoop/BidirectionalIterationStoppingRule`; both require checking declining marginal value after passes. In observed continuations those requirements did not produce the user-facing early signal or cross-topic reallocation. Identify whether the cause is missing activation, no durable pass comparison, inference failure, missing owner-facing output, or finalizer mismatch.

Implement an Atlas-compatible **per-topic discovery-yield checkpoint** after meaningful multi-pass research, across `continue` turns and context resets:

1. Preserve the owner's **parent purpose** and exact phenotype: e.g., for physical-strength research the target is *force production / unexpectedly effortless heavy work / endurance*; libido and testosterone are separate secondary outcomes. For syndrome research preserve direct patient-centered magnitude and comparator adequacy, not publication count or statistical significance.
2. Track **incremental decision value of each pass**, not raw hits. Minimum evidence: topic/version, pass and source classes/languages checked, candidates newly discovered by truly independent evidence lineage, candidate effect magnitudes & uncertainty where available, safety/formulation/availability status, changes to credible practical shortlists, contradictions resolved, critical open sources, cost/time/effort, and productive alternative lanes. Deduplicate marketing amplification and dependent traditional reports.
3. After each bounded pass make a semantic, source-grounded decision among `HIGH_VALUE_PROGRESS`, `DECLINING_MARGINAL_YIELD`, `PLAUSIBLE_SATURATION`, `EVIDENCE_ACCESS_BLOCKED`, `CRITICAL_AUDIT_PENDING`, `ACTIVE_UNDEREXPLORED_LANE`, and `UNCERTAIN`. These can co-occur per evidence layer. No unsupported numeric yield ratio or rigid universal number of passes; thresholds are planning heuristics, not automated fail-closed scientific proof. Distinguish exhausted *current search strategy* from exhausted disease/treatment knowledge.
4. **Proactively disclose** to the owner in the answer as soon as the quality-adjusted yield declines materially over successive adequately covered passes: e.g. “We're getting diminishing returns on [exact scope]: recent passes found no new independently corroborated, substantial treatment advantage; important unresolved [specific] remain. I recommend moving the main effort to [next high-value disease/lane] while preserving [watch or audit leads].” Do not wait for the owner to ask, and do not narrate every weak discovery.
5. At transitions preserve a **reasoned research allocation**: current-condition lead status, remaining high-value source gap and how to resume, next topic and priority from the cross-condition queue, and unclosed audit/finalizer obligations. Discovery plateau is **not** proof of completed HRP certification. A source-acquisition failure, missing full text, thin forum corpus, or newly opening ethnobotanical route is not a legitimate plateau verdict.
6. For a continuing Atlas-like research mission: treat each disease, symptom cluster, or specific phenotype as a bounded workstream within a separately versioned overall mission. At provisional plateau, shift the bulk of effort to the best next problem with large unmet burden; keep disease on a low-cost reopening/watch list when decisive evidence arrives. Respect any explicit user decision to keep digging. Do not silently substitute a different outcome or condition because search is easier there.
7. In normal long threads deliver a **minimal status at the right moment** (roughly two sentences, not an audit dump). Behind that, persist a succinct machine-readable progress frontier with evidence receipts. When qualitative conditions are ambiguous, communicate the uncertainty and the best discriminator rather than pretending strong saturation.

## Why

In an extended herbal investigation of IBS and SIBO, the conversation kept accumulating weaker placebo responder findings and heterogeneous low-value variants despite the absence of independently corroborated substantial benefit over established comparators. It was the **owner**, not AskRigor/the assistant, who first explicitly observed diminishing returns and suggested turning to other diseases. The assistant later acknowledged the plateau without showing an earlier pass-level yield signal. This wasted attention and obscured other high-value Atlas research.

The contrasting physical-strength botanical research **must not** be marked saturated: recent phenotype-first, multilingual ethnobotanical passes found materially new uncommon species and exact preparation-specific traditions (e.g., Trichopus zeylanicus fruit, Sphenocentrum jollyanum fruit, Borassus aethiopum, Pteleopsis suberosa, Crateva adansonii, Vernonia glaberrima). Human efficacy remains unverified and new field/identity/safety source classes are open. It is an active *underexplored* lead search, distinct from the plateau of a narrow IBS/SIBO strategy.

The overall owner purpose is to build an evidence-audited atlas of potentially powerful botanical medicines for common, burdensome conditions with inadequate standard treatments. A per-disease plateau should release attention to this parent objective rather than silently end the mission or induce repetitive low-value analysis.

## Check first

- Inspect live AskRigor HRP stopping, source-discovery, cross-layer iteration and `OutputFormatting` rules, the current finalizer and research frontier persistence. See existing UDA `patterns/long-range-research-mission-supervision.md`, `patterns/outcome-advancement-and-strategy-efficacy.md`, and `patterns/coverage-before-depth-in-selection.md`; import only missing behaviors into **public AskRigor**, don't rely on UDA to rescue a public failure.
- Distinguish genuinely unsearched discovery classes from incomplete auditing of known trials, poor tool coverage, underexposed online communities, and no studies yet conducted. Failure to find new hits under a biased or blocked search is **not** evidence of global saturation.
- Model determines if a result could change the user's decision; mechanically count candidate/lineage/receipt/status transitions and check stated evidence. Do not use keyword-only detectors to judge clinical significance.
- Preserve patient harm/clinical risk and novel low-prevalence traditional-use signals; avoid switching merely because a candidate requires harder original-language or ethnographic investigation.
- Owner requested a bug report and Atlas method development, not public release of Atlas content or owner approval of a specific health treatment.

## Regression tests

1. **Plateau visible before user says it:** A synthetic multi-turn IBS/SIBO corpus provides four independent search passes, each adding only weak, duplicated or clinically tiny effects; major comparator trial remains unexceeded. After a plain “continue”, public AskRigor must proactively say marginal yield is diminishing on this **specific** current evidence strategy, state exceptions and next topic, not wait for the owner to conclude it. Confirm real invocation and output in public AskRigor *without UDA*.
2. **Strength contrast / do not falsely stop:** First passes across branded products yield sponsor-linked dubious effects; new ethnographic pass produces fresh, high-phenotype-specific and relatively underexposed plants. Public AskRigor should flag `ACTIVE_UNDEREXPLORED_LANE`, preserve original force/endurance target, and keep appropriate evidence and safety limitations instead of declaring exhaustion.
3. **Access blocked is not plateau:** Only reachable abstracts, tool errors or a missing full-text paper keep `EVIDENCE_ACCESS_BLOCKED` / `CRITICAL_AUDIT_PENDING` distinct from saturation. Do not claim trial audits complete.
4. **Duplicate amplification does not count:** Ten blogs all repeat the same small study; the count of independently new high-value leads is zero.
5. **Reopening:** After a provisional plateau, a newly published well-controlled study with meaningful clinically important outcome automatically reopens the disease workstream without erasing earlier negative evidence.
6. **Mission continuity:** Transition IBS/SIBO -> dermatology/other high-unmet-need disease, while an unrelated unfinished strength frontier stays OPEN and has independent next work; no blanket conclusion that “all herbs are saturated.”
7. **Notification quality:** A durable answer says why, which remaining discriminators exist, what to do next, and is visible in the owner-facing answer (not just internal receipts).
8. **UDA independence:** Standalone public AskRigor passes; an UDA-prompted rescue is logged as product failure, not public success.

## Exact text

“During sustained research, reassess marginal *decision-relevant novelty* after each substantial pass and compare against prior passes and unresolved evidence classes. Proactively tell the reader when returns are declining or the search appears provisionally saturated—without waiting for them to ask—using the precise scope, observed yield, remaining high-value exceptions, and recommended next research allocation. Keep access failures and unfinished audits distinct from genuine diminishing returns. Preserve the parent research mission and reopen a topic when consequential new evidence appears.”