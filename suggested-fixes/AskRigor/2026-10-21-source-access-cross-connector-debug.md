# AskRigor source retrieval missed available InfoAccess: verified cross-tool enforcement gap

- **For:** `u-dont-existDOTcom/AskRigor`
- **Type:** source-linked engineering diagnosis, not a request to add a redundant generic HRP rule.
- **Reported:** 2026-10-21, after original primary study follow-up review.
- **Owner correction:** Existing source-escalation rules should already require the work. Diagnose why execution did not apply them.
- **Status:** Root-cause narrowed and live lead route reproduced. No implementation, release, or complete product regression has been claimed.
- **Code version inspected:** AskRigor main `034da344931291c009681cd6322932dc68603b17`; HRP v20.6.27.

## Observed failure / useful discriminators

1. An exhaustive-style scientific review of infant sleep arrangements treated a named long-term follow-up as abstract-only and suggested requesting the paper. It did not use the separate, already connected **InfoAccess `get_article`** route.
2. In subsequent use of InfoAccess, the article's DOI yielded the extracted text including previously missed adult psychological-treatment counts and psychosomatic outcomes. That call consumed 10,000 provider credits. It was **a paid text-only reader**, not necessarily a free public PDF, and does not establish that a lawful free copy was retrievable at the prior time.
3. During this diagnosis the AskRigor research-use mode was observed as `ACTIVE / FREE_CONTRIBUTOR`. A fresh one-DOI `acquire_open_full_text` call with exact-title and DOI searches returned `possibly_useful_lead`, `NO_COPY_FOUND_AFTER_EXPANDED_SEARCH`, discovery attempts `europe_pmc:not_found` and `unpaywall:not_found`, and **no `owner_library` attempt**. A lead receipt was nevertheless signed; this is expected within the plugin's limited retrieval scope.
4. The complete HRP already includes `SourceAccessInventory`, `FullTextSearchTriggers`, and `UniversalFullTextAcquisitionProtocol/MandatoryProviderNeutralFullTextEscalation`. The project router and installed plugin skill direct decision-important DOIs through `acquire_open_full_text`. They do not contain a concrete, enforced **cross-application** fallback to the externally connected `InfoAccess.get_article`.

## Trace into source code: where enforcement stops

- `apps/research-mcp/src/register-tools.ts:2629-2647`: the built-in InfoAccess `owner_library` runtime is injected **only if** the environment provides the client and a verified caller is either on the owner allowlist or in `PAID_PRIVATE` mode. A free-contributor user who is not allowlisted has no route; there is no `owner_library` attempt to expose.
- `apps/research-mcp/src/infoaccess-client.ts:23-26,55`: the built-in client requires two server environment values and calls only **`get_article_pdf`**, using a free PDF route. It never calls the separately connected text tool `get_article`; that omission is deliberate in the owner-approved 2026-10-09 route plan.
- `docs/superpowers/plans/2026-10-09-owner-library-route.md`: owner made access restrictions explicit: library for owner/eligible private accounts only, public-basis gate for paid nonowner use, free users excluded; never silently weaken these policies to fix host tool-selection.
- `packages/sources/src/open-full-text.ts:162-228`: when no admitted copy is available, the response is a bounded lead and says public copy discovery is complete for the given route. **It does not know what other external apps the ChatGPT session has connected.**
- `apps/research-mcp/src/research-finalization-gate.ts:1570-1710,2216-2260`: a signed full-text lead receipt with exact searches lets `key_sources.status=lead_only` pass, resulting in `ready_with_limits`. That checks accurate plugin-bounded evidence depth; it never checks whether a separate, installed external full-text service remains usable.
- `skills/askrigor/SKILL.md`: emphasizes the AskRigor full-text chain, but gives no specific external app handoff when the chain returns a lead. This makes the model's routing decision the only bridge.
- `scripts/lib/askrigor-strict.mts` and `tests/askrigor-strict.test.ts` reject non-AskRigor tools in a **separate Codex strict-runner**. That may be a design conflict for that runner but **is not proven to have operated in the affected ChatGPT conversation**.

## Causal diagnosis, bounded

**Confirmed architecture:** the existing mandatory source-escalation rule is checked for sources the AskRigor backend knows how to fetch. The backend lacks visibility into the set of other installed ChatGPT apps, and its source-finalization receipt cannot certify that those were considered. The separate InfoAccess text tool was available and later succeeded, but the research model did not select it before ending the earlier review.

**Not established:** a missing production InfoAccess token, an absent owner allowlist entry, a license denial, a general outage at the time, or a psychological cause for model tool nonselection. The live absence of an `owner_library` attempt is consistent with the documented free-account gate **or** an unconfigured client. Neither is needed to explain why the separate tool was overlooked. Likewise the strict Codex runner cannot be blamed for a regular ChatGPT reply.

**Secondary issue:** the backend accepts only its own signed full-text/audit receipts as `validated`; licensed text read through an outside connected tool cannot automatically become an AskRigor-verified original audit. The user-facing result therefore needs a truthful `externally_read; audit_not_server_validated` category instead of falsely downgrading a read paper to abstract-only or laundering an external read into a signed AskRigor audit.

## Minimal credible repair (not a second HRP 'must search full text' paragraph)

1. **Host-side selection:** after a material DOI returns `possibly_useful_lead`, before concluding a systematic/deep review, inventory currently available authorized *other* scholarly tool actions (especially InfoAccess `get_article`) and any current credit/permission gate. Where permitted, use the smallest route likely to change the answer. Where it is chargeable or unavailable, report its explicit disposition and proceed with appropriately bounded conclusions. Do not send user data beyond citation identifiers.
2. **Make the tool boundary explicit:** `acquire_open_full_text` and the plugin skill should distinguish “no admitted full text through AskRigor's attempted routes” from “full text unavailable to ChatGPT.” Name an **external connector handoff** as a next step when the caller tool can exist, without claiming that the server sees the user's installed apps.
3. **Finalizer scope and provenance:** let the model declare for each decision-critical lead whether an external route was considered, attempted and read, unavailable, or blocked by cost/permission. Preserve the distinction between a *self-declared external read* and an *AskRigor signed audit*. Do not pretend that server-side declarations prove an external tool was installed or called; fresh chat tool-trace regression is essential. Keep `ready_with_limits` for truly blocked cases, but do not certify 'exhaustive' research when an available authorized actionable handoff remains.
4. **Do not weaken owner library controls:** `get_article_pdf` free endpoint and allowed subjects are separate from a user's directly connected, potentially paid InfoAccess `get_article`. Neither free users nor other users may inherit private library access. Do not automatically spend external provider credits or copy proprietary raw article text into public/submitted research contributions.

## Necessary regression: fresh connected ChatGPT surface, not only source-level unit tests

- **Positive:** AskRigor research account free-contributor, separate InfoAccess tool connected and usable, decision-critical DOI absent from PMC/Unpaywall; AskRigor returns signed `lead_only`. **Pass:** the agent identifies the separate accessible route; calls it when approved within its cost policy, or accurately states the cost gate before stopping, then incorporates measured outcomes and duplicates correctly. **Fail:** says no full study available, suggests user upload, never checks tools. Verify actual tool-call trace.
- **Negative 1:** no InfoAccess connection / quota exhausted / account lacks permission. **Pass:** bounded lead with exact blocker and remaining conclusion uncertainty, no imaginary route, no indefinite retries.
- **Negative 2:** external reader returns extracted text but no PDF/figures/tables and no AskRigor audit. **Pass:** accurately identifies partial or externally inspected study and audits what is legitimately available; never claims server-validated full study.
- **Negative 3:** signed owner library PDF path actually available. **Pass:** existing `acquire_open_full_text` flow works without duplicating a paid external call.
- **Negative 4:** linked study is not decision-relevant. **Pass:** no unnecessary provider expense and no aggressive escalation.
- **Boundary:** Codex strict runner other-tool rejection must be scoped to *that runner* or explicitly redesigned if cross-app source retrieval becomes a requirement there; a passing strict-runner test cannot replace ChatGPT connected-app acceptance.

## Next engineering step

Implement only source-access handoff and truthfulness of the completion boundary, using owner-approved budgets/privacy. Run deterministic unit tests plus a fresh ChatGPT AskRigor+InfoAccess test on this actual failure class. Log which tool was visible, why the fallback was or was not attempted, whether a charge gate applied, and whether the cited long-term outcome was incorporated. Do not mark the problem fixed from XML wording, a new lesson in the queue, or a green local finalizer alone.
