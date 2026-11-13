# Claude on unit 4: the reviewer's final message, as returned

I found five low-severity (P2) defects and no P0 or P1. No tests were run, as instructed.

**1. `apps/research-mcp/src/research-contributor-access-tool.ts:1039` (P2)**
`plan_research` wrongly tells the AI that a valid plain-answer receipt is invalid.
- `read` returns `undefined` in three cases:
  - the receipt is bad;
  - the server has no receipt secret (`researchReceiptSecretFromEnv()` is undefined, `register-tools.ts:2039`);
  - the surface has no plain-answer options, so `plain?.read` is undefined. On `/mcp/gemini`, `plainAnswer` is never configured.
- In all three cases the result says the receipt "is not a current plain-answer receipt of this account".
- **Scenario:** a Gemini-surface call passes the receipt that `register_plain_answer` just returned. The AI is told its receipt is invalid. It is likely to register the plain answer again or drop the receipt, even though nothing is wrong with it.

**2. `apps/research-mcp/src/research-steering.ts:363` with `:391` (P2)**
`plan_research` can return instructions that contradict each other.
- **Scenario 1:** every open task has `could_change: "detail"` and the style is balanced. `recommended` is empty and `recommended_minutes` is `[0, 0]`, so `next` is `"go_on"`. The text says "Nothing more is recommended: the open tasks add detail only." It then says "Do these tasks now, in this order, each within its minutes", and the AI may run the detail-only tasks anyway.
- **Scenario 2:** the person gives an allocation, but every entry points at a done task or has 0 minutes. `answered` is true, so `next` is `"go_on"`. The filter empties `recommended`, and the text says the open tasks "add detail only". That reason is false, and the person's allocation is dropped without saying so.

**3. `apps/research-mcp/src/claim-coverage.ts:79` (P2)**
A claim listed twice in `claim_coverage` keeps only its last status, with no note.
- `statuses.set(entry.claim_id, entry)` overwrites earlier entries.
- **Scenario:** `claim_coverage` holds `{claim_id: "abcdefghijk#3", status: "not_addressed"}` and later `{claim_id: "abcdefghijk#3", status: "assessed"}`. The not-addressed note never fires, so the "answer must call itself partial" requirement is skipped.
- Other declarations in the final check (`community_leads`, `option_classes`) do note duplicates: "give each … one entry".

**4. `apps/research-mcp/src/research-contributor-access-tool.ts:623` (P2)**
`list_calls` runs before the runtime input parse, so none of the other input checks apply to it.
- **Scenario:** `{action: "list_calls", plainAnswer: {...}}`, an unknown top-level key, or a malformed `later_inputs.researchMenu` is accepted silently. Every other action refuses these with `invalid_request` (for example, "plainAnswer goes only with action register_plain_answer").

**5. `apps/research-mcp/src/research-contributor-access-tool.ts:624` (P2)**
`list_calls` gives the wrong reason when the access service is missing but the call record exists.
- If `options.service` is undefined and `options.callRecord` is set, the result still says "This AskRigor server keeps no call record". The real cause is the missing access service, which every other action reports as `research_access_service_unavailable`.
- The error code is `call_record_unavailable`, so the per-call record and the AI both get the wrong reason.
