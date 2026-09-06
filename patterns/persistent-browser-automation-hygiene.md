# Persistent browser automation hygiene

## Rule

Persistent browser profiles should persist **authentication and intentional application state**, not uncontrolled tab/session history.

For headed browser automation that uses a persistent Chromium-family profile:

1. start ordinary automation runs from a bounded working-tab set, normally one tab;
2. explicitly close restored or newly-created tabs that are no longer needed;
3. before clean shutdown, reduce the context to one inert tab (for example `about:blank`) when the browser would otherwise restore all open tabs next time;
4. treat temporary multi-tab state as execution state, not durable user-facing state;
5. preserve a special recovery mode only when pre-existing tabs may contain evidence from an already-paid or irreversible action, and clean them after recovery.

### Managed ChatGPT tab discipline

For automation-owned ChatGPT tabs, the following more-specific owner rule is universal:

1. A fresh conversation means selecting **New chat in the current verified reusable ChatGPT tab**. It does not mean opening another browser tab by default.
2. Steady state is one managed ChatGPT tab.
3. Two managed ChatGPT tabs are allowed only during a bounded transition or recovery.
4. Three managed ChatGPT tabs are the absolute hard ceiling. Fail closed before opening a fourth.
5. A replacement tab is allowed only after the current tab is irrecoverably unusable. Once the replacement is verified, close the superseded automation-owned tab immediately.
6. Never fan out duplicate tabs for the same task.
7. Doctor and status telemetry must include `managedChatGptTabCount` plus the one/two/three limits.
8. On provider-session completion or supersession, clean automation-owned ChatGPT tabs deterministically back toward the one-tab steady state while preserving the surviving tab for reuse.
9. Do not keep bootstrap or pinned automation-owned tabs open merely for history when durable capability, receipt, and URL records already exist.

These limits apply to automation-managed ChatGPT tabs, not unrelated owner-controlled tabs. An ambiguous paid, destructive, or irreversible action still enters recovery mode before any evidence-bearing tab is closed.

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

## Application history is not browser history

For single-page applications, the browser's global browsing-history database is not authoritative evidence of the application's own saved records. A result can remain available in the authenticated application while no corresponding route appears in Chromium/Chrome/Brave's `History` SQLite database. Client-side routing, in-place rendering, application state, or API-backed record lists can all produce that condition.

For recovery of an already-paid, destructive, privileged, or otherwise irreversible action:

1. treat restored tabs/session history as opportunistic evidence, not the only recovery source;
2. do not conclude that a result is gone merely because browser-history lookup returns zero matching URLs;
3. prefer the authenticated application's own read-only History/records UI, rendered links, and read-only data responses;
4. inspect only the minimum application-specific identity needed for recovery and discard response bodies after in-memory matching;
5. bind every recovered candidate back to the exact expected artifact before clearing ambiguity;
6. keep browser-global history as a fallback clue, not a source of application truth.

If the application exposes private record identifiers or result URLs, do not print or commit them merely to debug recovery. Log counts, structural routes, and exact verification outcomes instead.

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

Never commit cookies, local/session storage values, passwords, auth tokens, browser profile directories, or arbitrary authenticated response bodies.

## Origin and evidence

Promoted 2026-08-18 from `u-dont-existDOTcom/pangram-humanization-lab` after a live Zorin/Playwright incident:

- a persistent Brave automation profile accumulated restored tabs because context shutdown did not explicitly normalize them;
- a paid Pangram GUI action was accepted, but the runner stayed bound to the dashboard and used a generic report-ready marker; the saved dashboard body contained the submitted text but no parseable result segments;
- the exact paid action was therefore treated as ambiguous and blocked from automatic repeat;
- the project repair added explicit tab normalization, one-tab inert shutdown, exact multi-page report binding, and recovery-before-repeat.

Extended 2026-08-19 from the same incident after a no-repeat recovery run:

- all owner-machine deterministic tests passed;
- the dedicated automation profile's Chromium `History` databases contained zero Pangram result URLs even though Pangram's authenticated application contract says submitted scans remain available in account History;
- therefore browser-global history was falsified as an authoritative recovery source for this SPA;
- the project recovery path moved to authenticated application History DOM/record identities and read-only response discovery, while preserving exact-bound verification and the no-repeat paid-call block.

Project-local exact evidence remains in:

- `state/PANGRAM-LOCAL-TAB-REPORT-INCIDENT-2026-08-18.md`
- `state/PANGRAM-LOCAL-PLAYWRIGHT-CURRENT-STATE-2026-08-18.md`

on the Pangram local-Playwright task branch.

## Limits

- Some applications intentionally require several simultaneous tabs/windows; the rule is bounded intentionality, not a universal one-tab UI.
- Closing tabs before inspecting them can destroy recoverable evidence after an ambiguous paid/irreversible action; recovery mode must run first when that risk exists.
- An exact artifact contract is application-specific. Do not replace one generic marker with another generic marker merely to satisfy this pattern.
- Application History may itself be incomplete, deleted, expired, permission-scoped, or unavailable; the rule is about authority ordering, not a guarantee that every result can be recovered.
