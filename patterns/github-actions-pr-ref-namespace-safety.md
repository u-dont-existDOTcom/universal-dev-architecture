# GitHub Actions pull-request ref and self-observation safety

Reviewed: 2026-08-19

## Problem 1: PR ref namespace collisions

A workflow running on GitHub's `pull_request` event may need to enumerate every reachable branch, tag, and pull-request head for a history, provenance, or disclosure audit. `actions/checkout` can already create a local remote ref such as:

`refs/remotes/pull/<number>/merge`

A later fetch that maps PR heads to:

`+refs/pull/*/head:refs/remotes/pull/*`

can therefore fail. Git cannot make `refs/remotes/pull/<number>` both a ref and the parent directory of the existing `refs/remotes/pull/<number>/merge` ref.

This can be easy to misdiagnose because the same fetch may work in an ordinary local clone where the checkout-created merge ref does not exist.

## Rule 1: separate audit PR-head refs

When a GitHub Actions workflow already uses `actions/checkout` and then explicitly fetches PR heads, put audit-only PR heads in a namespace that cannot collide with checkout's merge refs, for example:

```bash
git fetch --force --no-tags origin \
  '+refs/heads/*:refs/remotes/origin/*' \
  '+refs/tags/*:refs/tags/*' \
  '+refs/pull/*/head:refs/remotes/pull-heads/*'
```

Do not use `refs/remotes/pull/*` as the destination when `refs/remotes/pull/<number>/merge` may already exist.

## Problem 2: workflow-log self-observation deadlocks

An audit may also enumerate recent Actions runs and download their logs. If the current workflow run appears in that inventory, code like:

```bash
gh run view "$run_id" --log
```

can request the audit's **own nonterminal log**. That creates a recursive completion dependency: the command may not return a terminal log until the current run completes, but the current run cannot complete until the command returns.

Whether this reproduces can be timing-dependent because the current run may or may not have appeared in the run-list API by the time enumeration happens. A successful run that happened not to see itself therefore does not prove the code is safe.

## Rule 2: exclude the current run explicitly

When a workflow inventories Actions logs, capture GitHub's current run identifier and skip it:

```bash
current_run_id="${GITHUB_RUN_ID:-}"
for run_id in "${run_ids[@]}"; do
  if [[ -n "$current_run_id" && "$run_id" == "$current_run_id" ]]; then
    continue
  fi
  gh run view "$run_id" --log > "..."
done
```

Do not rely on the current run being absent from `gh run list`, API ordering, status filtering by accident, or eventual-consistency timing.

If the audit's purpose requires a complete record including the current run, inspect that run only **after** it has reached a terminal state from a different execution context.

## Verification

For workflow code that depends on complete PR-head or Actions-run enumeration:

- test the exact PR-head refspec shape, not merely the presence of `refs/pull/*/head`;
- include a regression that forbids the conflicting `refs/remotes/pull/*` destination;
- assert that `GITHUB_RUN_ID` is explicitly excluded from in-workflow log enumeration;
- validate in a real `pull_request` Actions run, because an ordinary local clone does not reproduce checkout's merge-ref topology and a local script cannot reproduce self-observation of its own Actions run;
- distinguish ref-fetch/setup failures, self-observation stalls, scanner findings, and unrelated repository gates as separate failure classes.

A job that reaches the substantive scan step after a refspec repair is evidence that the namespace collision was removed; it is not by itself evidence that the substantive scan passed. Likewise, one lucky run that completes without explicit self-exclusion does not establish self-observation safety.

## Origin evidence

Originating repositories:

- `u-dont-existDOTcom/pangram-humanization-lab`
- `u-dont-existDOTcom/joel-articles`

Context: post-publication secret-audit workflows on 2026-08-19.

First, the workflows checked out PR merge refs and then attempted to fetch all PR heads into `refs/remotes/pull/*`. Git failed with an `unable to update local ref` / conflicting-ref error before Gitleaks could run. Moving audit PR heads to `refs/remotes/pull-heads/*` allowed the audit step to proceed.

Second, the same audits enumerated up to 1,000 Actions runs and retrieved each log. Pangram's audit then remained in the log-collection step abnormally long while its current run was eligible to appear in that inventory. The durable correction was to exclude `GITHUB_RUN_ID`; the same latent fix was applied to `joel-articles` even though one earlier run completed, because API timing is not an authorization or liveness guarantee.

## Limits

These are Git/GitHub execution-topology rules, not general claims about every checkout implementation, event type, or CLI version. Recheck actual hosted behavior if the event, checkout action, GitHub API, or `gh` semantics change.

A separate PR-head namespace prevents this particular file/directory ref collision; it does not prove every required remote ref was fetched. Excluding the current run prevents this particular recursive log dependency; it does not prove every historical log is retrievable or complete. Keep unavailable/expired log counts explicit rather than silently treating them as scanned.
