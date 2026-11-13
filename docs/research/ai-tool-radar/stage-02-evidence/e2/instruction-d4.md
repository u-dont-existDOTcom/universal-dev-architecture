# The instruction Greptile's review carried for defect D4, as each reviewer got it in Experiment 2

```text
PRIORITY 5: historical fact-check and lesson repair patch cbd90d46; verify findings against current origin/main. Audit pipeline from user correction -> source re-read -> incident classification and one-report-per-incident -> provenance/lesson capture -> durable regression test -> versioned release. Find bypasses where a user-reported factual/protocol error is falsely marked fixed, stored without consent, duplicated or forgotten, or the wrong source is cited. Inspect changed claim-coverage, audit-source, lessons connector and tests. Give exact file/line, minimal failing fixture, severity; no speculative editorial advice or code changes.
```
