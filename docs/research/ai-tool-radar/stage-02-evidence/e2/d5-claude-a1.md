# Claude on defect D5: the reviewer's final message, as returned

I found six problems. Three can let an answer reach ready or be delivered as checked with wrong figures or an overstated reading (P1). Three are softer scientific-accuracy gaps that only reach notes or caveats (P2). I did not run tests, and I changed no code. The first finding is older than this change, but the change edits the code around it and leaves it as a note. None of the fixes below adds a seventh blocking category: findings 1 to 3 belong under the existing "shown figures" and "read depth" checks, and findings 4 to 6 are about caveats or notes.

### P1

**1. A `binary_results` quote doesn't have to appear in the answer — `apps/research-mcp/src/research-finalization-gate.ts:4397` with `:5144-5149`**
- **What happens:** the arithmetic and shown-figure checks (`:5129-5141`, `figureShown(result, result.quote)`) only read the declared quote. Whether that quote is actually in the draft is checked through `declaredQuotes` → `unshownDeclared` → `problems.push`. Those problems go through `addStep("answer_draft", …)` with no blocking rule, so a missing quote is only a note.
- **Example:** a stale or invented `binary_results` entry with counts 10/100 vs 20/100, `nnt: 10` and a quote "10% vs 20% … NNT 10 over 1 year". All the blocking arithmetic passes. The draft the user sees says "NNT 5 over 6 months", which is a wrong number needed to treat and a wrong time horizon, and the result is `ready`.
- **Fix:** a binary quote missing from the answer belongs under the existing "numbers" blocking rule, not a new category.

**2. A full-text lead is shown as if part of the text or the abstract was read — `apps/research-mcp/src/source-reading.ts:133-137`, `:182`, `:207-212`; `apps/research-mcp/src/reading-summary.ts:112-115`; gate `:3190`, `:3318`**
- **What happens:** when no complete open copy is admitted, the open full-text tool returns a lead, labelled `possibly_useful_lead`. That result carries no text (`open-full-text-route.ts:149-160`, `unseen_content_used_as_evidence: false`), and the receipt code at `register-tools.ts:4063` notes that "Lead candidate URLs were never read".
- Even so, a lead receipt in state `PARTIAL_TEXT_READABLE` maps to `lead_part_readable` (depth 4), and one in `ABSTRACT_ONLY` maps to `lead_abstract_readable` (depth 3). As a result:
  - `readingShown("partial_text" | "abstract_only")` returns true, so the panel marks the reading `shown: true`, meaning AskRigor's receipts back it.
  - `linked_reading` gives "part of the text read".
  - `reading_summary` says "AskRigor read N studies only in part / as abstracts".
- **Example:** a key source with only a `PARTIAL_TEXT_READABLE` lead, declared `read_depth: partial_text`, passes as "part of the text read", verified by receipts. In fact no text was ever returned and the copy's identity was never checked.
- **Fix:** lead states should count as not read. A lead should never stand for any reading of the text.

**3. After a second pass in the same turn, the guidance tells the AI to make further fixes with no check — `apps/research-mcp/src/final-check-messages.ts:85-89`, with `:105-107`; gate `:4481`, `:4676`**
- **What happens:** when `turn_already_passed` is set, the result says "make in the answer, with no further check, any fix its notes and limits call for". Some notes only appear after a pass, because source lines and the study map are looked up then, such as "this quote is not in the paper" or "two studies may share the same people". Fixing those means changing figures or claims.
- **Example:** pass, then edit, then a second pass; a source-line note then says a figure is not in the paper. The AI rewrites the figure and its NNT, and delivers it with the check line even though no check read it. The binary arithmetic and figure checks are skipped for exactly the text that changed.

### P2

**4. Any OpenAlex search, or any declared name form, widens every "not found" claim's search coverage — gate `:3952-3954`**
- `allJournalsSearched` is true if any `literature_search` receipt has `src === "openalex"`, whatever its query, including receipts from earlier research in the same chat. `nameFormsSearched > 0` adds `historical_terms` the same way.
- **Example:** "No study of X for hair loss was found" rests on a PubMed search only, while OpenAlex was searched for an unrelated composition query. The caveat then omits "journals outside PubMed and Europe PMC" from what wasn't searched, and the ask to search beyond PubMed and Europe PMC is dropped. The absence claim ends up overstated.
- **Fix:** tie coverage to the searches the claim actually rests on.

**5. The whole-word quote match treats a decimal point or comma as a word boundary — gate `:5260`**
- `digit.test(inside) ? !digit.test(outside) : true` means a quote starting "3% …" matches inside "1.3% …" or "1,3% …", and one ending "… 1" matches inside "… 1.5 years".
- The code's own comment promises "3%" is not found in "13%", but the decimal case still gets through.
- **Example:** a `harms_quote`, `safety_claims` or `binary_results` quote of "5% vs 1% had nausea" is accepted as shown when the draft says "2.5% vs 1% had nausea". Today the result is a missing note; it would be a pass if quote presence is made blocking (finding 1).

**6. "Abstract only" is accepted even when the PubMed receipt signs that there was no abstract — `apps/research-mcp/src/source-reading.ts:106-108` and `:276`; gate `:3212`**
- When `fetch_pubmed_record` signs `abs: "0"`, the receipts show only `metadata_only`. But a declared `read_depth: abstract_only` is in `DECLARABLE_WITHOUT_RECEIPT`, so `verifiedAnswerReading` returns `abstract_only`, and the matching `source_reading` entry is judged `"same"`.
- **Example:** the answer says "abstract only" for a record PubMed signs as having no abstract, and the check doesn't stop it. The panel only lists it apart, "by your account alone".
- **Related:** `pubmed_record` receipts from before `abs` was signed default to `abstract_only` (`source-reading.ts:164`, `reading-summary.ts:105`), which overstates the same way.
