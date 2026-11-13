# Web search and page fetching: Firecrawl, Exa, Parallel, Bright Data (13 Nov 2026)

> Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`. One owner's project findings (AskRigor and this
> repository), copied here on 13 Nov 2026 from the owner's working notes at the owner's direction, so that the
> stage issue can link to them. Desk research by AI research helpers unless a section says a test was run; the
> sources were gathered through a summarizing fetch tool and were not reread. Nothing here is an endorsement.
> The stage issue stays open: its place in the queue is the roadmap's to decide.

UDA issue 488: Firecrawl, Exa, Parallel, Bright Data. Stage 13 of the tool radar.

## Short answer

**PILOT**: one test, with the model provider's built-in web search as the default for version 1. Nothing the helper found measures the real task, which is naming an obscure, recent reference in one or two searches.

- **Exa: PILOT. Parallel: PILOT.** Each would be one arm (one of the options compared) of a single test against built-in search. The report calls them "the best-evidenced candidates". Each adds one more party that sees the question.
- **Built-in search (Anthropic): REUSE**, as version 1 and as the yardstick. It adds no new party. On the independent Vals test it scored 53.75%, against 57.54% for Parallel with the same model.
- **Firecrawl: SKIP** for this stage. It duplicates the existing polite reader, and its terms give it an irrevocable licence over the content sent to it. **Bright Data: SKIP.** The project never builds, runs or proposes unblocking or CAPTCHA-solving products, and the report found CAPTCHA handling included in its documented search product.
- **Others:** Tavily **WATCH**: it trails on accuracy, and its ownership is changing. Brave **WATCH**, as an optional third arm: it is cheap and fast. Serper and SerpApi **SKIP**: they scrape Google, and the litigation is unresolved. Jina Reader **SKIP**: it duplicates the existing reader.

## What was measured, and by whom

Percentages are each test's own accuracy score. The helper checked all figures on 13 Nov 2026. A "search snippet" is a search result the helper did not open.

| Claim | Number | Measured by | What weakens it |
|---|---|---|---|
| Built-in search against Parallel on the same model (Opus 5.5), 4 Nov | Built-in 53.75% at $3.48 a task. Parallel Fast 57.54% at $2.27 | Vals, an independent group | A gap of under 4 points, with no sample size or spread in the report |
| OpenAI's built-in search on the same test | GPT-5.6 Sol 43.58% | Vals | As above |
| Exa on 300 company-news questions, 21 Oct | Exa fast 99.3%. Median response time 386 to 569 ms | openbenchmarks, "self-described independent" | Its independence is its own description. Company news is not our task. Claims for Exa 3.0 are vendor-run, and the launch post could not be opened |
| Other scores from openbenchmarks | Brave 94.0%. Tavily 87.7% basic, 93.0% advanced | openbenchmarks | The report does not say whether this is the same test as Exa's |
| AIMultiple's test | Parallel Advanced 87.0%. Exa Fast 82.6%. "freshness tied at 78.9%". Brave "first at 14.89" | AIMultiple, which the report treats as independent | The uncertainty ranges overlap ("overlapping CIs"). Brave's lead is "not significant vs Exa and Parallel". The report does not say what 14.89 measures |
| FreshQA test set | SerpApi 88.5%, "the highest". Brave 84.9%. Exa 83.0%. Parallel 82.7% | cloro, a vendor | Vendor-run |
| SimpleQA test set | Tavily 91.8%, the lowest | cloro, a vendor | Vendor-run |
| BrowseComp test set | Parallel 74% | Parallel itself | Vendor-run |
| Response time | Parallel Fast 0.78 s (median), Advanced 2.62 s. Parallel Pro 13.6 s. Brave 590 to 630 ms. Tavily 1.7 to 4.2 s. SerpApi 8.2 s | AIMultiple for Parallel, the Pro figure from a search snippet. Not stated for the others | No figure was found for built-in search |

**Where the report does not add up:**

- **Who leads on AIMultiple?** The report says Parallel "leads the independent Vals and AIMultiple results". It also lists Brave as "first" on AIMultiple.
- **Exa's "lowest latency of the three" is not shown.** No response time was found for built-in search or for Firecrawl, and the Exa and Parallel times come from different tests.
- **One pass condition cannot be observed.** An arm must "show no sign of retaining queries", but the test has no step that would reveal this.
- **Brave as the engine behind Claude's search is unverified.** It rests on press reports seen in a search snippet only.

## Against what we do now

- **Built-in search is the plan for version 1** of the planning call. The report calls it "the planned design" and the "v1 default".
- **Page fetching:** the project has its own polite reader. The report says Firecrawl and Jina Reader would duplicate it.
- **Who sees the question:** built-in search exposes it to the fewest parties: "the model provider, plus Brave if the press reports are right". Exa or Parallel would each add one.
- **For the planning call:** "nothing opened proves any option finds a product announced last month in one or two searches".
- **A caution from the helper:** "Parallel's own pages contained a note addressed to AI agents, and Firecrawl's terms page contained one too. I ignored both."

## Costs and limits

- **Anthropic built-in search:** "$10 USD per 1,000 searches", plus tokens. It is eligible for zero data retention (the provider keeps no copy of what is sent), but its dynamic filtering is not.
- **OpenAI and Google built-in search:** OpenAI "$10.00 per 1,000 calls" plus tokens. Google "$14 per 1,000 requests" after 5,000 free a month.
- **Exa:** search from $4 per 1,000 (lite, instant); auto or fast $7 per 1,000. Page contents "$1 / 1k pages". Free: "$10 in credits". Zero data retention is Enterprise only. Its training and retention policy was not opened: the privacy page failed and the docs are silent.
- **Parallel:** search $1 per 1,000 (fast) or $5 per 1,000 (advanced). Extract $1 per 1,000 URLs. No free tier stated. Its policy does not say whether inputs are used for training, and names "Improving the Services" as a purpose. No zero data retention except on the EU Search endpoint.
- **Firecrawl:** 1 credit a page; search 2 credits per 10 results. Free: 1,000 credits a month at 10 requests a minute. $99 a month for 100k credits. Its licence to use content "is irrevocable and survives termination". Zero data retention is Enterprise only. Its core is under the AGPL-3.0 licence.
- **Brave, Tavily, Serper, Jina Reader:** Brave $5 per 1,000 with a $5 monthly credit, and "Queries never shared or trained on"; sources disagree on its free tier. Tavily $0.008 a credit, with 1,000 free credits a month. Serper: price not found; 2,500 free queries. Jina Reader: priced by tokens; 20 requests a minute with no key; "never use your API requests... to train"; its models are CC-BY-NC.
- **Risks:** Firecrawl incidents in 2026, including a 47-minute outage on 1 May (search snippet). For Tavily, Nebius announced an acquisition on 10 Feb 2026 (search snippet). Google v. SerpApi: the DMCA (copyright law) claims were dismissed on 20 Jul 2026, then re-pleaded. Reddit's suit survived dismissal (search snippet).

## First experiment

- **What to run:** write 30 made-up questions about public references from the last 60 days, with no user data in them. Run each through built-in search, Exa auto and Parallel fast, capped at 2 searches, with one planner prompt and one grader. Record whether the planner named the reference correctly, plus cost and response time.
- **Cost:** about $0.60 for built-in search (60 calls) plus tokens. Exa about $0.42 and Parallel about $0.06.
- **Pass or fail:** an arm must identify at least 4 more of the 30 than built-in search, or tie it at lower cost, and "show no sign of retaining queries".
- **What it needs from the owner:** explicit approval for the paid calls, since the issue says "No ... new paid spend". The use of the owner's keys, which the helper says "are not mine to use". And the Exa and Parallel training terms must be read first.

## Receipt for the issue

```text
## Investigation result
Outcome: PILOT
Evidence: https://github.com/u-dont-existDOTcom/universal-dev-architecture/blob/main/docs/research/ai-tool-radar/stage-13-web-acquisition.md
Comparison: Against the model provider's built-in web search (REUSE as version 1, 53.75% on the independent Vals test against 57.54% for Parallel), Exa and Parallel are PILOT as test arms, Tavily and Brave are WATCH, Firecrawl, Serper, SerpApi and Jina Reader are SKIP, and Bright Data is SKIP because the project never builds, runs or proposes unblocking or CAPTCHA-solving products.
Unresolved: No source measures naming an obscure recent reference in one or two searches and the Exa and Parallel retention and training terms are unread, and the 30-question test needs the owner's explicit approval for paid calls on the owner's keys because the issue says "No ... new paid spend".
```

## Sources

As the helper's report lists them:

- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- https://developers.openai.com/api/docs/pricing
- https://aistudio.google.com/docs/pricing
- https://exa.ai/pricing
- https://docs.exa.ai/reference/security-and-privacy (404)
- https://exa.ai/docs/reference/security
- https://docs.parallel.ai/getting-started/pricing
- https://parallel.ai/privacy-policy
- https://parallel.ai/articles/best-ai-search-for-agents
- https://www.firecrawl.dev/pricing
- https://www.firecrawl.dev/terms-of-service
- https://github.com/firecrawl/firecrawl
- https://brave.com/search/api/
- https://tavily.com/pricing
- https://serper.dev/
- https://jina.ai/reader/
- https://github.com/cloro-dev/web-search-api-benchmark
- https://openbenchmarks.com/web-search/most-accurate-search-api
- https://openbenchmarks.com/web-search/fastest-search-api
- https://openbenchmarks.com/company-news/best-news-search-api
- https://www.vals.ai/benchmarks/web_search
- https://aimultiple.com/agentic-search
- https://docs.brightdata.com/products/serp-api/pricing-and-billing
- https://docs.brightdata.com/products/web-unlocker/introduction
- https://brightdata.com/blog/ai/bright-data-vs-brave-search-api
- https://www.searchenginejournal.com/court-dismisses-googles-dmca-claims-against-serpapi/
- NOT OPENED (search snippets only): the Tavily/Nebius, Brave free-tier, Reddit, Firecrawl incident and Anthropic subprocessor pages. The marktechpost Exa 3.0 page returned 403. The Firecrawl scrape-evals repo returned 404. One Bright Data documentation page returned 404.

These were gathered by a research helper on 13 Nov 2026, the web pages through a summarizing fetch tool, and were not reread by the main session.
