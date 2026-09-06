# Durable fresh-stage receipt protocol

Status: staged-route compatibility contract

New route schema v4 does not require this protocol. It uses one fresh binding
preload session followed by one fresh visible Extra High or Pro decision
session that writes canonical #59 directly in its first message. Canonical
decision schema v3 binds `binding_provider_session_id` and the distinct
`decision_provider_session_id` plus the exact binding envelope/hash and uses
`VISIBLE_EXTRA_HIGH_SESSION_GITHUB_ATTESTED` or
`VISIBLE_PRO_SESSION_GITHUB_ATTESTED`. Missing #59 fails the direct stage after
the bounded reconciliation window; there is no same-chat `continue`, automatic
semantic retry, reader, liveness, or final-writer stage.

The remainder of this document specifies the preserved route-schema-v3 and
canonical-schema-v2 compatibility path. Issue #61 remains available for that
path and diagnostics; it is not a prerequisite for direct route v4.

Browser `GENERATION_COMPLETE` is transport evidence only. It does not prove
that a provider session completed its admitted reasoning or write objective.
Semantic stage completion is carried through GitHub issue #61 without browser
output extraction.

## Receipt

Prefix:

```text
MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1
```

Schema-version 2 binds every receipt to both the earlier Mission Control
binding session and the current fresh GitHub stage session:

```json
{
  "schema_version": 2,
  "request_id": "...",
  "request_nonce": "...",
  "supervisor_id": "...",
  "binding_provider_session_id": "provider-session:binding",
  "stage_provider_session_id": "provider-session:reader-or-pro",
  "binding_capsule": { "schema_version": 1 },
  "binding_capsule_sha256": "...",
  "stage": "EXTRA_HIGH_READER | PRO_DECISION_STAGE",
  "status": "STAGE_COMPLETE | CONTINUE_REQUIRED"
}
```

Mission Control accepts the receipt only from the centrally configured #61
channel and authorized GitHub writer. The capsule must exactly match the
current Stage-1 MCP receipt, request, nonce, supervisor, worker, lane, time
window, evidence hash, owner-outcome binding, and #59/#61 targets. The stage
session must be a distinct completed first-message GitHub session with the
expected visible model label. Stale, prompt-forged, cross-stage, cross-session,
and legacy same-chat receipts fail closed.

## Extra High reader

The fresh Extra High reader reads substantive evidence from immutable GitHub
references and writes its #61 receipt in the same first message. A complete
receipt contains a compact durable `evidence_reading_capsule` with exact text
and SHA-256 for downstream Pro construction. It does not make the decision.

## Pro decision stage

The fresh Pro session reads the current reader receipt from #61, adjudicates,
and writes a `PRO_DECISION_STAGE` receipt to #61 in the same first message. A
complete receipt contains the canonical `pro_decision_block` exact text and
SHA-256. Semantic authority belongs to Pro.

If Pro records `CONTINUE_REQUIRED`, the relay creates another fresh Pro
first-message GitHub session after the global cooldown. It never depends on a
follow-up message retaining GitHub access.

## Final writer

A fresh Extra High GitHub session reads the ordered reader and Pro receipts,
checks completeness without reinterpretation, and writes the final canonical
#59 decision receipt in its first message. The decision must carry
`DURABLE_STAGE_RECEIPT_ATTESTED` and exactly preserve the durable Pro digest.

## Authority

Reader receipts are liveness/evidence transport only. The Pro receipt carries
the staged semantic decision. None of these receipts proves hidden backend
model identity or grants execution authority by itself. Mission Control MCP
remains read-only, and the browser never reads assistant output.
