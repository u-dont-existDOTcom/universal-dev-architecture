# AI Tool Radar: sequential investigation roadmap

**Objective:** find tools that measurably improve active projects over the actual current baseline; do not adopt merely because they are new.

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

