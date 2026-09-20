# Artifact Authority Promotion and Supersession

**Status:** Required universal authority-control pattern  
**Date:** 2026-09-20

## Purpose

Keep experimental, review, staging, generated, detector-scored, and recovery artifacts from silently becoming current or canonical project authority.

The core rule is:

> **Evidence that an artifact is good, passing, recent, or useful is not evidence that it has been promoted into authority.**

## Failure model

A common authority-laundering sequence is:

`source/rough input -> experiment -> evaluator PASS -> producer says solved/current -> later state supersedes it -> stale assembly ignores supersession -> downstream consumer treats assembly as authority`.

## Promotion admission

A non-authoritative artifact becomes current/canonical only through an explicit promotion event.

The promotion record must bind, at minimum:

- exact artifact identity: path plus cryptographic hash or immutable object identity;
- prior authority/provenance class;
- destination authority role;
- acceptance authority/actor and evidence;
- destination location;
- displaced or superseded artifact and its disposition;
- effective state/checkpoint that now carries the promoted artifact;
- timestamp or monotonic state identity sufficient to order later supersession.

A project may use a registry, manifest, current-state file, lock file, database row, Git tag/release, or another machine-readable authority mechanism. The exact mechanism is project-specific; the admission semantics are not.

## Things that never promote an artifact by themselves

None of these is promotion authority unless the project explicitly defines it as the promotion mechanism:

- a test/evaluator/detector passing;
- an assistant/worker saying `solved`, `done`, `accepted`, `current`, or similar;
- producer self-review;
- owner silence or absence of immediate objection;
- newest timestamp, filename, commit, or branch;
- inclusion in a review, rolling, cumulative, or `current assembly`;
- successful publication/render/build preview;
- presence in a handoff packet;
- a reviewer saying the candidate is ready;
- high score, benchmark improvement, or confidence;
- source similarity or provenance alone.

## Supersession admission

Authority resolution must be monotonic with respect to explicit supersession.

If later controlling state says an earlier artifact is superseded, rejected, withdrawn, unresolved, reverted, or replaced, downstream indexes, assemblies, summaries, dashboards, handoffs, and generated views must not continue projecting the earlier artifact as current.

Before a consumer labels an artifact current, it must resolve all applicable later supersession records in the project authority chain.

If an earlier state says `accepted/current/solved` and a later controlling state says `unresolved/superseded/rejected`, the consumer must fail closed to the later state. It may not select the older artifact because it has a stronger score or appears more complete.

## Snapshot labeling

A snapshot label describes capture time, not authority.

Names such as `current_assembly`, `latest_review`, `working_copy`, `rolling_article`, or `accepted_batch` must not be consumed as canonical authority unless the snapshot is itself the project's explicit authority object.

Historical/review snapshots should record:
- authority class;
- source authority used to build them;
- generation time;
- whether they are authoritative or derived;
- which later supersession check controls their use.

## Authority-uncertain state

When current authority cannot be proven, report:

`AUTHORITY_UNRESOLVED`

or the project-equivalent explicit state.

Do not choose by recency, filename, evaluator result, remembered conversation, producer confidence, or apparent completeness. Recover the promotion/supersession evidence or obtain the missing authority decision.

## Derived-view invariant

Generated indexes, coverage maps, dashboards, review assemblies, handoff packets, and summaries are **derived views** unless explicitly declared otherwise.

A derived view must:
1. name its source authority;
2. resolve later supersession before use;
3. never upgrade provenance or acceptance class;
4. retain a way to trace each current-looking item back to its promotion event;
5. fail closed when that trace is absent or contradictory.

A derived view may report that an experimental artifact passed an evaluator. It may not turn that result into current authority.

## Owner correction and promotion

A direct owner correction can itself be the highest semantic authority, but durable current state still needs reconciliation.

When the owner supplies or selects exact replacement content:
1. preserve the exact owner instruction/content;
2. classify its provenance;
3. update the current authority object or create a promotion receipt;
4. record what it supersedes;
5. update derived views after authority, not before.

Do not leave a durable repository in a state where chat has the owner correction but current repository authority still points elsewhere.

## Unregistered/incubator projects

For a project that deliberately lacks a canonical registered master:
- experimental work may continue only within the project's explicit incubator rules;
- no derived assembly may masquerade as canonical/current authority;
- any task that depends on exact current content must either use an explicitly bound working source or stop with `AUTHORITY_UNRESOLVED`;
- if the project's own intake/state says registration/import is the next required mechanical step, later substantive work must not silently outrun that prerequisite.

## Required hostile fixtures

At minimum, project tests or reviews should cover:

1. Experimental candidate passes evaluator but has no promotion receipt -> remains experimental.
2. Assistant marks candidate `solved` without authority event -> remains experimental.
3. Earlier state promotes candidate; later controlling state marks section unresolved -> downstream view resolves unresolved.
4. Historical snapshot contains superseded candidate -> consumer does not project it as current.
5. Two competing promotion claims with no controlling supersession -> `AUTHORITY_UNRESOLVED`.
6. Direct owner exact replacement is captured but repository authority not updated -> task remains reconciliation-incomplete.
7. Unregistered project intake says registration is next required step -> substantive authority-dependent work cannot pretend a review assembly is the master.

## Relationship to other patterns

This pattern complements:
- `codex-github-operating-system.md`: repository durability and current-state recovery;
- `durable-chat-learning.md`: durable state and provenance;
- `context-compaction-resilience.md`: recovery after context loss;
- `owner-outcome-invariant-and-contract-laundering-prevention.md`: owner outcome authority;
- `transformation-preservation-proof.md`: source-to-target semantic integrity.

It does not define project-specific semantic authority. It controls how an artifact crosses from one authority class to another and how later supersession is propagated.
