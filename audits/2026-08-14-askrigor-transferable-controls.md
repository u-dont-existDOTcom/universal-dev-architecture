# AskRigor Transferable Control Lessons

Status: `promoted`
Review date: 2026-08-14
Source repository: `u-dont-existDOTcom/AskRigor`
Source ref: `50be9e4aba0efd6f4536b425ae9db5b61df1a6e0`
Universal implementation ref: `4b8247cb335d2f4c0ff8470e7101863bf44325be`
Supersedes: none
Superseded by: none

These lessons transfer to repositories with analogous canonical-document,
evidence-access, provider-validation, public-service, or compliance-scanner
boundaries. AskRigor's substantive health/research policy remains local.

## UDA-AR-2026-08-14-001 — Exact bytes remain canonical

- **Originating evidence:** `packages/protocol/src/index.ts`, SHA-256
  `e17d4929cd153c52e94f6c5da9b7e1f72b854d0b1035aa9537c350a262d37e15`;
  `tests/protocol.test.ts`, SHA-256
  `45df8e0b232a634300330a6a6bb668ebee7fcc155c9df73a4dd7bf2b91787987`.
- **Incident/test:** the compliance recovery had to name the authority chain
  without allowing manifests, routing files, release notes, checkpoints, or
  remembered lessons to replace complete protocol files.
- **Lesson:** when a complete file is canonical, version/date/digest receipts
  must derive from its exact bytes. Loading and integrity checks fail closed for
  unreadable, invalid UTF-8, malformed, incomplete-attribute, or digest-mismatch
  inputs. A receipt or excerpt never becomes a substitute authority.
- **Transfer rationale:** byte authority prevents invisible semantic drift in
  protocols, policies, legal text, schemas, and signed artifacts.
- **Scope and limits:** applies only where the project identifies a complete
  byte-authored source as canonical. It does not make any particular content
  correct, fresh, lawful, or universally applicable. AskRigor evidence was
  checked at HRP 20.5.17 (2026-08-13) and Universal 20.5.11 (2026-08-07).
- **Regression references:** exact-text return, byte-derived manifests,
  published digests, malformed/read/UTF-8/attribute failures, and stale-digest
  rejection in `tests/protocol.test.ts`.

## UDA-AR-2026-08-14-002 — Access truth survives normalization

- **Originating evidence:** `packages/contracts/src/index.ts`, SHA-256
  `e53113923291aebcf189fe1cfe295c675865352ffdf3211b177fb2a433b8ec78`;
  `tests/contracts.test.ts`, SHA-256
  `365e33603968677249e428c87c5fa091bc114cf7b0406ae769b39f1d9ee707a5`.
- **Incident/test:** provider success, access limitation, pagination ceilings,
  disabled comments, rate limits, and errors needed distinct machine-readable
  outcomes; reaching a budget could not masquerade as complete evidence.
- **Lesson:** normalize evidence only while preserving explicit complete,
  partial, metadata-only, inaccessible, rate-limited, not-found, and error
  states. Completion requires the source-specific exhaustion/reconciliation
  proof, not merely a successful HTTP response or exhausted local budget.
- **Transfer rationale:** downstream synthesis and audits cannot remain truthful
  after an adapter collapses unavailable or partial data into ordinary success.
- **Scope and limits:** the exact state vocabulary is project-specific. Each
  system must define states and completion proof appropriate to its provider;
  this lesson does not require AskRigor's labels or pagination limits.
- **Regression references:** `tests/contracts.test.ts`, `tests/youtube.test.ts`,
  `tests/europe-pmc.test.ts`, and `tests/regression.test.ts` at the source ref.

## UDA-AR-2026-08-14-003 — Live validation is opt-in, bounded, and non-evidentiary on skip

- **Originating evidence:** `Dockerfile.live-validation`, SHA-256
  `f71202c8e5f6475b9e5546f0a263540b4de98cdbcbc85e32c83919369c78986c`;
  `scripts/run-live-suite-v3.sh`, SHA-256
  `aa047983a9be11fa916aa36b411e0bf7f7cd90eaca48c60847cd887a47fd8761`;
  `scripts/scan-live-suite-log.mts`, SHA-256
  `181d81b2a54f7fa6dbaf93652bc37ff89fdd027a20393c6091e39a04cd712ed2`;
  `tests/live-suite-security-scan.test.ts`, SHA-256
  `003b4efd2018528babaa5e8abce2e9ea7668cc51c649f2cce32060662b9b854c`.
- **Incident/test:** ordinary CI needed deterministic fixture evidence without
  provider credentials, changing data, cost, or uncontrolled network calls.
- **Lesson:** separate hermetic verification from explicitly enabled provider
  smoke tests. Bound provider attempts, pages, records/bytes, and elapsed time;
  inject secrets only at runtime; sanitize/scan output before publication; and
  record a skip as a skip rather than provider evidence.
- **Transfer rationale:** this preserves reproducibility and secret boundaries
  while retaining a deliberate path to validate real integrations.
- **Scope and limits:** exact caps and container controls depend on provider and
  threat model. A bounded smoke test does not prove production readiness,
  exhaustiveness, provider stability, or substantive result quality.
- **Regression references:** the live-suite security scanner and container
  contract tests at the source ref.

## UDA-AR-2026-08-14-004 — Public read-only services still fail closed and bound work early

- **Originating evidence:** `apps/research-mcp/src/config.ts`, SHA-256
  `71527e9beb8ff92c902458ec16918b87d97918a2351717110b9676238303a5c4`;
  `apps/research-mcp/src/rate-limit.ts`, SHA-256
  `f64321ff4c1e33676189bbeaaa574cab1647cc56c357b6d4f65d3c2427980559`;
  `apps/research-mcp/src/server.ts`, SHA-256
  `979ab3910599c3cfb414d98bcbaa4df2d3aad8fda9870e0033dc7d4aca8127ee`;
  `tests/rate-limit.test.ts`, SHA-256
  `0d7604151106e55206d72e3dad2f0b7815b3658ab3cdfa89f7dd28239fb38beb`;
  `tests/http.test.ts`, SHA-256
  `c3296130d11bf77bf4c5d535d71918b53e487620ab5f9a392396f72daeed764f`.
- **Incident/test:** a public MCP endpoint needed to remain read-only without
  treating read-only as harmless or trusting spoofable network metadata.
- **Lesson:** require an exact opt-in for public serving; enforce request-size,
  rate, concurrency, upstream allowlist, retry, response-size, and tool budgets
  before expensive work; trust a proxy header only under an explicit topology;
  sanitize provider errors; keep credentials outside images and request logs;
  and run the container unprivileged from pinned inputs.
- **Transfer rationale:** read-only endpoints can still leak data, consume
  provider quota, amplify traffic, or exhaust compute and memory.
- **Scope and limits:** this is defense in depth, not authentication, a
  distributed limiter, DDoS protection, or a substitute for TLS/network and
  infrastructure monitoring. Exact values remain project-local.
- **Regression references:** public gate, limiter/proxy, abort/error, bounded
  body/upstream, and Docker pin/user tests at the source ref.

## UDA-AR-2026-08-14-005 — Secret detectors require positive structure, not forbidden-word presence

- **Originating evidence:** AskRigor `tests/public-site-deployment.test.ts`,
  SHA-256
  `eb1d4006c386b7085f718d98c25d44ba25a2edc429a6bf32c92a595b25c63042`;
  universal fix and regression at `4b8247cb335d2f4c0ff8470e7101863bf44325be`.
- **Incident/test:** the portable audit flagged a negative assertion that
  rejects a private-key header from an archive. Removing or obfuscating that
  guard would have weakened the source project.
- **Lesson:** high-confidence secret findings should require enough positive
  structure to distinguish a credential from tests, documentation, and deny
  lists. For PEM private keys, require a matching block and plausible encoded
  payload; do not treat a standalone forbidden marker as a committed key.
- **Transfer rationale:** precise detectors preserve trust and prevent teams
  from weakening security regressions merely to make an audit green.
- **Scope and limits:** a structurally incomplete leaked key may evade this
  content rule. Layer filename checks, provider token patterns, hosted secret
  scanning/push protection, history review, and human investigation; never
  downgrade a real credential because it appears in a test file.
- **Regression references:**
  `test_negative_private_key_assertion_is_not_a_secret` and
  `test_private_key_content_in_ordinary_file_is_an_error`.

## Anti-patterns

- Reconstructing a complete canonical document from a hash, excerpt, lesson,
  checkpoint, or model memory.
- Treating a provider cap, local timeout, or HTTP success as evidence-complete.
- Running credentialed provider tests in ordinary untrusted PR CI.
- Calling a public endpoint safe merely because its tools are read-only.
- Deleting a negative secret regression to silence a lexical scanner.

## Update rule

Re-review these lessons when the cited source contracts, protocol loader,
provider-validation boundary, public server topology, or audit detector changes.
Supersession requires a new evidence artifact and explicit links; a project
summary cannot silently rewrite this record.
