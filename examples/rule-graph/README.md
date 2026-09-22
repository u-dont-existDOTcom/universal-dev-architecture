# Rule graph examples

These examples exercise the additive task-time rule graph without replacing canonical UDA prose.

## Normal Work handoff

```bash
python3 scripts/uda_rule_graph.py validate
python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/work-handoff.json --mode graph --output /tmp/work-contract.json
python3 scripts/uda_rule_graph.py explain --task examples/rule-graph/work-handoff.json --mode graph
python3 scripts/uda_rule_graph.py compare --task examples/rule-graph/work-handoff.json
```

The flat catalog selects direct trigger matches. The graph route must additionally include `uda.active-contract.boundary-binding` through `requires` closure.

## Owner correction / recompile

```bash
python3 scripts/uda_rule_graph.py compile --task examples/rule-graph/owner-correction.json --mode graph --output /tmp/corrected-contract.json
python3 scripts/uda_rule_graph.py explain --task examples/rule-graph/owner-correction.json --mode graph
```

The result must include `uda.owner-correction.reactivate` and its dependency closure.

## Literal final-output check

```bash
printf '2026-09-22 15:10 UTC\nResult\n' > /tmp/final.txt
python3 scripts/uda_rule_graph.py check --contract /tmp/corrected-contract.json --phase final-delivery --payload /tmp/final.txt
```

A timestamp only on a later line fails.

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
