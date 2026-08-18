# Persistent browser automation hygiene

## Rule

Persistent browser profiles should persist **authentication and intentional application state**, not uncontrolled tab/session history.

For headed browser automation that uses a persistent Chromium-family profile:

1. start ordinary automation runs from a bounded working-tab set, normally one tab;
2. explicitly close restored or newly-created tabs that are no longer needed;
3. before clean shutdown, reduce the context to one inert tab (for example `about:blank`) when the browser would otherwise restore all open tabs next time;
4. treat temporary multi-tab state as execution state, not durable user-facing state;
5. preserve a special recovery mode only when pre-existing tabs may contain evidence from an already-paid or irreversible action, and clean them after recovery.

## Asynchronous GUI completion

Do not infer task completion from a generic marker on the page that initiated an asynchronous action. The application may:

- navigate the same page;
- open a result in another tab/window;
- leave the initiating dashboard unchanged;
- briefly expose a generic loading/result label before the actual artifact is ready.

Bind completion to the **expected output artifact itself**. Depending on the task, require some combination of:

- exact task/input identity or stable anchors;
- expected record/document/hash identity;
- exact parsed item/word/row count;
- task-specific completion state;
- expected model/version/status;
- output URL or artifact provenance.

When multiple pages are possible, inspect the active context and select the page that satisfies the exact artifact contract. Do not assume the original controlled page remains authoritative.

## Paid / irreversible action boundary

For paid, destructive, privileged, or otherwise irreversible browser actions:

- reserve/log the action durably before the click when the project has a budget or call ledger;
- once the click may have happened, treat a capture/navigation failure as ambiguous;
- search existing pages/history/recovery surfaces before any repeat;
- never repeat merely because the initiating page failed to display the expected result;
- preserve enough non-secret evidence to distinguish `action_not_attempted`, `action_may_have_happened`, and `result_recovered`.

## Diagnostics and privacy

Browser diagnostics should record structural information needed for recovery without copying credentials or private session state. Prefer:

- safe URL path without query/fragment secrets;
- page/tab count;
- titles and bounded control labels;
- structural marker booleans;
- body/DOM size counts rather than arbitrary excerpts;
- screenshots only when appropriate for the project's privacy boundary.

Never commit cookies, local/session storage values, passwords, auth tokens, or browser profile directories.

## Origin and evidence

Promoted 2026-08-18 from `u-dont-existDOTcom/pangram-humanization-lab` after a live Zorin/Playwright incident:

- a persistent Brave automation profile accumulated restored tabs because context shutdown did not explicitly normalize them;
- a paid Pangram GUI action was accepted, but the runner stayed bound to the dashboard and used a generic report-ready marker; the saved dashboard body contained the submitted text but no parseable result segments;
- the exact paid action was therefore treated as ambiguous and blocked from automatic repeat;
- the project repair added explicit tab normalization, one-tab inert shutdown, exact multi-page report binding, and recovery-before-repeat.

Project-local exact evidence remains in:

`state/PANGRAM-LOCAL-TAB-REPORT-INCIDENT-2026-08-18.md`

on the Pangram local-Playwright task branch.

## Limits

- Some applications intentionally require several simultaneous tabs/windows; the rule is bounded intentionality, not a universal one-tab UI.
- Closing tabs before inspecting them can destroy recoverable evidence after an ambiguous paid/irreversible action; recovery mode must run first when that risk exists.
- An exact artifact contract is application-specific. Do not replace one generic marker with another generic marker merely to satisfy this pattern.
