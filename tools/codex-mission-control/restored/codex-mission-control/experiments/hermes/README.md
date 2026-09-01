# Bounded Hermes continuity experiment

Hermes is an experimental continuity/supervision aid only. Mission Control's append-only ledger remains authoritative, and Symphony's execution role does not change.

Run the same scenario once per arm with the real scenario command after `--`:

```sh
npm run experiment:hermes -- --arm baseline --scenario continuity-after-restart -- node scenario-runner.mjs
npm run experiment:hermes -- --arm hermes --scenario continuity-after-restart -- node scenario-runner.mjs
```

Use `--dry-run` to validate the experiment contract without launching a scenario. Store result JSON outside the source archive or pass `--output <path>`. Stop immediately on any authority violation. Completing the experiment does not adopt Hermes; the adoption gate in `experiment.json` requires explicit evidence and a later owner decision.
