# AI Tool Radar: stage reports

> Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`. One owner's project findings (AskRigor and this
> repository), copied here on 13 Nov 2026 from the owner's working notes at the owner's direction, so that each stage
> issue of the [AI Tool Radar roadmap](../../ai-tool-radar-roadmap.md) can link to its report.

Each page reports on one stage of the roadmap. Five research helpers did the desk research on 13 Nov 2026: no tool was
installed, paid for or tried, except where a page says a test was run. Each page says who measured each number, marks
where a helper's report was unsure or did not add up, and carries the receipt its stage issue asks for.

**What these pages are not.** They are not endorsements, and they do not close a stage. A stage issue is closed, and
the queue moved, by the roadmap's own rule and the owner's judgment. The sources behind each page were gathered by the
helpers, the web pages through a summarizing fetch tool, and were not reread by the session that wrote the pages.

| Stage | Issue | Question | Outcome | Next test, and what it needs |
|---:|---|---|---|---|
| 2 | [#477](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/477) | [Does Greptile catch what Claude and Codex review miss?](stage-02-greptile-code-review.md) | **PILOT**, on risky changes only | Done on 13 Nov: a blind replay with Codex and Claude (Experiment 1 on the page; no Greptile credits). Still to run: the same replay with the instructions Greptile was given. Model use only |
| 4 | [#479](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/479) | [Inspect AI, DeepEval or Promptfoo for testing answers?](stage-04-evaluation-tools.md) | **PILOT** (Promptfoo). Inspect AI WATCH. DeepEval SKIP for now | Port the five-question smoke round into Promptfoo and compare two releases. Needs the owner's approval to install Promptfoo. No paid call |
| 5 | [#480](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/480) | [Would DSPy's automatic prompt tuning beat rewording by hand?](stage-05-dspy.md) | **WATCH** | Tune the planning call with GEPA. Needs the owner's approval for a Python install and for paid model calls |
| 6 | [#481](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/481) | [Do Elicit, SciSpace or OpenAlex find studies we miss?](stage-06-scientific-discovery.md) | **PILOT** (OpenAlex only, which is also REUSE for what it already does). Elicit WATCH. SciSpace WATCH | OpenAlex keyword and semantic search, scored on the included studies of 10 systematic reviews. Needs nothing |
| 13 | [#488](https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/488) | [Is a search service better than built-in search for the planning call?](stage-13-web-acquisition.md) | **PILOT** (Exa and Parallel as test arms). Built-in search REUSE. Firecrawl SKIP. Bright Data SKIP | 30 recent-reference questions: built-in search against Exa and Parallel. Needs the owner's approval for the paid calls, and the two services' training terms read first |

The evidence files of the stage 2 replay (the instruction, the reference written before the first run, and each
reviewer's final message) are in [`stage-02-evidence/`](stage-02-evidence/).
