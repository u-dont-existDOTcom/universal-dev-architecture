# Scheduler deadline and bug-repair learning promotion

Date: 2026-11-03. Disposition: promoted, bounded to asynchronous external work and automatic bug-repair lesson review. The sections marked NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT describe one owner's deployment; the reusable guidance does not depend on them.

## Origin and observed failure (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

An owner-authorized repair of a privately deployed article-retrieval MCP found repeated busy replies while the process and authentication remained responsive. Restarting restored two verified PDF retrievals. The initiating upstream/runtime hang was not uniquely recoverable from the old process, so the incident does not prove which dependency event failed.

The implementation had queue-wait expiry and HTTP timeouts, but the scheduler released its active slot only after its worker promise settled. A synthetic dependency that never settled reproduced the indefinite blockage at the actual MCP tool boundary. Three added queue-recovery tests failed against the old source. This established a concrete missing containment boundary rather than attributing the incident to load, credentials or a uniquely identified runtime defect.

## Repair evidence (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

The released candidate added a scheduler-owned 120-second deadline, propagated cancellation through primary/fallback/range requests, independently settled hung HTTP/header/body waits, fenced late results, released pending state and partial buffers, and added queue state to health. The deployment preserved the earlier source and configuration for rollback, saved connections and unrelated containers.

Validation: 66 relevant tests passed, plus one enabled staged HTTP contract test. Ten database OAuth integration tests were not run; unchanged auth was checked through live static authentication, missing-auth rejection and saved connection counts. Staging and the public MCP each returned two independently downloaded/checksummed PDFs and one expected route miss. Two more PDFs passed through the actual deployed consumer. No paid fallback was called.

Exact project source, failed/passing logs, source hashes and deployment receipts are retained in the owner's repair package and existing private deployment. This public extract intentionally excludes credentials, account identifiers, host locators, authentication links and conversation transcripts.

## Transfer rationale and limits

The transferable failure is an awaited external operation holding shared state with no independently enforced terminal boundary. It applies to more than article retrieval: network jobs, model calls, browser workers, subprocesses and other queue consumers can have the same ownership error. Caller timeouts alone do not prove dependency cancellation or queue recovery. Source-specific routes and numerical limits are examples, not universal defaults.

The owner also required future bug fixes to trigger reusable development-lesson review automatically. The existing durable-learning pattern already requires finding dispositions and warranted universal promotion; its index trigger previously named only saving/remembering instructions or preferences. Broaden that activation to debugging/bug repair and cross-reference the specialist asynchronous-work workflow. Preserve project-specific/no-new-lesson dispositions rather than forcing every fix into universal policy.

This change supplies engineering guidance and a portable fault-injection example. Its WORKFLOW_ONLY disposition is explicit: tests establish the portable primitive's behavior, not that every agent or application invokes it. Public runtime changes in unrelated apps remain under their own authorities; this promotion does not authorize a fleet-wide code rewrite.


## Exact released source pins (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

Released runtime image: `sha256:e42875d334410846198c7b76159135e1c320ec019ff5411bfcb6d1e1eb49a013`. SHA-256 of the privately retained source bytes:

- `articlePdf.ts`: `8bcf7189f0f44beca6086ce06dadea5afed85d1f27a323f54588758631e94baf`
- `safeHttp.ts`: `5adeeebb117eb3654625c2b51573f17e0c83f5544400d449801acb583965be30`
- `articleQueue.test.ts`: `a9872e5f9bff290b66ebb85b7f05febd1c5c148b39798476633ca9b71216bbd5`
