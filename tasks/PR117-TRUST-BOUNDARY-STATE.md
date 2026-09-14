# Trust-boundary amendment checkpoint

Authority: `PR117-FINAL-TRUST-BOUNDARY-AMENDMENT-2026-09-14.md` at live PR head
`05b3879202eedbf924fc48b1150e4d0e2eba2c4d`. Owner explicitly requires full verification,
same PR publication, no merge, no deployment. Canonical main fetched this turn.

Active contract: reject worker setter/readback self-attestation; require authenticated
SYSTEM durable task-creation evidence with exact authorization/directive/task/profile
binding; preserve null observations and distinct source/artifact hashes; preserve
no-self-escalation and 5/10 non-mutating telemetry. Tests at the runtime/ledger/finalization
seams are required; a pure helper pass cannot establish a callable provider bridge.

Implementation: evidence event and reference-only preflight added; store, finalization,
and telemetry check durable producer metadata. Current missing bridge yields
`WORK_TASK_CREATION_BRIDGE_UNAVAILABLE`. Policy uses `routingPolicyBaseCommit` plus
`contractVersion: TRUSTED_SETTER_V1`. Local verification passed: 58 focused/affected
tests, 270 full app tests (including further binding/identity cases), 321 repository
tests, typecheck, production build, three owner-integrity records, deterministic
audit, and byte-for-byte archive reconstruction (164 files, 78 parts).

Remaining product limitation: `CONTRACT_ONLY_BRIDGE_BLOCKED`. No model tasks are
authorized or needed for this repair. Next step: complete required suites/archive,
review diff, push existing branch, wait for hosted checks, deliver receipt.
