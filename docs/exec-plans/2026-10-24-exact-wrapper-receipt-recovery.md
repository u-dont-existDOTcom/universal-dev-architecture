# Exact single-wrapper receipt recovery

Some app-owned replies contain one plain outer markup element around an otherwise
strict canonical JSON decision. The normal receipt copier continues to reject
that framing. It does not automatically clean or reinterpret malformed replies.

A separately source-authorized operator recovery may remove only that element
and its surrounding framing whitespace. `removeSingleDecisionWrapper` preserves
the contained JSON bytes, including string escapes, numeric spelling, and
whitespace inside the JSON span. It rejects attributes, additional elements or
prose outside JSON, mismatched markup, non-object JSON, and malformed JSON.

`record-chatgpt-machine-transform.ts` keeps its existing digest-recomputation
operation by default. The explicit operation
`CANONICAL_JSON_SINGLE_OUTER_ELEMENT_REMOVE_ONLY` additionally requires:

- an exact source-authorization artifact SHA-256;
- the original and transformed machine blocks supplied through standard input
  as `{"sourceBlock":"...","transformedBlock":"..."}`;
- exact source and target hashes, matching request/session/supervisor identities,
  and an unchanged, correct decision-text digest;
- mechanical reconstruction of the target from the source's literal JSON span.

Its evidence records the specific operation, authorization digest, and preserved
JSON digest. Admission binds those to the original app-readback source and the
published candidate. The existing schema, writer, timing, private relocation,
and source-binding checks still apply. This operation is never represented as
digest repair and does not authorize another provider message or generation.

The authorization artifact belongs in the deployment's private evidence store.
Its hash binds the artifact; a hash alone does not establish owner consent.
Operators must obtain and preserve the actual specific authorization before
invoking the recovery. Source bodies must not be placed in command-line arguments,
logs, or a public repository.

Validation includes literal byte preservation, adversarial framing, distinct
operation provenance, missing authorization, changed JSON evidence, changed
writer permission, and ambiguous transformation receipts.
