# GitHub Actions pull-request ref namespace safety

Reviewed: 2026-08-19

## Problem

A workflow running on GitHub's `pull_request` event may need to enumerate every reachable branch, tag, and pull-request head for a history, provenance, or disclosure audit. `actions/checkout` can already create a local remote ref such as:

`refs/remotes/pull/<number>/merge`

A later fetch that maps PR heads to:

`+refs/pull/*/head:refs/remotes/pull/*`

can therefore fail. Git cannot make `refs/remotes/pull/<number>` both a ref and the parent directory of the existing `refs/remotes/pull/<number>/merge` ref.

This can be easy to misdiagnose because the same fetch may work in an ordinary local clone where the checkout-created merge ref does not exist.

## Rule

When a GitHub Actions workflow already uses `actions/checkout` and then explicitly fetches PR heads, put audit-only PR heads in a namespace that cannot collide with checkout's merge refs, for example:

```bash
git fetch --force --no-tags origin \
  '+refs/heads/*:refs/remotes/origin/*' \
  '+refs/tags/*:refs/tags/*' \
  '+refs/pull/*/head:refs/remotes/pull-heads/*'
```

Do not use `refs/remotes/pull/*` as the destination when `refs/remotes/pull/<number>/merge` may already exist.

## Verification

For workflow code that depends on complete PR-head enumeration:

- test the exact refspec shape, not merely the presence of `refs/pull/*/head`;
- include a regression that forbids the conflicting destination;
- validate in a real `pull_request` Actions run, because an ordinary local clone does not reproduce checkout's merge-ref topology;
- distinguish a ref-fetch/setup failure from the result of the substantive audit that follows it.

A job that reaches the substantive scan step after the refspec repair is evidence that the namespace collision was removed; it is not by itself evidence that the substantive scan passed.

## Origin evidence

Originating repositories:

- `u-dont-existDOTcom/pangram-humanization-lab`
- `u-dont-existDOTcom/joel-articles`

Context: post-publication secret-audit workflows on 2026-08-19. The workflows checked out PR merge refs and then attempted to fetch all PR heads into `refs/remotes/pull/*`. Git failed with an `unable to update local ref` / conflicting-ref error before Gitleaks could run. Moving audit PR heads to `refs/remotes/pull-heads/*` allowed the audit step to proceed.

## Limits

This is a Git ref-topology rule, not a general claim about all checkout implementations or every GitHub event. Recheck the actual checkout/ref state if an action version or event type changes. A separate namespace prevents this particular file/directory ref collision; it does not prove that every required remote ref was fetched or that the audit itself is complete.
