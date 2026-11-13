# AI Tool Radar: sequential investigation roadmap

**Objective:** find tools that measurably improve active projects over the actual current baseline; do not adopt merely because they are new.

## Greptile credits: default to no review (owner, 13 Nov 2026)

The owner's preferred default is **do not consume Greptile credits for routine pull requests**. Source reviews should normally use existing Claude/Codex cross-model checking plus deterministic tests. Greptile is an optional exception-only independent reviewer for a specific consequential unresolved risk: security/auth/privacy, billing/destructive data, production rollback, research-protocol step integrity, cross-module concurrency, or a similarly high-risk change where the ordinary review could miss a significant failure. Do not treat a reviewer merely being available as a reason to spend credits.

Before any manual Greptile invocation, record which PR + exact head SHA, the named high-risk question, why existing review/tests cannot answer it, the tier and expected credit use, and what decision the result would change. Default to Base if a pass is justified. No review of unchanged commits; repeated credits require materially changed code or a distinct unresolved risk. Do not assume credits are free without checking the actual account balance. Greptile's confirmed AskRigor findings (merged PR #441) justify *targeted* use, not a blanket requirement.

This repository's root `.greptile/config.json` declares `autoReview: []`, `skipReview: "AUTOMATIC"`, `triggerOnUpdates: false`, and Base effort for manual reviews. This is repo-side configuration only; nested `.greptile/` overrides, source-branch configuration and organization rules must be checked where relevant. AskRigor's initial PR for this policy received an unsolicited Base review despite legacy `greptile.json`, prompting migration to the currently recommended folder format. Do not issue a test review just to validate the guard. It does not establish provider-wide settings or disable any external automatic reviews in other repositories. For AskRigor's project-specific rule, consult its `docs/greptile-credit-policy.md`.

**Stage 2 Greptile comparison:** investigate historical/zero-credit cases first, compare against Claude-self and Codex-on-Claude reviews, and use a live Greptile credit only when an exact remaining uncertainty cannot be decided by existing evidence and the current owner's usage/spend limits allow it.

## Queue (GitHub issues)

| Stage | Investigation | Issue |
|---:|---|---|
| 1 | OpenViking vs GitHub+UDA retrieval | [#475](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/475) |
| 2 | Greptile vs Claude/Codex code review | [#477](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/477) |
| 3 | Langfuse vs Arize Phoenix tracing | [#478](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/478) |
| 4 | Inspect AI vs DeepEval vs Promptfoo evaluation | [#479](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/479) |
| 5 | DSPy programmatic pipeline optimization | [#480](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/480) |
| 6 | Elicit, SciSpace, OpenAlex scientific discovery | [#481](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/481) |
| 7 | GraphRAG, LlamaIndex, Haystack, LightRAG retrieval | [#482](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/482) |
| 8 | Mem0, Hindsight, Graphiti memory alternatives | [#483](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/483) |
| 9 | Unsloth Studio, TRL/PEFT, Axolotl, LLaMA-Factory | [#484](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/484) |
| 10 | Vast.ai vs RunPod vs Modal GPU rental | [#485](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/485) |
| 11 | vLLM, SGLang, llama.cpp, Ollama inference | [#486](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/486) |
| 12 | LangGraph, PydanticAI, Mastra orchestration | [#487](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/487) |
| 13 | Firecrawl, Exa, Parallel, Bright Data acquisition | [#488](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/488) |
| 14 | n8n, Temporal, Trigger.dev workflow scheduling | [#489](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/489) |
| 15 | Argilla, Label Studio, MLflow data lifecycle | [#490](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/490) |
| 16 | New high-impact candidates intake | [#491](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/491) |

## Status, progression and true limits

- Initially **stage 1 OpenViking** is active; stages 2–16 are queued. GitHub issue **state** and the `[ACTIVE]` / `[QUEUED]` title prefix govern displayed position, not a copy of status in this document.
- Upon a stage issue being closed as **completed** with a recorded `Outcome: ...` and `Evidence: https://...` in its body, the `AI Tool Radar queue handoff` GitHub Actions workflow activates the next issue, posts a handoff comment, and leaves a GitHub audit trail. If evidence is added after closure, an edit event retries the check.
- Only the expected ACTIVE issue can advance the queue. Repeated triggers do not activate more than one successor. Closing with `not_planned`, closing a queued issue, or omitting the result receipt does **not** advance the queue.
- *Activation means the next investigation is ready.* GitHub Actions cannot independently launch a Codex/Claude/Work researcher or operate paid tools here. Future worker dispatch must use an actually verified authorized route. Do not represent queue advancement as research execution.
- To close as investigated, record verified actual findings, decisive comparator, costs, limitations and a `REUSE / PILOT / WATCH / SKIP` disposition. A linked source report is mandatory. These machine-readable fields authorize queue movement, not publication, deployment, spend or semantic certification.
- Use the relevant target-project AGENTS.md and current versioned protocols. Never upload private/case content, spend beyond already authorized budgets, or mutate production systems as part of a discovery task.
- If an experiment needs credentials, GPU rental, model calls, proprietary data or live deployment, complete its zero-cost research and document the exact missing gate; do not mark it completed just to move the queue.
- The weekly AI Tool Radar remains a separate **discovery** task. New tools can be proposed to the queue with evidence and priority justification; reorder only by a recorded decision.

## Completion receipt to add to the issue body

```text
## Investigation result
Outcome: PILOT
Evidence: https://github.com/.../your-findings-artifact
Comparison: ...
Unresolved: ...
```

The workflow checks the explicit `Outcome:` and `Evidence:` lines and GitHub issue state, but does not independently determine whether the report is good. Reviewer/owner judgment remains separate.

## Automation safety

Workflow uses only `issues: write` for the handoff job, one pinned GitHub checkout action, GitHub’s ephemeral `GITHUB_TOKEN`, and Python standard library; it executes no untrusted issue text and calls no paid model. It re-fetches canonical issue state before modifying the next item. No background worker is assumed.

