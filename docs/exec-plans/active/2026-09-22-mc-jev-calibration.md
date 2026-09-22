# Mission Control Jev calibration

- Owner outcome: continue low-cost Jev testing after initial live calibration.
- Assurance lane: iteration.
- Authority: current owner explicitly authorized continued testing and prior paid OpenRouter Jev calls.
- Privacy boundary: synthetic or allowlisted control-plane state only; no raw prompts, messages, chat locators, credentials, project IDs, task IDs, or private transcripts.
- Authority boundary: Jev remains shadow-only and non-authoritative.
- First observed defect: actor-only OWNER blocker representation caused a false negative.
- Candidate: add an explicit open_blocker_present fact to Jev state, test projection, and re-run bounded live synthetic calibration.
- Spend boundary for this pass: keep total additional Jev inference below USD 0.01.

## Live calibration checkpoint

- Initial exact-schema smoke: correct healthy action; $0.000040068.
- Initial 9-state benchmark: 8/9 actions; actor-only OWNER blocker was missed.
- Explicit open_blocker_present fixed the OWNER-blocker miss in a discriminating 4-call test.
- Expanded 31-state benchmark with the original under-specified action question: 20/31 primary-action matches; independent stalled/engineering signals often detected the condition despite the wrong single action.
- Same 31 states with an explicit ordered action policy: 31/31 primary-action matches.
- Hard-case repeatability: 33/33 primary-action matches across 11 cases repeated 3 times.
- Additional spend this continuation pass: approximately $0.004500132 before any further calls; cumulative since first Jev test approximately $0.005012826.
- Interpretation: Jev should interpret an explicit typed policy and provide probabilistic semantic signals; it should not be asked to infer Mission Control precedence from field names.

## Release verification

- Focused Jev tests: 6/6 PASS.
- TypeScript typecheck: PASS.
- Full Mission Control suite: 402/402 PASS.
- Root repository suite: 388/388 PASS.
- Deterministic repository audit: 0 errors; one pre-existing root AGENTS size warning.
- Test-efficiency telemetry: 273.03 s observed tests over 956.29 s task wall time; 0 forced redundant green reruns.
- No raw private conversation content was sent to Jev.
- Jev remains non-authoritative and disabled by default in runtime configuration.
