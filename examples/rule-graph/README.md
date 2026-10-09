# Rule graph examples

These examples exercise the additive task-time rule graph without replacing canonical UDA prose.

## Normal Work handoff

```bash
python3 scripts/uda_rule_graph.py validate
python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/work-handoff.json --mode graph --output /tmp/work-contract.json
python3 scripts/uda_rule_graph.py explain --task examples/rule-graph/work-handoff.json --mode graph
python3 scripts/uda_rule_graph.py compare --task examples/rule-graph/work-handoff.json
```

This representative Work handoff requires multi-step durable recovery across turns or sessions, so continuity_required=true selects both continuous checkpoint records. It declares no exclusive competing-task lifecycle. Current action_classes facts must accompany checks at event refresh boundaries, including when an event was absent at compilation.

The flat catalog selects direct trigger matches. The graph route must additionally include `uda.active-contract.boundary-binding` through `requires` closure.

## Owner correction / recompile

```bash
python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/owner-correction.json --mode graph --output /tmp/corrected-contract.json
python3 scripts/uda_rule_graph.py explain --task examples/rule-graph/owner-correction.json --mode graph
```

The result must include `uda.owner-correction.reactivate` and its dependency closure.

## Literal final-output check

```bash
printf '2026-09-22 15:12 UTC\nElapsed time: 2 minutes\nResult\n' > /tmp/final.txt
python3 scripts/uda_rule_graph.py receipt --contract /tmp/corrected-contract.json --phase final-delivery --payload /tmp/final.txt --output /tmp/final-receipts.json
python3 - <<'PY'
import json
from pathlib import Path
path = Path('/tmp/final-receipts.json')
receipts = json.loads(path.read_text())
for receipt in receipts['receipts']:
    receipt.update(verdict='PASS',
                   evidence='Illustrative judgment of the final answer: current-turn clock readings, no open next action left undone.',
                   actor={'id': 'example-author', 'kind': 'fixture', 'relation': 'SAME_AGENT'},
                   issued_at='2026-09-22T15:12:00+00:00')
path.write_text(json.dumps(receipts))
PY
python3 scripts/uda_rule_graph.py check --contract /tmp/corrected-contract.json --task examples/rule-graph/owner-correction.json --phase final-delivery --destination owner-visible-final --payload /tmp/final.txt --receipts /tmp/final-receipts.json --clock-start 2026-09-22T15:10:00+00:00 --clock-end 2026-09-22T15:12:00+00:00
```

Supply the two current-turn readings as ISO 8601 timestamps with UTC offsets. The first line must match the end reading, and `Elapsed time` must equal their difference. Missing readings or a timestamp only on a later line block admission. The kernel's semantic final obligations, such as clock provenance and continuation, also need receipts bound to the exact final bytes; this example fills them with an illustrative judgment. Receipts never replace the timestamp and elapsed-time predicates.

## Durable checkpoint check

The continuity-enabled contract also requires a separate check of the saved checkpoint. This runnable example uses an illustrative fixture and assertion; for real work, use the current durable checkpoint and judge its exact bytes before filling the receipt. A final-answer check alone does not admit the whole phase.

```bash
cp tests/fixtures/usage-limit-continuity/turn-end-handoff-compliant.txt /tmp/checkpoint.txt
python3 scripts/uda_rule_graph.py receipt --contract /tmp/corrected-contract.json --phase final-delivery --payload /tmp/checkpoint.txt --output /tmp/checkpoint-receipts.json
python3 - <<'PY'
import json
from pathlib import Path
path = Path('/tmp/checkpoint-receipts.json')
receipts = json.loads(path.read_text())
for receipt in receipts['receipts']:
    receipt.update(verdict='PASS',
                   evidence='Fixture records done/next, reachable private state, account-bound recreation and one-line resume.',
                   actor={'id': 'example-author', 'kind': 'fixture', 'relation': 'SAME_AGENT'},
                   issued_at='2026-09-22T15:12:00+00:00')
path.write_text(json.dumps(receipts))
PY
python3 scripts/uda_rule_graph.py check --contract /tmp/corrected-contract.json --task examples/rule-graph/owner-correction.json --phase final-delivery --destination durable-task-checkpoint --payload /tmp/checkpoint.txt --receipts /tmp/checkpoint-receipts.json
```

Both scoped checks must be ADMITTED. The receipt check verifies binding, not the semantic judgment or actual persistence; a blank, missing or mismatched receipt blocks the checkpoint check.

## Stale graph recovery

Copy the catalog to a temporary path and alter one `source.selectors[].text` value so it no longer matches canonical prose:

```bash
cp rules/rule-graph/task-time-metadata.v1.json /tmp/stale-catalog.json
python3 - <<'PY'
import json
p='/tmp/stale-catalog.json'
d=json.load(open(p))
d['rules'][0]['source']['selectors'][0]['text'] += ' stale'
open(p,'w').write(json.dumps(d))
PY
python3 scripts/uda_rule_graph.py --catalog /tmp/stale-catalog.json validate
```

Validation must exit nonzero with `SOURCE_SELECTOR_CARDINALITY`. In Mission Control `shadow` mode, a missing/invalid compiled artifact does not change the existing Work prompt; in `graph` mode it fails closed. A valid legacy route remains available unless a real safety/authority condition independently blocks it.

## Impact

```bash
python3 scripts/uda_rule_graph.py impact patterns/task-time-lesson-activation.md
```

This reports directly sourced rules plus reverse `requires` dependents whose compiled contracts/caches need refresh.


## Action fact declarations

`facts.action_classes` is a declared KNOWN list: membership selects the named action, and an omitted value declares that action false. Use ABSENT when the whole action fact is absent. Missing/UNKNOWN facts remain unresolved and block any potentially applicable record; they are not false declarations.

The review/merge migration adds only these values to the existing fact:

| Value | Actual governed action |
|---|---|
| review_round | Designing, requesting or running noisy language-model review rounds whose findings govern acceptance. |
| review_finding_judgment | Judging or accepting those noisy-reviewer findings. |
| merge_gate | Designing, changing or operating merge gates; deciding whether a pull request may merge; preflighting hosted merge/release/deploy gates. |

Deterministic review/check loops are outside both review action values.

Every example envelope in this directory explicitly declares all three values absent in the action fact's provenance and KNOWN value list. A generic Work handoff is not a review round, finding judgment or merge decision merely because it hands off work. The synthetic fixture envelopes select these actions explicitly; unknown fact scope is tested fail-closed.

## Continuation and closure action scope

The existing action_classes fact also carries exclusive_task for the entire consequential multi-session competing-source task lifecycle, including pre-lock work; mission_control_terminal for a managed worker terminal attempt; provider_wait for a required provider wait; resume_reconciliation for restart/context recovery; task_completion for a long-running completion claim; black_box_model_test for model-input testing; task_closeout for protected post-merge retirement; and control_plane_testing for lock/acceptance regression work. Existing instruction_maintenance selects adoption of the portable instruction. These are scope facts, not authority grants. Missing/UNKNOWN applicability blocks; known absence omits only the absent action. Changing action scope requires recompilation and fresh receipts before its due boundary. No new fact kind is introduced.
