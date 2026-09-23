# Continue the isolated Claude compatibility candidate

## Entrypoint and objective

Read README.md, then execute this file as the bounded continuation directive in an
existing authorized integration/Work lane. The goal is to make the supplied
provider boundary usable with Claude without disrupting current Mission Control,
AskRigor or GPT work. Do not repeat the broad Claude capability audit.

Repository: `u-dont-existDOTcom/universal-dev-architecture`.
Candidate branch: `chat/claude-compatibility-20260923-2251`.
Original inspected baseline: `eaeacee9c187d943e036cb7b299388f3094a1e64`.
Candidate directory: `tools/codex-mission-control/provider-compatibility`.

This packet does not itself launch a new Work task. The originating chat URL was
not exposed to the author; none is fabricated. A controller creating a new formal
Work task must bind the actual source conversation and the source-authorized
provider/effort profile through the normal handoff path.

## Preserve the authorized boundary

Fetch the live default-branch AGENTS.md and applicable instructions. Inspect the
current integration-owner lock and active work. Use your own branch/worktree and
writer lease; the supplied lease belongs to the authoring lane, not automatically
to you. Only the current integrator may reconcile shared runtime/source changes.

This is Iteration. Preserve GPT's existing dispatcher, actor/source checks,
spending restrictions, task/epoch/directive hashes and rollback path. Do not merge,
deploy, restart services, alter OAuth registration or flip canonical routing under
this packet. Do not grant authority merely because a request says `provider` or
`expensiveEffortApproved`. Do not add a fake ChatGPT identity to Claude output.

## First: inspect and run the delivered candidate

Inspect `compatibility.mjs` and its tests. Use the measured focused command from
README.md; no paid inference is involved. Confirm changes remain confined to the
candidate directory and no existing runtime/archive source was rewritten.

The pure functions are usable now. Do not describe them as a deployed adapter:
there is no process launcher, live admission integration, cancellation runner,
credential provider, or new supervisory actor in the supplied implementation.

## Next implementation, in the integration owner's isolated lane

1. **Preserve the OpenAI path.** At the current dispatch selection point, route
   existing directives to the existing handler with the original argument object.
   The supplied delegation helper demonstrates this invariant. Add a regression
   at that real dispatch entrypoint; a mock-only pass is not a live compatibility
   result. Missing/unknown provider values must retain documented legacy behavior
   or be rejected, not silently become Claude.

2. **Extend admission deliberately.** Add explicit provider/surface/role bindings
   at the existing authenticated authority boundary. Keep owner-source binding,
   directive revision/hash and trusted launcher evidence distinct from caller
   assertions. Do not replace the entire gate or bulk-rename ChatGPT terms. Keep
   old profile validation intact while adding a separate validated Claude profile.
   Ordinary setter-only execution must not acquire a new independent-effort-proof
   prerequisite that the CLI cannot satisfy.

3. **Add a host-controlled transport.** Consume `prepareClaudeCode` using a direct
   argument-vector subprocess, never a shell string. Inspect CLI version and
   non-secret authentication status first without invoking inference. Verify
   subscription authentication and absence of API/provider overrides under the
   effective child settings/environment; never read or echo token values. Preserve
   managed restrictions. The current plan deliberately omits bare mode.

   Authorize the exact plan through the existing trusted controller before spawn.
   Reserve new session IDs and verify persisted task bindings before resume.
   Stream stdout into `createClaudeCollector`; stderr stays private and bounded.
   Enforce its wall limit, graceful cancellation and bounded process-tree cleanup.
   No automatic retry, alternate provider, extra-high effort, parallel agents or
   API fallback. Confirm all children stop before reporting termination.

4. **Prove permissions and MCP on the real host.** Confirm effective tools and
   managed policy, server OAuth identity, and read/write controls. CLI built-in
   restrictions and auto-approval flags are not an MCP authorization proof.
   Maintain human-only gates for consequential operations; never auto-consent to
   AskRigor participation or expose desktop-control services publicly.

   For AskRigor, inspect the current server/client allowlist and protocol catalog
   rather than assume an old tool count or copied XML. Test standard MCP first.
   Change only an actually incompatible binding, in its own reviewed change.
   Do not rewrite the server or loosen existing OAuth audiences/scopes.

5. **Use one small real acceptance case only when its resource use is authorized.**
   Prefer an explicit low/medium-effort subscription profile. Verify one bounded
   task, its exact session/result, one permitted read, one denied operation,
   resume and cancellation. Stop a provider failure rather than spending the
   allowance on retries. Make no model-quality inference from a tool/auth failure.

## Evidence and finish

Keep focused tests for malformed output, foreign session/directive, primary-model
mismatch, reported-versus-observed effort, missing/duplicate results, permissions,
cancellation and unchanged GPT dispatch. Full UDA/application release checks belong
at an actual authorized merge/deploy boundary, not every edit.

Return a compact receipt with exact code revision, changed paths, test commands
and results, executed versus unexecuted live checks, model/effort evidence level,
actual observed allowance data (or unavailable), blockers and the next exact action.
A worker's `completed` report is not supervisory approval or owner-outcome proof.

Stop this packet before shared integration, production switching, paid inference,
OAuth/account changes or another missing authority boundary. Finish independent
preparation first. No owner clipboard relay is needed when an authorized current
internal route can deliver the resulting patch/receipt.
