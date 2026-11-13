# Finding studies: Elicit, SciSpace or OpenAlex? (13 Nov 2026)

> Classification: `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`. One owner's project findings (AskRigor and this
> repository), copied here on 13 Nov 2026 from the owner's working notes at the owner's direction, so that the
> stage issue can link to them. Desk research by AI research helpers unless a section says a test was run; the
> sources were gathered through a summarizing fetch tool and were not reread. Nothing here is an endorsement.
> The stage issue stays open: its place in the queue is the roadmap's to decide.

UDA issue 481: Elicit, SciSpace, OpenAlex. Stage 6 of the tool radar.

## Short answer

**PILOT**, and "narrowly: a zero-cost OpenAlex recall test only". Recall is the share of the right studies a search finds.

- **OpenAlex: REUSE** for what it already does, and **PILOT** for one new question. The report gives both words. OpenAlex is already in use and is the only candidate with independent evidence of high coverage. The new question is whether its keyword search or its search by meaning ("semantic" search) finds studies the baseline misses.
- **Elicit: WATCH.** Its one independent search test was poor: sensitivity (the same idea as recall) of 39.5%, against 94.5% for the reviews' original searches. Any hands-on step needs a paid plan.
- **SciSpace: WATCH.** There is no independent evidence, and access needs a beta application that the helper could not read about.
- **The rest:** Semantic Scholar API **WATCH**: it is free, but nothing shows it is better than OpenAlex. Consensus, Scite, Undermind and FutureHouse **SKIP** for now: each is gated by approval, sales or an unknown access path.

## What was measured, and by whom

| Claim | Number | Measured by | What weakens it |
|---|---|---|---|
| OpenAlex holds the studies gathered in one diabetic-eye-screening map | "128 (98%) of these are present in OpenAlex" | An independent group, in one case study | One case, on a medical topic. The report uses it for coverage outside PubMed but does not show these studies were outside PubMed |
| PubMed search plus OpenAlex citation-graph search | 93% recall | The same case study | Its authors call graph search "limited by the available citation links." |
| Right papers within the first 50 results (recall@50) on the BioASQ test, 5,486 questions, 2026 | Elicit 0.603. OpenAlex keyword 0.474. Google Scholar 0.406. Semantic Scholar 0.397. OpenAlex semantic 0.299 | Elicit, the vendor | Vendor-run. BioASQ draws on PubMed, so it cannot test coverage outside PubMed. The page carries inconsistent dates (July 17 versus November 11, 2026) |
| Elicit against the original searches of 4 reviews (Sept 2025) | Sensitivity 39.5%, precision 41.8%, against 94.5% for the original searches | An independent group | Four reviews only |
| Elicit's data extraction | Vendor: 94% accurate. Independent, 20 randomised trials: 4.3% "deviating", 45.7% "partially equal" | Elicit; an independent group | Weak on effect sizes. Cannot read figures |
| Consensus | recall@20 0.434 against Elicit's 0.483. Overlap between two runs of one question: 28% | "Vendor BioASQ" (the report does not say which vendor); an independent small test | The overlap figure rests on one question |
| Size of each collection | Elicit "over 138 million academic papers". Semantic Scholar about 214M papers and 2.49B citations | Not stated which page each figure is from | Whether Elicit searches full text is unknown |
| OpenAlex full text | About 25 to 32% of articles (a 2022 analysis) | A search summary only, "MEMORY-level" | The current figure was not found |
| FutureHouse | "better precision than PhD-level researchers" | FutureHouse, the vendor | The report lists it as an unverified claim |

Precision is the share of results that were right. The citation graph is the record of which paper cites which. No measured search quality was found for SciSpace (a vendor preprint only, per a sponsored post, not opened), Scite, or Undermind (blog observations only).

**Where the report does not add up:**

- **OpenAlex gets REUSE for citation follow-up, but the one test of that path found it limited.** The graph search added records, yet "appears limited by the available citation links".
- **A price line contradicts the price table.** The cost summary says "plus $0.10 per list/filter call". The table reads as $0.10 per 1,000 such calls.
- **The test asks for more than the tool returns.** It wants the first 100 results, but the report says semantic search gives 50 results a query.

## Against what we do now

- **OpenAlex is "already in use".** The report calls the rest of today's search tools "the baseline" and does not list them.
- **Recall of key studies:** only vendor-run evidence shows Elicit ahead. Independent evidence shows it well below traditional searching, "so it is not a replacement".
- **Journals outside PubMed:** OpenAlex is the only candidate with independent evidence of high coverage (98% in one case).
- **Citation follow-up:** OpenAlex graph search added records in the one case tested. For Semantic Scholar the helper "found no measurement".
- **Pulling data out of papers:** independent evidence is weak. "Human or assistant verification is still required."

## Costs and limits

- **OpenAlex:** a free allowance of $1 of usage a day, with no payment method required. Search costs $1 per 1,000 calls. The report then lists semantic search $1, list and filter $0.10 and rerank (a second sorting pass) $1 extra, which read as per 1,000 calls too. Single-record lookup is free. Pay-as-you-go is prepaid in $1 steps. Semantic search is limited to 1 request a second and 50 results a query. On the API key requirement: "one source says February 2026, and there is no formal deadline". No terms page was opened.
- **Elicit:** "API access requires a Pro plan or above" (an API is the interface a program calls). Limits: 300 results a request on Pro, 500 on Scale, 100 requests a minute per IP address. The Pro price, $49 per user a month, comes from a third party only and was not opened on elicit.com. Calls draw on the same credit pool as the platform plan, and Elicit may throttle at any time.
- **Elicit's terms:** showing results to end users is allowed, and so is storing them. "You may not aggregate search results to build or contribute to a standalone search index." No resale. No AI training on outputs.
- **SciSpace** (search summary only; its docs host would not resolve): API in public beta, by application. Developer tier free with 500 credits a month and 60 requests a minute. Scale tier $99 a month for 10,000 credits. At 5 credits a standard search, the free tier gives about 100 searches a month.
- **Semantic Scholar API:** free. With a key, "1 RPS on all endpoints" (one request a second). Without a key, use comes from a shared pool. Attribution to "Semantic Scholar" is required. The terms are silent on caching. The licence cites CC BY-NC (non-commercial) for some data, "so check commercial use".
- **Gated services:** Consensus offers its API as an add-on for the Team tier, "available upon approval, rate limited", with no price on the page. Scite's Pro plan is $50 a month, but its key is for evaluation only: "Commercial or research use of Search requires a separate license agreement." Undermind has no public API, only an enterprise one through sales. FutureHouse's current access terms were not found.
- **Per 1,000 questions:** OpenAlex about $1 for keyword search, $1 for semantic, $2 for reranked, which is "inside the free $1/day allowance for light use". Semantic Scholar $0. Elicit: no per-call price found. Others: no price available.

## First experiment

- **What to run:** pick 10 recent systematic reviews (2024 to 2026), at least 3 of them on plants, foods or agriculture. Freeze each review's list of included studies. Using each review's question, run the baseline and three OpenAlex modes: keyword search, semantic search, and semantic search with rerank. Count how many included studies turn up in the first 50 and the first 100 results. Separately, for 5 landmark trials, check OpenAlex's forward citations against later included trials.
- **Cost:** "about $0 to $0.10, inside the free daily $1".
- **Pass or fail:** OpenAlex adds at least 10 percentage points of recall on the non-PubMed reviews, or finds at least 1 included study per review that the baseline missed. "Otherwise REUSE as is."
- **What it needs from the owner:** nothing. The report says "Gate: none for OpenAlex". An Elicit arm is not part of this test: it "is blocked by the paid Pro plan, which needs owner approval".

## Receipt for the issue

```text
## Investigation result
Outcome: PILOT
Evidence: https://github.com/u-dont-existDOTcom/universal-dev-architecture/blob/main/docs/research/ai-tool-radar/stage-06-scientific-discovery.md
Comparison: Against the current search baseline, OpenAlex (already in use, REUSE) is the only candidate with independent evidence of high coverage (98% in one case), Elicit is WATCH because its independent sensitivity was 39.5% against 94.5% for the original searches, SciSpace and Semantic Scholar are WATCH, and Consensus, Scite, Undermind and FutureHouse are SKIP for now.
Unresolved: Whether OpenAlex keyword or semantic search finds included studies that the baseline misses is not measured yet, and the test of it has no gate (about $0 to $0.10 inside the free daily allowance), while an Elicit arm would need the owner's approval for a paid Pro plan.
```

## Sources

As the helper's report lists them:

- https://help.openalex.org/access/pricing/
- https://help.openalex.org/access/example-costs/
- https://help.openalex.org/api/semantic-search/
- https://help.openalex.org/guides/authentication.md
- https://blog.openalex.org
- https://casrai.org/news/openalex-api-keys-mandatory-usage-based-pricing-2026
- https://docs.elicit.com/
- https://elicit.com/operations/api-terms
- https://elicit.com/blog/evaluating-elicit-paper-search
- https://elicit.com/blog/how-we-evaluated-elicit-systematic-review
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12483133/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12462964
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12302543/
- https://arxiv.org/html/2605.10125v2
- https://semanticscholar.org/product/api
- https://semanticscholar.org/product/api/license
- https://consensus.app/.well-known/pricing.md
- https://docs.scite.ai/pricing-and-plans.md
- https://undermind.ai/enterprise
- https://futurehouse.org/research-announcements/launching-futurehouse-platform-ai-agents
- NOT OPENED: the docs.api.scispace.com pages (host would not resolve); the consensus.app/home/api page, which the helper could not open. One Substack post could not be fetched (503).

These were gathered by a research helper on 13 Nov 2026, the web pages through a summarizing fetch tool, and were not reread by the main session.
