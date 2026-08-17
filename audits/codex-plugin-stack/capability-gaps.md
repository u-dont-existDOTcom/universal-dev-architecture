# Capability gaps after cleanup

## Durable generic jobs across clients

Native PTY polling is better for the assigned turn, but it does not provide Process Jobs' durable cross-client registry and replayable job identity. If this becomes necessary, replace the removed plugin with a narrower supervisor that keeps terminal polling as the default, detaches only on explicit request, records PID/log/exit state durably, and never releases an unfinished assigning task by policy.

## Observable subagent telemetry

The Codex JSONL stream used here does not expose reliable subagent spawn counts, reviewer identities, or wait durations. It emits unattributed collaboration waits even when later messages contain useful review findings. Future CLI versions should expose agent IDs, parent/child relations, timestamps, terminal states, and per-agent token/tool totals.

## Crash-resilient nested Codex execution

A desktop/terminal crash killed the active schedule and the restarted sandbox made `~/.codex` read-only to nested Codex, causing deterministic initialization failures. The durable ledger prevented duplicate work, but nested model trials required a host-boundary resume. A first-class local eval runner should survive UI exits or clearly reattach to owned processes.

## Controlled sampling and model identity

The CLI exposes no sampling seed, and a model alias can change server-side. The harness records model, reasoning effort, order, hashes, and timestamps but cannot guarantee bit-for-bit reruns. A stable model snapshot and seed would improve causal confidence.

## Coordinator active-board evidence

Coordinator and native both passed the prompt-aligned Task H recovery oracle and returned; Coordinator was faster in that single run but slower on Task C, and its exact-task-ID shared-checkout claim board remained default-off. The stack still lacks a staged, multi-window benchmark that directly measures claim admission, collision prevention, stale-owner recovery, and hook cost against native isolated subagents. Keep it outside the minimal stack and do not infer that the unique board caused the Task H timing result.

## Real-project breadth and repetition

Task H corrects the micro-fixture bias with one real 146-file repository feature, but each selected workflow condition has only one terminal run on that task. More public historical tasks and same-condition repetitions are needed before promoting any optional workflow globally or generalizing the Task H result across repositories and future models.

## Security termination contract

The Security skill-only Task F run surfaced a useful TOCTOU idea but produced a Linux-only patch, had an unverifiable reviewer path, and failed to terminate within 900 seconds. The actual formal Task I scan terminated but took 848.5 seconds and did not improve the final outcome over native. The stack lacks a portable, bounded scan/reviewer fan-in contract that preserves distinct findings and exits at a predictable cost.

## Browser performance dependency

The installed `web-perf` skill depends on Chrome DevTools MCP, which is absent. Browser Recorder is not installed, and Record and Replay is unavailable on Linux. Browser performance and recording remain gaps until a verified dependency is supplied.

## Hosted-control verification

Repository code and `gh` can inspect many GitHub facts, but branch protection, rulesets, security settings, and some organization controls still require authenticated hosted API evidence. No retained workflow should claim those controls are active from repository files alone.

## Domain-skill ablation evidence

Cloudflare, Nansen, SciSpace, and Wolfram provide plausible specialized value, but this coding benchmark does not measure their domain-task outcome lift. Their conditional status is capability-based, not an empirical claim that they improve general software development.
