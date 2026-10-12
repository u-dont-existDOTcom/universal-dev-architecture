# Bundle the reviewed therapy AI guide r6 with the journal worker's next controlled release

- For: `u-dont-existDOTcom/innerSignalGraph`
- Filed: 2026-10-11, by the InnerSignal supervisor/release-continuation session
- From: Owner-approved development PR [#152](https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/152); precise deferred-release record [issue #154](https://github.com/u-dont-existDOTcom/innerSignalGraph/issues/154)
- Owner request: yes, 2026-10-11: "yes unless taht would interefere with the innersignal worker, in which case just put it in its lane to release it with other stuff"
- Existing pull request: journal pointer-pass [plan #151](https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/151) and [implementation #153](https://github.com/u-dont-existDOTcom/innerSignalGraph/pull/153), both open when filed
- Supersedes: none. This is release coordination only; **do not recreate or reapprove the therapy changes already merged**.
- Current disposition: DEFER LIVE RELEASE TO ACTIVE JOURNAL WORKER, triggered by that worker's next planned owner-approved coordinated release; do not interrupt its current execution.

## What to do

1. **Do not separately deploy the clinical map/rules/AI guide while the journal import worker is active.** An authorized host read on 2026-10-11 found the ongoing journal Codex worker process; #153 specifies the same live host's shared release sequencing and date/pointer work. Development `main` and `stable` have diverged. Stop/rebuilding the private MCP or promoting all of `main` while the import is running risks changing read tools, source version or the worker's in-flight data.
2. **Include the already-reviewed therapy update in the worker's release candidate.** Source is PR #152 (merged `main` commit `d0fb8c72df40f5b2a9d27d9dc1c3cbdc028de417`, Git tree `7be7f84ad5aaaa41b070b26e3edb7c664bc4b0cd`). Canonical AI Inner Child Guide r6 is `guides/inner-child-guide-2026-10-11-r6.txt`, SHA-256 `de662515b31277737eeb3529e45758411b0b0594da8f794d5cf26ed0176ef20a`. Keep r5 immutable, PGQ-029/PGQ-030 in the humanized-guide queue, and all unrelated queued items intact.
3. **Release with the other approved journal updates**, not ahead of them. When #151/#153 reach their own authorized release gate, assemble one exact candidate containing both the latest worker journal changes and the therapy map/rules/guide source. Preserve any `stable`-only functionality. Selective integration is preferred; do not promote 107+ unrelated development commits merely to carry one therapy feature.
4. **Verify the combined candidate and operator sequence:** project release evidence `docs/RELEASE-EVIDENCE.md`, independent review, deterministic full-package and clinical-safety graph cases G099–G108, Guide Packet/owner decisions, preserved private bytes and journal state, non-forced stable promotion, retained rollback image, coordinated stop/build/restart, journal read-tool continuity, and live served MCP `protocol_sha256` matching the exact release artifact. Preserve the worker's pointer-run deadlines, data, locks and reference versions across any restart. The live MCP still reported the *old* protocol hash `d10e6338649e1a93a658b08ec9b5dbe91d7008ecf52f0c15f0d4cbec18e17dd4` at handoff; it is not evidence of the r6 deploy.
5. Once the combined release is actually healthy, mark [issue #154](https://github.com/u-dont-existDOTcom/innerSignalGraph/issues/154) COMPLETE with exact install commit/tree, served protocol hash and source proof; update `docs/suggested-fixes-ledger.md` for this lane entry. If blocked, keep it QUEUED with the exact blocker. Do **not** claim stable promotion, hosted release or public-humanized-guide publication solely from the development merge.

## Why

The user's conditional authorization favors **not interfering with the ongoing import**. The worker is actively using the same application/source/runtime family and already has a planned combined deployment point. The reviewed clinical update is real and merged, but the live service has not been updated; release separately now would add a competing change window and risk regression.

## Check first

- Current worker status and checkpoint, #151/#153 plans, journal import locks and stored run state; neither journal semantic import nor pointer pass may be interrupted arbitrarily.
- Current `stable` and `main` HEADs and release scope; confirm exact file-level composition and any new conflicts instead of relying on this dated count.
- Current hosted MCP `/health` and quote/pointer tool catalog; verify the new protocol hash only from the release candidate.
- All applicable owner-decision, publication and safety gates. The current owner authorization covers the therapy release at a safe coordinated point, **not** unlimited release of unrelated journal content or publication of the humanized public guide.

## Exact worker handoff

> Owner-approved: release the already-merged therapy care-navigation map/rules/AI-guide r6 with the next safely coordinated journal worker release. Do not disturb an active import or deploy the therapy update alone. Incorporate source PR #152 and guide r6 into the combined, reviewed, exact-source stable candidate; preserve the worker's run state and publish nothing beyond the authorizations each component already has. Verify the installed MCP's new protocol hash and journal read tools before marking issue #154 deployed. If the worker is still running, leave the release queued without asking the owner to repeat this approval.
