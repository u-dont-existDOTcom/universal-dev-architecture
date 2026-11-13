# Evaluation tools: Inspect AI, DeepEval or Promptfoo? (13 Nov 2026)

> Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`. One owner's project findings (AskRigor and this
> repository), copied here on 13 Nov 2026 from the owner's working notes at the owner's direction, so that the
> stage issue can link to them. Desk research by AI research helpers unless a section says a test was run; the
> sources were gathered through a summarizing fetch tool and were not reread. Nothing here is an endorsement.
> The stage issue stays open: its place in the queue is the roadmap's to decide.

UDA issue 479: Inspect AI vs DeepEval vs Promptfoo. Stage 4 of the tool radar.

These are tools for testing an AI system's answers automatically. The report calls the two projects "Project A" and "Project B". By the brief the helper was given, A is AskRigor and B is UDA.

## Short answer

**PILOT**, for Promptfoo only. Nothing has been installed or run.

- **Promptfoo: PILOT.** It can use our existing command-line assistant as the model, with no API key, and can check which tools were called. The helper found no feature that compares a run with the previous one. Its usage reporting must be switched off.
- **Inspect AI: WATCH.** It has the strongest support for agents, tools and sandboxes, and an MIT licence. Wiring in a command-line agent is "a larger job". Whether it compares runs is unresolved.
- **DeepEval: SKIP** for now. Its grading model must return strict JSON, so a command-line grader is risky, and three grading bugs are open. Revisit only if pytest integration becomes the priority.
- **No tool was shown to fill the named gap.** "Nothing opened shows a tool that tracks results across releases", which is what AskRigor lacks. For UDA, no tool measures "did the agent find the right rule" without model calls.

## What was measured, and by whom

Nothing was tested. The numbers are activity counts the helper read from GitHub on 13 Nov 2026. The feature claims come from each tool's own documentation as summarised by the fetch tool, "so none is a raw page extract".

| Claim | Number | Measured by | What weakens it |
|---|---|---|---|
| Inspect AI: popularity and release pace | 3,241 stars. Releases 0.3.289 (10 Nov), 0.3.288 (7 Nov), 0.3.287 (31 Oct), "so weekly". 538 open issues | The research helper, from GitHub | Activity counts, not a test of fit |
| DeepEval: the same | 19,474 stars. python-v4.2.4 (22 Sep), v4.2.0 (24 Aug), "roughly every month". 838 open issues | The research helper, from GitHub | Three open grading bugs: #3329, #3283 (verbose verdicts scored as pass) and #3630 (stale cached scores) |
| Promptfoo: the same | 27,134 stars. 0.125.1 (25 Oct), 0.125.0 (23 Oct), 0.124.1 (8 Oct). 980 open issues | The research helper, from GitHub | Issue #757, "Unable to disable telemetry", is open |
| Promptfoo can use a command-line program as the model | No number. Docs: "You may use any shell command as an API provider." | The vendor's documentation. Not tested | Whether multi-turn tool runs work this way is unresolved |
| Promptfoo shows regressions between releases | No number | Not shown. Docs: its CI quality gates compare against "a fixed threshold", not a prior run | This is what the first experiment is meant to find out |
| Promptfoo can grade answers with a model against written criteria | No number | The helper's memory only ("MEMORY, NOT OPENED") | Whether it works offline with no account is not confirmed |
| Inspect AI runs agents with tools | No number. Docs: "custom and MCP tools, as well as built-in bash, python, text editing." | The vendor's documentation. Not tested | No command-line or subscription provider is listed. Agent-bridge issues #5826 and #6087 are open |
| Which of the three is best | No number | Nobody. "Independent comparison: none found." | The search found blog posts, not opened one by one. The search summary called them mostly opinion; one discloses a commercial tie to DeepEval's maker |

MCP is a standard way for AI assistants to call tools. Telemetry is usage data a tool sends to its maker. CI is the automatic checking of each code change.

**Where the report is thin or does not add up:**

- **The pilot rests on reach, not on the gap.** Promptfoo is chosen because it can drive our command-line assistant at no cost. The report itself found "no baseline-versus-previous-run diff".
- **The experiment leans on a feature known from memory only:** the model-graded check.
- **One sentence is garbled.** "The pages named `inspect_ai.analysis` and `inspect_ai.analysis` dataframes only in passing" names the same thing twice.
- **Two guesses are marked as guesses:** that DeepEval keeps history across runs in its optional cloud, and that its `python-v4.2.4` tag "suggests a separate language SDK".

## Against what we do now

- **AskRigor today, as the report refers to it:** a five-question smoke round with the developer's hand verdicts; a 113-case set; written judge criteria; vitest and Python scripts; model calls through an existing subscription command-line tool.
- **The gap AskRigor names:** nothing tracks results across releases. No tool opened was shown to do that.
- **UDA today:** "The existing Python audit scripts already cover deterministic checks." No tool here measures rule-finding without model calls.
- **Alternatives, from the helper's memory only, none opened:** Braintrust (hosted, with a free tier; it "conflicts with the no-hosted-service rule"), LangSmith evals (hosted, fits best with LangChain), Ragas (Python measures for retrieval systems, not agent runs), OpenAI Evals (aimed at OpenAI models).

## Costs and limits

- **Promptfoo:** MIT licence. The Community tier is "Free Forever". Enterprise, managed cloud and extra red-team probes are paid. Telemetry is on by default; the setting `PROMPTFOO_DISABLE_TELEMETRY=1` turns it off. The Claude Agent SDK is not bundled with it and must be installed separately.
- **Inspect AI:** MIT licence. Free. No hosted tier found. It comes from the UK AI Security Institute and Meridian Labs.
- **DeepEval:** Apache-2.0 licence. Docs: "DeepEval runs locally. Confident AI is optional." Paid-tier pricing was not opened.
- **Not checked:** DeepEval's telemetry opt-out, Inspect AI's CI support, and whether Promptfoo's ownership or licence changed recently ("a search found nothing, but I did not confirm either way").
- **Privacy and limits for the experiment:** only non-private questions may be used, and judge calls count against subscription limits.

## First experiment

- **What to run:** port the five-question smoke round into Promptfoo. Wrap the coding-agent command-line tool so Promptfoo can run it against the live server. Have it print the final answer and the tool-call log. Add checks for whether finalize was called and which receipts it returned, and a model-graded check that copies the existing written judge criteria. Run the five questions three times each, with telemetry off, on a laptop. Run the same five against one earlier release. Compare the two pass tables in Promptfoo's web view.
- **Cost:** "about 4 to 6 hours and $0", because model calls go through the existing subscription command-line tool.
- **Pass or fail:** verdicts agree with the developer's hand verdicts on at least 4 of 5 questions. Repeated runs vary by no more than one question. The old-versus-new difference is visible in one view without custom code. Setup takes under 4 hours. The report does not square "under 4 hours" with the 4 to 6 hours of cost.
- **What it needs from the owner:** approval to install Promptfoo. The stage rule blocks installs until the owner approves. The command-line tool's own login must already be present on the dev machine. No paid call and no API key.
- **Out of scope until this works:** the 113-case set.

## Receipt for the issue

```text
## Investigation result
Outcome: PILOT
Evidence: https://github.com/u-dont-existDOTcom/universal-dev-architecture/blob/main/docs/research/ai-tool-radar/stage-04-evaluation-tools.md
Comparison: Against AskRigor's hand-run five-question round and hand-built checks, Promptfoo (PILOT) can drive the existing command-line assistant with no API key, Inspect AI is WATCH and DeepEval is SKIP for now, and no opened source shows any of the three tracking results across releases.
Unresolved: Whether Promptfoo shows a regression between two releases without custom code is not known, and the five-question port that would show it is blocked by the stage rule against installs until the owner approves installing Promptfoo.
```

## Sources

As the helper's report lists them:

- Inspect: https://inspect.aisi.org.uk/, https://inspect.aisi.org.uk/agent-bridge.html, https://inspect.aisi.org.uk/scorers.html, https://inspect.aisi.org.uk/eval-logs.html, https://inspect.aisi.org.uk/providers.html
- DeepEval: https://deepeval.com/docs/metrics-mcp-use, https://deepeval.com/docs/getting-started, https://deepeval.com/guides/guides-using-custom-llms, https://deepeval.com/docs/metrics-custom
- Promptfoo: https://www.promptfoo.dev/docs/providers/custom-script/, https://www.promptfoo.dev/docs/providers/mcp/, https://www.promptfoo.dev/docs/providers/claude-agent-sdk/, https://www.promptfoo.dev/docs/integrations/ci-cd/, https://www.promptfoo.dev/docs/configuration/telemetry/, https://www.promptfoo.dev/pricing/, https://www.promptfoo.dev/docs/providers/custom-api/
- GitHub: the repository, release and issue-search queries through `gh api` for the three tools, and the issue 479 and roadmap reads.
- NOT OPENED: the comparison blog posts from the web search (pickaxe.co, comet.com, futureagi.com and others). The alternatives are from memory.

These were gathered by a research helper on 13 Nov 2026, the web pages through a summarizing fetch tool, and were not reread by the main session.
