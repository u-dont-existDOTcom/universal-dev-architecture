# Claude on defect D3: the reviewer's final message, as returned

I found 7 problems that can let a release be reported complete while the installed or served tool bytes are out of date, mismatched, or never checked. Three are P1 and four are P2. I read the code only; I ran no tests and made no changes.

I could not compare against current origin/main as you asked. The tree has no `.git`, so it is not a git repository and there is nothing to diff against. "Fixed vs live" below therefore means only "in this tree after the change." Also, your brief says 35 frozen tools, but the code says 33:
- `apps/research-mcp/src/register-tools.ts:3503` throws unless there are exactly 33 tools.
- The fixtures hold 33 tools for `/mcp`, 33 for `/mcp/claude` and 22 for Gemini.

---

### 1. P1 — The freeze can be rewritten freely, so it does not enforce "only adding or removing a tool"
- **Where:** `scripts/freeze-tool-lists.mts:52` (`--write`) and `tests/frozen-tool-lists.test.ts:35-37`.
- **What goes wrong:** the test only checks that what the server serves equals the fixture, and the fixture is whatever `--write` last produced. Nothing pins the three recorded digests (`442d2af213cbc996`, `a53242ad0740d6bb`, `3f619c4c16156097`); they appear only in the plan doc. Nothing checks that a fixture change comes with a change in the set of tool names, or with a release record saying the apps need a refresh.
- **Scenario:** a PR edits `search_pubmed`'s description, or a nested input enum. It then runs `freeze-tool-lists.mts --write`, which is what `TOOL_LIST_FROZEN_MESSAGE` tells it to do. `npm run verify` stays green. The tool_list_version changes in production, and the release can be marked complete with no refresh noted.
- **Adversarial test:** pin the three digests in the test. If a served digest differs from its pin, require (a) a different set of tool names and (b) a release-record entry naming the refresh. Then change one description and run `--write`; the test must fail. Today it passes.

### 2. P1 — The release acceptance probe never compares deployed tools to the frozen lists
- **Where:** `scripts/release-in-image-probe.mjs:31-39`, plus the runbook steps "Check the 33-tool catalog" (`infra/living-evidence-production/README.md:341`, `:494`).
- **What goes wrong:**
  - The probe builds `createAskRigorServer("standard", { runningVersions })` with no surface and no tool_list_version.
  - It prints only the tool count and the first 96 characters of the first tool's description, plus the Gemini count.
  - It never compares the image's tools/list, or its digest, with `tests/fixtures/frozen-tool-lists/*.json`, and it never checks `/mcp/claude`.
  - Since this change, that description line no longer contains any versions. Release records that cite "the first one's version line names the build" (e.g. `docs/audits/2026-10-27-…:45`) can no longer be backed by this probe.
- **Scenario:** an image built from the wrong tag, or from a commit whose catalog drifted, still lists 33 tools, 22 Gemini tools and both manifests. The probe passes and the release is accepted with mismatched tool bytes.
- **Adversarial test:** in the probe, compute the canonical digest of each surface's list (created with `mcpSurface`) and require it to equal the frozen fixture's digest. Change one description in the image's dist; the probe must fail. Today it does not.

### 3. P1 — The connector probe's only staleness signal fails open, and the version text this change removed was its independent check
- **Where:** `apps/research-mcp/src/tool-list-currency.ts:73`, `apps/research-mcp/src/server.ts:518-521`, `AGENTS.md:175-180`, `register-tools.ts:928` and `:951`.
- **What goes wrong:**
  - This change removed "Versions when this tool list was loaded" from `get_protocol_manifest`'s description. That text was the evidence of which build the app's cached list came from.
  - The probe now "reads the running versions from the result." But `running_versions` describes the live server, so it says nothing about the app's installed copy.
  - That leaves the out-of-date notice as the only signal, and the notice stays silent whenever the server's own version is unknown (`if (current === undefined …) return undefined`).
  - `toolListVersionFor` turns any failure into `undefined` and caches it for the life of the process, never retrying.
- **Scenario:** the first `/mcp` request's `toolListVersionOf` rejects once. From then on, an app with a pre-release cached list sends its old version and gets no notice. The probe sees current `running_versions` and reports the list as current.
- **Adversarial test:** make `toolListVersionOf` reject once in `createAskRigorHttpServer`. Call `get_protocol_manifest` with `tool_list_version: "0000000000000000"`. Expect a stale or "unverified" signal; today the result is silent.

### 4. P2 — Gemini's tool list never contains a version value, so stale Gemini lists can't be detected
- **Where:** `apps/research-mcp/src/gemini-tool-catalog.ts:42,61`, and `tests/fixtures/frozen-tool-lists/gemini.json:17`.
- **What goes wrong:**
  - The Gemini catalog is built from the module-level `RESEARCH_OPERATIONS`, which has no tool_list_version. Its field description is the truncated text "The version of AskRigor's tool list this app. Length: ≤100." with no version in it.
  - The notice then tells the model to "send the version its description gives", which is impossible.
- **Scenario:** a Gemini client keeps a pre-189a list, and a probe on that surface can't tell stale from current.
- **Adversarial test:** over HTTP `/mcp/gemini`, require the `tool_list_version` description to contain the surface's 16-hex version.

### 5. P2 — Fixtures are generated without the tool_list_version that production embeds
- **Where:** `scripts/freeze-tool-lists.mts:22-25`.
- **What goes wrong:** the fixtures come from `frozenSurfaceServer`, which has no `toolListVersion`. Production embeds the version in three descriptions (in `toolListVersionField`, `manageResearchAccessInputSchemaFor` and `finalizeResearchConnectorInputSchema`). No test checks that the list production actually serves differs from the fixture only in those three strings. The "independent of running versions" test (`tests/frozen-tool-lists.test.ts:40-52`) passes `runningVersions` but never `toolListVersion`.
- **Scenario:** a later change lets `toolListVersion` alter `required`, property order or another schema. The served bytes then drift from the fixture undetected, while the digest (computed without the version) stays equal.
- **Adversarial test:** create each surface with `toolListVersion: "0123456789abcdef"`, strip that string from the three descriptions, and assert `toStrictEqual(fixture)`.

### 6. P2 — The input-contract version is no longer pinned, and later inputs can change runtime without changing it
- **Where:** `register-tools.ts:935`, `research-finalization-gate.ts:1397`, `later-inputs.ts:13`.
- **What goes wrong:**
  - The runtime output schemas changed `contract` from `z.literal(FINALIZE_RESEARCH_CONTRACT)` to `z.string()`. This contradicts the plan's claim that the server-side parsers keep their literal checks.
  - The vocabulary and next-step helpers built from the runtime schemas also lose that literal.
  - Adding an entry to `LATER_INPUT_SHAPES` changes finalize_research's runtime input contract without changing tool_list_version, and nothing requires bumping the contract.
- **Scenario:** a release adds a later input to finalize_research. The manifest probe reports the same `contract` and the same tool_list_version, so acceptance can't tell which input contract is running.
- **Adversarial test:** add a synthetic later shape for finalize_research and require either a contract-version change or a failing guard.

### 7. P2 — Gemini drops the `later_inputs` field on 19 of its 22 tools, but the list version still reads as current
- **Where:** `apps/research-mcp/src/gemini-tool-catalog.ts:70-75`.
- **What goes wrong:** the owner allowed these omissions. But because the list never changes, a later input added for, say, `search_pubmed` changes neither the Gemini list nor its version. Gemini models only send the inputs they see listed, so the new input is effectively unreachable there, and the release still records Gemini as current.
- **Adversarial test:** declare a later shape for `search_pubmed` and assert that the release check flags the Gemini surface as lacking it. Today nothing flags it.
