# Stop the workflow-policy check from flagging its own source

- For: `u-dont-existDOTcom/communities`
- Filed: 2026-10-08, by the universal-architecture maintainer session while wiring this project's suggestion lane
- From: the `workflow-policy` check in `.github/workflows/repository-workflow-policy.yml`, which has failed on every run on `main` since it was added on 2026-08-14
- Owner request: no
- Existing pull request: none
- Supersedes: none

## What to do

Make the workflow-policy checker skip its own embedded source, or replace the workflow with the current `templates/WORKFLOW-POLICY.yml` from `u-dont-existDOTcom/universal-dev-architecture`, whose regression `test_template_does_not_flag_its_own_embedded_source` covers this case. Keep every real rule: explicit top-level permissions, no `write-all`, no checkout of pull-request code under `pull_request_target`, and full-SHA pinning of remote actions.

## Why

The checker scans the text of every workflow file. Its own file contains the string `pull_request_target` (inside the check) and a pinned `actions/checkout` step, so it reports "pull_request_target must not check out or execute untrusted pull-request code" against itself. The check has been red on `main` and on every pull request since it was added, which hides real failures and blocks any merge that requires green checks.

## Check first

- Confirm the only finding on `main` is that self-match in `repository-workflow-policy.yml`.
- After the fix, the check passes on `main`, and a workflow that really combines `pull_request_target` with a checkout of pull-request code still fails it.
