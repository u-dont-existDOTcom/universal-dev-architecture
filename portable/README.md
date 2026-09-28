# Portable check packs

Public products do not load this repository at runtime. When a lesson here has to reach the people who use a public product, the product carries a self-contained adaptation of it in its own runtime instructions (`patterns/instruction-composition-and-portable-intelligence.md`, "Transfer decisions").

This directory holds those adaptations as packs, and the development-side record of where each pack went.

- `PUBLIC-APPS.json`: the owner's list of public-facing apps. Every app it declares must carry each pack. Agents read this list; they do not infer it from repository visibility or from a project having model instructions.
- `<pack>/CHECKS.md`: the self-contained text of one pack, with an ID and an "Applies to" line for each check.
- `TRANSFER-LEDGER.json`: which projects carry which checks, where, and in what state: every declared public app, plus any other project that carries a pack. Each check is recorded as added, already covered by the project's own rule (with the exact anchor phrase), not applicable, or deferred (with the reason). When a project has several runtime surfaces, a check can also list each further surface with its own disposition and anchor. Projects assessed and found to have no AI runtime are recorded too.
- `scripts/portable_checks.py`: validates the ledger against the packs, and checks a local clone of a project for every anchor phrase the ledger records.

States follow `patterns/durable-chat-learning.md`, with one addition for work that is open for review:

- `PROPOSED`: the change is in an open pull request in the project.
- `PROJECTED`: merged into the project's runtime source.
- `TESTED`, `DEPLOYED`, `LIVE_VERIFIED`: as defined in that pattern.
- `NOT_APPLICABLE`, `DEFERRED`: with the exact reason.

A lower state is never reported as a higher one. A merged change is not deployed, and a deployed change is not live-verified.

When a pack changes, bump its version, update the ledger's digest, and re-check every project that carries it:

```bash
python3 scripts/portable_checks.py validate
python3 scripts/portable_checks.py verify-project --repository <owner/repo> --root <path to a clone>
```
