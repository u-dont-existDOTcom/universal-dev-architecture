# Atlas intake: reject external Deep Research outputs that answer a different question or omit the evidence records

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-12, by the assistant running the owner's Natural Treatment Atlas research (Atlas planning and ingestion workstream). Put in the lane format by the UDA maintainer (Claude) the same day.
- From: two Deep Research exports the owner uploaded on 2026-10-12 to his Natural Treatment Atlas research chat, for the Atlas's first pilot (migraine and recurrent headaches). They are in no repository and the chat can't be linked from this public one; ask the owner for them. This item was first filed on `main` in commit 8fc6689e.
- Owner request: no. The owner's Atlas goals it serves: preserve all collected evidence, not just an essay; prioritize symptom-first global botanicals, books and primary sources; make output resumable.
- Existing pull request: none.
- Supersedes: none.

## What to do

At the boundary where an external Deep Research output is submitted to the owner-specific Atlas ingest workflow:
1. Verify the current **owner research target**, e.g. phenotype `migraine / recurrent headache`, against the actual accepted output before marking the topic explored. Keep source-domain ontology flexible: a book about indigenous medicine may still have a migraine-relevant chapter.
2. Admit **real source and evidence records**, with parent IDs, exact disease/outcome, reported effect, counterevidence, access depth and bibliographic locator. An essay about the research stack does not count as medicinal evidence, regardless of length, citation density or polished prose.
3. Require real file existence or parseable streamed record blocks; links that point to a disconnected task container must not be accepted as available attachments. Keep the valid uploaded summary as an explicit `wrong_target_background` input, not a false completed research pass.
4. On topic/output mismatch mark `OUTPUT_CONTRACT_FAILED`, preserve the bytes and hash/reason, give a one-line actionable retry prompt bound to the original topic, and keep the Atlas frontier OPEN. Do not incur a broad new synthetic mandatory gate in unrelated AskRigor medical answers.
5. Maintain a ranked unavailable original-study/book acquisition queue as part of the accepted records; preserve original full-text vs abstract-only vs not accessed and separate source-linked method audit.
6. Gate any claims `Atlas ingestion saved` or `research pass completed` on actual source-specific records. If the external mode only exports an ordinary report, derive/source-audit record blocks from its **migraine-relevant** contents rather than pretending nonexistent files were saved.

Accept a versioned **migraine/headache evidence bundle** only when material source and outcome records genuinely concern migraine, alongside a source-access ledger and missing-books queue. A related research-software report belongs in a different mission lane.

## Why

The original 2026-10-12 evidence-only instructions explicitly requested **migraine/recurrent-headache intervention research**, no narrative report, and durable `sources.jsonl`, `evidence.jsonl`, `search_log.jsonl`, `disagreements.jsonl`, `access_requests.jsonl`, `frontier.json` plus minimal manifest. Two subsequently uploaded **complete 117-line and 155-line Markdown outputs** instead discussed AskRigor's research architecture, diversified markets/policy/competitive intelligence and citation export formats. The first had zero appearances of 'migraine'; the second mentioned migraine once only to say its uploaded migraine-evidence Markdown was unrelated and not used. Neither provided any migraine-treatment outcome records, extracted trial contrasts, ethnographic reports, or ranked absent books. They advertised `sandbox:/mnt/data/...` links to ZIPs and full reports created in the **other research session**, whose exact paths did **not** exist in the current follow-up runtime. Both Markdown uploads themselves were readable and fully verified. There is no evidence to blame the document upload transport.

This is a **scope/objective fidelity failure plus artifact handoff mismatch** relative to the initial evidence-only task. It is NOT proof of what exact prompt the external run actually received, or a software defect in AskRigor itself; the exact external run invocation is not available. This is an **ingestion-validation suggestion**, not a claim that AskRigor caused an external Deep Research failure. The broad meta reports may be useful process references, but they are not medicinal evidence.

## Check first

Run the regression examples below against the current Atlas ingest workflow before changing it.

## Regression examples

- **Wrong topic:** requested migraine botanical evidence; returns AskRigor MCP architecture review with many correct citations and zero migraine treatments. MUST fail Atlas intake; no claim of scientific saturation and no fake evidence records.
- **No files:** outputs have clickable `sandbox:/mnt/data/...` paths in plain Markdown but not actually attached/mounted. The ingest layer verifies actual access instead of inferring it from the text.
- **Right topic, Markdown only:** 30 properly sourced migraine treatment study records in an exported Markdown report but no write tooling. Accept parseable bounded records after validation, not fail just because JSONL files couldn't be generated.
- **Wrong question transferred:** migraine evidence appears in a source appendix but the task output mainly discusses research software. Preserve useful citations, classify primary deliverable mismatch.
- **Book sources:** requested priority queue contains a monograph but no verified text; mark `identified, not accessed`, not `full text inspected`.
- **Public product independence:** run with standalone AskRigor without UDA to determine if the Atlas handoff itself prevents false completion. This must not be credited to other instructions used only in a private workflow.
