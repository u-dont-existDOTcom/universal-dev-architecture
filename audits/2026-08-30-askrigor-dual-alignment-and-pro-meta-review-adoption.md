# AskRigor Contract-Integrity Critique — Adoption and Disposition

**Date:** 2026-08-30  
**Source review:** `reviews/2026-08-30-contract-integrity-review.md`  
**Owner addition:** Codex workers must route substantive supervision-design improvements/questions to a Pro chat.

## Disposition

**ACCEPTED AND STRENGTHENED.**

The critique correctly identifies that the owner-outcome hotfix remained too dependent on instruction-following unless Mission Control exposes contract integrity as a separate machine state with independently acquired source evidence.

The owner’s Pro-check-in addition is implemented as a shared scope-bound Pro meta-review lane, not one additional Pro chat per worker.

## Suggestion-by-suggestion mapping

| Critique / owner requirement | Disposition | Implemented in |
|---|---|---|
| Separate worker-to-contract and contract-to-owner alignment | Accepted | `patterns/supervision-assurance-planes-and-pro-meta-review.md`; `templates/OBJECTIVE-RECONCILIATION.json`; bootstrap; task/state/active-task templates |
| Immutable owner-source identity, locator, SHA-256, capture time, append-only corrections | Accepted | assurance-planes pattern; objective-reconciliation template; task/state/active-task templates |
| Supervisor receives owner source independently from worker handoff | Accepted | independent supervisor receipt contract in assurance-planes pattern and objective-reconciliation template |
| Required owner-requirement reconciliation matrix | Accepted | assurance-planes pattern and objective-reconciliation template |
| Typed completion states | Accepted | assurance-planes pattern, bootstrap, task/state/active-task templates |
| Recurring reconciliation after material transitions | Accepted | assurance-planes pattern, bootstrap, task contract, pilot addendum |
| AskRigor operational/scientific/release judgments | Accepted | assurance-planes pattern and `templates/RESEARCH-SUPERVISION-VERDICT.json` |
| Workers ask Pro about supervision-design improvements/questions | Accepted with capacity-aware topology | Shared `supervision-architecture/<epoch>` Pro meta-review lane plus `templates/SUPERVISION-DESIGN-FEEDBACK.json` |
| Machine-check hostile fixtures | Accepted | updated `13.82% Human` fixture and dual-alignment/meta-review pilot addendum |

## Core state correction

Mission Control must support:

```text
worker_to_contract_alignment: GREEN
contract_to_owner_alignment: DIVERGED
overall_task_traffic: RED
```

The two states are not averaged.

## Independent source rule

A worker-generated packet is not sufficient evidence of what the owner asked for. Mission Control, deterministic tooling, or Extra High must independently acquire or preserve the owner source and issue a receipt. Pro receives that source and receipt inside the packet rather than being told to fetch GitHub.

## Pro meta-review rule

A worker that finds a substantive supervision-design issue must:

1. create a structured feedback packet;
2. include exact architecture identity, evidence, failure mechanism, risks, and proposed change/question;
3. route packet preparation through deterministic tooling or Extra High;
4. submit it to the shared Pro supervision-architecture chat;
5. preserve the Pro disposition and resulting repository/test changes;
6. continue unaffected work.

Immediate-risk defects are reviewed immediately. Nonblocking suggestions may be batched. No ceremonial Pro call is required when the worker has no substantive feedback.

## AskRigor release separation

AskRigor must report independently:

1. operational alignment;
2. scientific adequacy;
3. release adequacy.

A scientific PASS cannot override privacy, consent, licensing, freshness, provenance, security, product, or publication failure. Operational execution does not validate the scientific inference.

## Regression strengthening

`evals/mission-control/contract-laundering-article-humanization-13.82.json` now explicitly requires:

```text
worker_to_contract: GREEN
contract_to_owner: DIVERGED
completion_claim: READY_FOR_OWNER_REVIEW
overall: RED
directive: CONTINUE_HUMANIZATION
```

## Limits

- Machine-visible state does not make all semantic equivalence deterministic; bounded Extra High, Pro, or owner review may still be needed.
- Independent acquisition can still be incomplete when the original owner source is inaccessible; this yields `SOURCE_MISSING`, not invented certainty.
- The Pro meta-review lane advises architecture. Canonical repository mutation, testing, and owner decisions remain separate controls.
