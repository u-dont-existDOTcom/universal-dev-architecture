# Source Wording vs Retrospective Interpretation

## Problem

Agentic work often begins with a sparse source: a remembered sentence, user requirement, interview answer, incident report, design note, or earlier decision. Later reasoning may reveal a richer interpretation that explains why the source mattered. The dangerous failure is to let that useful interpretation overwrite the source itself.

A good synthesis can become a false memory: the worker starts saying that the original speaker stated the later interpretation, then uses the misattributed version as authority for downstream architecture, tests, or edits.

## Core invariant

Keep **source wording/provenance** and **later interpretation** as separate records.

For any load-bearing remembered or quoted source, preserve:

- the exact wording when available;
- who said or wrote it;
- when/where it came from when known;
- whether it is quotation, paraphrase, inference, or later interpretation;
- the certainty of each layer;
- every downstream decision that depends on the interpretation rather than the source itself.

A later interpretation may illuminate what the source came to mean. It does not retroactively become what the source said.

## Scope discipline

A source can generate an entire project without governing every local component of that project.

Before using an article-level, product-level, or project-level origin idea as the controlling mechanism of a local section/task, ask:

1. What is the local heading/function actually promising?
2. Which part of the origin idea is necessary here?
3. Is the worker forcing the whole project thesis into a boundary that has a narrower job?
4. Does the richer interpretation belong elsewhere in the artifact family?

Do not turn a generative origin point into a universal local checklist merely because it helped inspire the larger work.

## Epistemic scope statements should name the actual source of knowledge

A scope disclaimer is more informative when it tells the reader **why** the author is limiting the claim.

Compare the functions:

- generic: `This is not universally applicable.`
- epistemically grounded: `This comes from my experience`, `this is based on the cases I observed`, `this conclusion comes from these interviews`, or another accurate source-of-knowledge statement.

The second form is not merely more personal. It tells the reader what kind of evidence produced the claim and therefore how far to generalize it.

For first-person, qualitative, research, product, or incident writing:

1. identify whose experience/data/observation supports the statement;
2. name important external influences or evidence classes when they materially shaped it;
3. avoid generic caveats that sound responsible but leave the epistemic basis implicit;
4. do not add personal provenance that is false or irrelevant merely to make prose feel individualized.

A small pronoun or possessive can therefore carry real function when it identifies the source (`my experience`, `our logs`, `their interviews`). Do not reduce such cases to lexical rules. Ask what provenance information disappeared when the word disappeared.

## Correction procedure

When the owner/source corrects a misattribution:

1. preserve the exact corrected source wording and provenance;
2. mark the former interpretation as retrospective rather than source-authored;
3. identify dependent candidates, tests, summaries, and lessons that encoded the wrong provenance;
4. invalidate or annotate those dependents without deleting the historical evidence;
5. reconstruct local architecture from the corrected source plus the actual local function;
6. promote the transferable provenance lesson separately from project-specific content.

Detector scores, passing tests, or polished prose do not rehabilitate a candidate built on false provenance.

## Why this transfers

The same failure occurs in:

- editorial reconstruction: a later paraphrase is attributed as an exact remembered quote;
- software requirements: an implementation rationale becomes “what the user requested”;
- debugging: a post-hoc explanation becomes “what the original log proved”;
- research synthesis: an interpretation becomes “what the paper said”;
- product design: a derived constraint becomes “the original requirement.”

In every case, provenance drift creates false authority and can force downstream work into the wrong architecture.

The epistemic-scope principle transfers too: a reader interprets `based on my experience`, `from our telemetry`, or `from these interviews` differently from a generic disclaimer because the phrase identifies the evidence class behind the claim.

## Origin evidence

- Originating repository: `u-dont-existDOTcom/pangram-humanization-lab`
- Initial origin artifact: `state/ROMANCE-AUTHORIAL-SUFFICIENCY-CALL-EFFICIENCY-2026-08-13.md`
- Owner correction date: 2026-08-15
- Corrected origin commit: `6ebc29e1410e6287560c0e6b46e4c7fc468164da`
- Failure class: a later readiness/co-parenting interpretation was mistakenly attributed as the father's direct childhood advice and then used as the controlling mechanism for a narrower local section.
- Follow-up evidence artifact: `state/ROMANCE-OPENING-PERSONAL-PROVENANCE-2026-08-15.md`
- Follow-up correction commit: `3caffa09657a14f0f3e9cc1353702ccafe32aca1`
- Follow-up observation: in owner-reported controlled opening variants, removing explicit personal/source provenance weakened the detector confidence classification; removing only the possessive from `my experience` did the same in the shorter variant. The transferable lesson promoted here is epistemic-source clarity, **not** a detector rule about possessives or first-person words.

The project-specific quotation, detector classifications, and Romance content remain in the originating private repository. This universal pattern promotes only provenance, epistemic-positioning, and scope-control lessons.

## Limits

- Interpretation is not prohibited; many projects depend on it. The requirement is to label it accurately.
- Exact quotation is not always available. When it is not, mark the source as paraphrase or uncertain memory rather than inventing precision.
- A project-level origin idea may legitimately govern a local task when the local function truly depends on it. The rule is to verify the dependency, not to sever it automatically.
- Explicit provenance is not automatically better prose. Do not add it where the evidence source is already obvious, irrelevant, or would clutter the sentence.
- A detector response to a possessive or provenance clause is boundary-specific evidence. Never generalize it into a token whitelist.
