# DSPy: would automatic prompt tuning beat rewording by hand? (13 Nov 2026)

> Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`. One owner's project findings (AskRigor and this
> repository), copied here on 13 Nov 2026 from the owner's working notes at the owner's direction, so that the
> stage issue can link to them. Desk research by AI research helpers unless a section says a test was run; the
> sources were gathered through a summarizing fetch tool and were not reread. Nothing here is an endorsement.
> The stage issue stays open: its place in the queue is the roadmap's to decide.

UDA issue 480: DSPy programmatic pipeline optimization. Stage 5 of the tool radar.

DSPy is a Python toolkit. Its "optimizers" tune a prompt's instructions or worked examples automatically, scoring each try against labelled examples.

## Short answer

**WATCH.**

- **The evidence for very small labelled sets is anecdotal.** The helper found no independent study of 5 to 50 examples, and none of how much results vary from run to run.
- **One small test got worse on unseen questions.** After tuning, the score on the 20 practice questions rose from 90% to 95%. The score on the 10 questions kept aside fell from 95% to 85%.
- **DSPy's own documentation asks for far more data than we have** for its MIPROv2 optimizer: "200 examples or more to prevent overfitting".
- **The helper says the project "has no validated judge or metric yet"**, so rewording by hand plus automatic checks stays the baseline.

## What was measured, and by whom

| Claim | Number | Measured by | What weakens it |
|---|---|---|---|
| MIPROv2 improves programs | Up to 13% on 5 of 7 programs | The method's authors (paper) | DSPy's docs ask for "200 examples or more" and 40 or more trials |
| GEPA beats MIPROv2 | "by over 10%". Aggregate 54.85 against 47.84 on the Qwen3 8B model | GEPA's authors (paper) | The two scores are about 7 points apart, so "over 10%" can only be a relative gain; the report does not say. A third-party paper (PrefPO), seen only in a search summary, "reportedly shows a closer race" |
| GEPA helps with only 3 examples | +9% on held-out data | GEPA's authors (their FAQ) | "the authors' own figure" |
| GEPA on 30 questions: 20 for tuning, 10 kept aside, model gpt-4.1-nano | Tuning set 90% to 95%. Kept-aside set 95% to 85%. The prompt grew from about 2,400 to 8,800 characters | An independent developer | Read in a second-hand write-up, not the developer's own post. With 10 questions, 95% and 85% are not whole questions, and the report does not explain. Two of three apparent starting failures were bugs in the developer's own scoring. The developer's conclusion: "eval quality has to be debugged before optimizer quality is trusted." |
| MIPROv2 and BootstrapFewShot on 30 financial questions: 10 for tuning, 20 for testing | G-Eval score 0.46 to 0.53 (MIPROv2). 0.47 to 0.51 (BootstrapFewShot) | An independent blog experiment | Test scores were not separated from training scores on the page. No variance reported. The two starting scores differ and the report does not say why |
| Dropbox's relevance judge, tuned with DSPy | 45% lower error (NMSE 8.83 to 4.86) for gpt-oss-120b. 97% fewer malformed outputs for gemma-3-12b | Dropbox, on its own system | No dataset size disclosed. Early GEPA runs copied keywords and usernames into prompts. For its strongest model Dropbox dropped full rewrites and used small tested edits |
| TextGrad, an alternative | On the GPQA test set 51% to 55%. On LeetCode-Hard "20% relative" | TextGrad's authors (paper) | One write-up reports overfitting. Repository last pushed 2025-07 |
| OpenAI's prompt optimizer, an alternative | No number | OpenAI | Its page warns the result can be worse on specific inputs. It is "being retired with Evals (shutdown 2026-11-30)" |

Held-out means questions kept aside and never used for tuning. Overfitting means a prompt tuned so closely to its practice questions that it does worse on new ones.

**Where the report is thin or does not add up:**

- **Quotes are second-hand.** "WebFetch returned small-model summaries, so quotes from fetched pages are second-hand." That covers the 15-30x figure, the 3-example figure and the 30-question test.
- **The claim that the project "has no validated judge or metric yet" has no source in the report.** It is the helper's own statement about the project.
- **One item is listed as evidence "For" without a result:** OpenAI's optimizer "needs only 3 rows". That is a requirement, not a gain, and the tool is being retired.
- **One critical article "offers no data"**, and one arXiv paper (2507.03620) is listed as unreadable with no word on what it is.

## Against what we do now

- **The baseline:** "hand-rewording plus assertions". Assertions are automatic pass or fail checks.
- **What would be tuned:** the planning call, which outputs a reading, a clarifying question or "none", and 2 to 5 tasks.
- **The labelled material, as the report counts it:** the 5 standard questions, the 18 wider questions, and 113 regression cases with pass criteria.
- **What does not replace it:** Promptfoo is "eval only, no optimizer". Three other DSPy optimizers (SIMBA, COPRO, BetterTogether) were "NOT evaluated". Anthropic's prompt improver and PromptLayer were not opened.

## Costs and limits

- **Licence and state:** DSPy 3.5.0, released 2026-11-10, MIT licence, about 39k stars, 781 open issues (GitHub figures). GEPA is part of DSPy 3.5 and also a separate package (gepa 0.1.4, MIT).
- **Data each optimizer needs:** BootstrapFewShot "very few examples (around 10)". MIPROv2 "200 examples or more" and 40 or more trials. GEPA: its FAQ says 3 examples can help and suggests 30 to 300.
- **Cost of a run:** BootstrapFewShot "cents" (no source given). MIPROv2 "on the order of $2 USD" for a light run (docs). GEPA needs "at least 15-30x of len(valset)" scoring calls, meaning 15 to 30 for every validation example.
- **Running it:** DSPy needs Python. The tuned prompt can be saved to a file that keeps "optimized instructions". The helper believes the text can be read back out, but is going on memory for the exact field. A TypeScript version must copy DSPy 3.5's prompt wrapper format by hand.
- **Not tested:** using a custom model provider. The cost of calibrating a model judge "is unknown".
- **Privacy:** the issue forbids uploading private data.

## First experiment

The report offers this only "if the gate is cleared".

- **What to run:** tune the planning call with `dspy.GEPA`, using a cheap task model and a small reflection model (GEPA rewrites instructions by reflecting on written feedback). Train on the 5 standard questions plus the 18 wider questions. Hold out about 30 of the 113 regression cases for validation. Keep the rest as a final test the optimizer never sees. Score with fixed checks first (2 to 5 tasks, a "none" decision that matches the label, valid JSON), then the regression cases' pass criteria as 0 or 1, with each failure's text fed back. A model judge is optional and "needs calibration".
- **Cost:** the helper's own arithmetic, "not sourced": roughly 450 to 900 scoring calls, "a few dollars or less" on a low-cost model. "The cost is unverified."
- **Pass or fail (the helper's proposal):** at least 10 points better than the frozen current prompt on the final test, no case that passed before now failing, and the gain repeated on 3 seeds (3 separate runs).
- **What it needs from the owner:** approval for a Python install (`pip install dspy`) and for paid model calls on the owner's key. "Neither is allowed in this stage."
- **Left open by the report:** where the labels for the 18 wider questions come from. Its figure of five or more labels per behaviour is, in its words, "a rough guess of mine".

## Receipt for the issue

```text
## Investigation result
Outcome: WATCH
Evidence: https://github.com/u-dont-existDOTcom/universal-dev-architecture/blob/main/docs/research/ai-tool-radar/stage-05-dspy.md
Comparison: Against rewording prompts by hand with automatic checks, the evidence for DSPy on 5 to 50 labelled examples is anecdotal and includes one measured drop on unseen questions (95% to 85%), while the reported gains are the methods' authors' or one company's own figures.
Unresolved: No independent small-data or run-to-run variance study was found, and the GEPA experiment is gated on owner approval for a Python install (pip install dspy) and paid model calls on the owner's key.
```

## Sources

As the helper's report lists them:

- https://dspy.ai/learn/optimization/optimizers/ (stub page only)
- https://arxiv.org/abs/2507.19457
- https://arxiv.org/html/2507.19457v2 (first 100k characters only)
- https://arxiv.org/abs/2406.11695
- https://lady-h-s-applied-data-science-wo.gitbook.io/applied-data-science-in-my-garden/lotus-queen/prompt-optimization/experiments-with-small-dataset
- https://letsdatascience.com/news/dspy-evaluates-and-refines-datasette-agent-prompts-6ced2073 (a second-hand write-up of the independent developer's test, not the developer's own post)
- https://developers.openai.com/api/docs/guides/prompt-optimizer
- https://gepa-ai.github.io/gepa/guides/faq
- https://dropbox.tech/machine-learning/optimizing-dropbox-dash-relevance-judge-with-dspy
- https://www.data-monger.com/syndeblog/the-alien-artifact-dspy-and-the-cargo-cult-of-llm-optimization
- https://arxiv.org/abs/2406.07496
- https://www.promptfoo.dev/docs/intro/
- `gh api` reads of the stanfordnlp/dspy repository, its releases, and docs files (optimizers.md, MIPROv2.md, GEPA/overview.md, saving, language_models.md)
- `gh api` for gepa-ai/gepa, zou-group/textgrad and promptfoo/promptfoo (license, last push)
- NOT OPENED: arXiv 2507.03620 (PDF unreadable), PrefPO, the Anthropic prompt improver, PromptLayer.

These were gathered by a research helper on 13 Nov 2026, the web pages through a summarizing fetch tool, and were not reread by the main session.
