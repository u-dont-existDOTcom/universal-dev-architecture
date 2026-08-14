# Editorial Authority and Lossless Editing

## Problem

Long-form content projects often accumulate masters, drafts, source packets, owner corrections, detector experiments, rejected cuts, publication HTML, and chat summaries in different places. Without an explicit authority boundary, a worker can edit the wrong master, silently discard a unique thought, turn a detector score into editorial authority, publish private context, or call governance scaffolding “canonical content.”

The durable pattern is to establish a complete, self-contained authority family before substantive editing and to make loss, uncertainty, and publication state explicit and reviewable.

## Prove authority before editing

Recover repository and project state before touching prose. Identify:

1. the current explicit owner instruction and acceptance criteria;
2. the registered master and its exact version;
3. owner-final decisions, exact locks, and protected rhetorical functions;
4. source/evidence, citation, editorial, and detector records;
5. unincorporated ideas, rejected cuts, and current recovery state;
6. publication/export authority and destination status.

If the project contains no registered master, stop content editing and represent the import as blocked. If competing masters plausibly claim authority, stop for an owner decision. Do not synthesize a new canonical master from notes, summaries, filenames, an external packet, or remembered chat.

Current explicit owner instruction outranks a stale registry or master. Repair the durable record after resolving the conflict; do not leave chat as the only correction.

## Keep one complete, self-contained artifact family

Keep each article or content unit inside one obvious boundary. A useful family includes:

- current master;
- exact owner-lock and protected-function manifest;
- source/evidence index;
- unincorporated ideas and rejected material;
- current-state checkpoint;
- citation disposition;
- detector evidence, when used;
- editorial acceptance status;
- publication/export records;
- additional artifacts such as approved images, HTML, or supporting notes.

Register every authoritative file and approved supporting artifact. Bind identity with exact repository path and immutable version evidence such as a Git blob or SHA-256. Inventory checks should reject unregistered family files, detached authority roots, and symlink traversal that makes one content unit depend on mutable files outside its boundary.

A hash detects byte changes; it does not decide which candidate should be authoritative. Selection remains an owner/editorial decision.

## Preserve exact owner locks and protected functions

An owner lock may protect exact wording, but editorial fidelity also includes function: argument, agency, sequence, severity, joke, transition, realization, or promised reader outcome.

For each lock, record:

- a stable identifier;
- exact protected text when wording is locked;
- immutable text hash;
- protected rhetorical function;
- durable owner-review status and evidence.

Before owner-final or published status, require confirmed owner review rather than inferring approval from the absence of objections. Automated checks can prove that exact text remains present and that required fields agree; they cannot prove semantic fidelity. Re-read the master article-wide.

## Make deletion and consolidation reversible

Inventory unique claims, steps, examples, jokes, owner realizations, and protected functions before editing. Treat every cut, condensation, relocation, and replacement as a proposed transformation.

Record:

- the original text or exact source location;
- why the change is proposed;
- its destination or genuine semantic equivalent;
- explicit owner approval when equivalence is not exact;
- the disposition of rejected cuts and unincorporated ideas.

“Redundant,” “inferable,” “smoother,” and “better for the detector” are not deletion authority. A later worker must be able to recover what changed and why without reconstructing it from Git archaeology or chat.

## Keep citations and detector evidence subordinate

Attach evidence and uncertainty to claims, not merely to paragraphs. Distinguish verified, inaccessible, disputed, owner-only, unresolved, and not-applicable claims. Never fabricate a citation, and never flatten an argument merely because a strong source is hard to obtain.

Detector results are passage-, service-, model-, version-, and time-specific evidence. In this universal pattern, detector use is optional unless a project explicitly requires it. A detector score never outranks meaning, owner locks, facts, article-wide architecture, or voice; a green result cannot license distortion or deletion.

Keep review-file status consistent with the central registry so a stale local record cannot silently certify a different state.

## Bind publication and export provenance

For each draft or published export, record:

- exact file/version hash;
- destination;
- source authority;
- draft, published, or superseded status;
- owner publication approval when required;
- destination-specific validation evidence.

Rendered previews, editor HTML, transfer artifacts, and native destination objects are different validation planes. The project must say which source format is authoritative. A passing repository gate does not grant publication authority.

## Represent blocked and empty states truthfully

Governance may be complete while content import remains blocked. An empty incubator can pass structural tests only when the registry is empty and no detached article content exists. The reciprocal matters: once a complete article family is registered, repository status must no longer claim that no import exists.

For public or high-risk content, record license, copyright, privacy, private-reporting, branch-rule, secret-scanning, and publication controls as enabled, disabled, unverified, or owner-decision-required. Do not publish a supplied fact/source packet merely to make the repository look complete.

## Verification and closeout

Use causal tests for the failure modes the policy claims to prevent: missing references, mismatched hashes, absent owner locks, review-status drift, unregistered files, detached roots, and every symlink component. Run those structural gates alongside human semantic, source, citation, cold-reader, and publication checks.

The durable pull request or checkpoint should bind:

- exact content boundary and non-goals;
- before/after master identity;
- owner locks and deletion audit;
- citation, detector, editorial, and publication evidence;
- exact code/content-bearing commit and test runs;
- residual uncertainty and next safe action;
- lesson disposition.

Passing automation validates recorded structure and integrity. It does not prove factual truth, semantic equivalence, owner identity, or publication readiness.

## Origin evidence

- Originating repository: `u-dont-existDOTcom/joel-articles`
- Promotion date: 2026-08-14
- Origin merge: `c0d73ba6e983a4d93ceec1799ad4ac7f526b61db` (PR #4)
- Final reviewed code-bearing head: `dcde124ef2f983c5027d85481f9aa33b2c353d9b`
- Code-bearing verification: run `31785508088`, job `94720404470`, 56 tests, content gate passed with a truthful empty/BLOCKED registry, repository audit 0 errors/4 truthful warnings
- Merge-head verification: run `31785689319`, job `94720962087`, success

Exact source artifacts at the origin merge:

- authority/import protocol: `docs/CONTENT-AUTHORITY-AND-IMPORT.md`, Git blob `8ac3b6e989c946d4ebce29f286486515437b0fe6`;
- validator: `scripts/validate_content_repository.py`, Git blob `c28ad9c03adb6275228e9cfc7356c39b24949e6d`;
- causal regressions: `tests/test_validate_content_repository.py`, Git blob `4b7825f03702271c6b5c61dfbe98f34a82fe0a0c`;
- article-local agent policy: `articles/AGENTS.md`, Git blob `e1a8a9af0d3a3a6d4d26fdd9650a330af55fe6cd`;
- empty truthful registry: `articles/INDEX.json`, Git blob `b7820a275f110713d85621b91b1743099d76d2fb`;
- external packet disposition: `docs/SUPPLIED-SOURCE-PACKET-MANIFEST.md`, Git blob `4367f83276e024bad0f950170fea3d466cb395d4`.

No article master or packet contents were promoted. The origin repository intentionally remained BLOCKED on the first owner-authorized article import, copyright/license choice, and hosted-control follow-up.

## Project-local choices

Projects may choose different filenames, schemas, review-status vocabularies, hash formats, source layouts, or publication systems. They may allow reviewed content-addressed dependencies instead of a blanket symlink ban. The invariant is explicit, immutable, reviewable authority with no silent cross-boundary dependency.

Joel-specific facts, voice rules, article catalogues, Substack helpers, detector thresholds, source packets, and publication decisions remain project-local. Do not copy them into a universal template.

## Limits

- This pattern does not prove factual truth or that a claimed owner-confirmation record was created by the owner; trusted review remains necessary.
- It does not grant publication authority or decide a license, copyright, privacy release, citation judgment, or canonical-master dispute.
- Detector use is optional and project-specific; absence of a detector run is not automatically a defect.
- Exact text preservation can coexist with broken structure or meaning; run article-wide semantic review.
- Hash and inventory checks detect known integrity failures, not every possible editorial loss.
- A conservative self-contained boundary may be adapted for reviewed, immutable external assets, but the dependency and authority must stay explicit.
