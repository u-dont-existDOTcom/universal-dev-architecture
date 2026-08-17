# Codex plugin audit and capability-ablation report

- **Audit date:** 2026-08-17
- **Host/model:** Linux, Codex CLI 0.147.0, `gpt-5.6-sol`, `xhigh`
- **Repository:** `u-dont-existDOTcom/universal-dev-architecture`
- **Decision target:** smallest stack that empirically produces the best development outcomes

## Executive conclusion

The smallest empirically best ordinary-development stack is:

> **Native Codex + concise repository-specific instructions + exact repository checks.**

No general workflow plugin earned a place in the default path.

- **Remove Superpowers.** It caused three requirements-complete tasks to stop for unnecessary design confirmation, made successful Task B 2.9× slower with 4.8× the input tokens and two extra documents, and made combined workflows dramatically slower without a correctness gain.
- **Remove Engineering Guardrails.** Across paired Tasks A, B, D, E, and F it produced no correctness win, was slower and more tool/token intensive, and uniquely failed Task E while claiming validation had been preserved.
- **Remove/replace Coordinator.** On the task designed for useful decomposition, it correctly declined durable lanes but still matched native correctness with more time, tokens, calls, and changed files. Native subagents, worktrees, Git, and one repository plan cover normal coordination.
- **Keep Codex Security only as an explicit specialized layer.** It found a real TOCTOU path-swap weakness beyond the withheld oracle and produced the strongest Task F remediation. Its run nevertheless failed end to end at the 900-second timeout, so scans need a strict terminal budget and must own their coordination phase exclusively.
- **Use native `git`/`gh` instead of the GitHub workflow plugin.** Retain the repository's deterministic GitHub workflows and governance files. The plugin's connector routing/auth assumptions are stale and its ordinary mechanics are redundant.
- **Keep Plugin Management, artifact templates, domain apps, and domain skills dormant and conditional.** They do not belong in ordinary coding context.
- **Do not restore Process Jobs or Empire.** Process Jobs' turn-release policy directly harmed completion; Empire had no operational path and is now absent.

The maximum optional stack did not beat native Codex. On the completed A and F comparisons alone, it used roughly 4–5× the wall time and 9–11× the input tokens while producing the same oracle result; Task F also added a failed worktree attempt and two methodology documents.

## Evidence and reproducibility

- [Methodology and rerun commands](../README.md)
- [Current and pre-removal inventory](../inventory/effective-stack-summary.md)
- [Runtime tool surface](../inventory/runtime-tool-surface.json)
- [Instruction-source evidence](../inventory/instruction-evidence.md)
- [Raw results](../results/raw/)
- [Normalized results](../results/normalized/all-trials.json)
- [Excluded crash/infrastructure attempts](../results/excluded/README.md)
- [Component decisions](../component-decisions.json)

The harness never credits invocation as success. It creates a fresh Git repository per trial, freezes the task/condition hash, captures JSONL/diff/status/workspace, injects a withheld oracle only after the agent stops, and scores correctness separately from cost. A correct workspace that times out remains an end-to-end failure.

## Inventory boundary

The frozen pre-removal snapshot contained 14 plugin manifests, 68 plugin skill files, 17 standalone/system skills, and two hook-bearing plugins. The current snapshot contains 12 manifests, 55 plugin skill files, the same 17 standalone/system skills, and one hook-bearing plugin. Process Jobs and Empire are absent.

The live tool schema contains 293 calls: 280 MCP tools and 13 native functions. GitHub (89), Linear (59), Nansen (38), Atlassian Rovo (31), Sites (22), and Codex Security (19) are the largest named groups. A visible schema is not treated as proof of account authorization or benefit.

The effective instruction chain includes unavoidable system/developer policy, `~/.codex/AGENTS.md`, repository `AGENTS.md`, `.github/AGENTS.md`, and `state/AGENTS.md`. The global automatic-coordination agreement itself should be narrowed because its preference for worktrees, durable ledgers, delegation, and independent review can force the same ceremony measured here. The reversible-merge and GitHub keyring-boundary sections should remain.

## Benchmark methodology

### Tasks

| Task | Class | Required outcome |
| --- | --- | --- |
| A | Small bug fix | Locate defect, minimal fix, regression coverage, verification. |
| B | Ambiguous feature | Infer a sufficient design without an unnecessary owner gate, implement, test. |
| C | Multi-component feature | Decompose safely, coordinate dependencies, integrate and verify. |
| D | Difficult debugging | Reproduce, isolate root cause, avoid random patching, verify hidden invariant. |
| E | Refactor | Extract a seam while preserving validation, rounding, shape, and API. |
| F | Security-sensitive change | Block lexical, prefix, absolute, symlink, type, and race variants while preserving valid reads. |
| G | Long-running workflow | Poll a >60-second failure to terminal, diagnose saved state, resume, and verify completion. |

### Conditions

B0 disables optional plugins, apps, hooks, rules, and all discovered skills, while honestly retaining unavoidable system/developer instructions. B1 adds one controlled hashed repository instruction. Add-one, pairwise-interaction, current-maximum, specialized Security, GitHub idle-surface, maximum-minus-component, and minimal-finalist conditions use exact installed skill paths and prompt preflight.

The sampling plan is adaptive rather than a full Cartesian product. Important workflow systems are observed across multiple task classes; B0 Task A is repeated independently. Clear approval-gate failures and the 900-second specialized Security timeout are not repeated merely to inflate sample count. Domain apps receive availability/uniqueness assessment rather than irrelevant toy coding trials.

### Metrics and important limits

Correctness requires both visible and withheld tests. The structured scorer records whole-harness wall time, completed calls, actual completed test commands, CLI-reported tokens, changed files/lines, workflow artifacts, user-input gates, false completion claims, collaboration waits, and command failures.

Subagent creation is not reliably observable in current JSONL. `receiver_thread_ids: []` does not prove a wait was useless: some such waits returned valuable review findings. The report therefore labels them unattributed waits, does not invent a subagent count, and uses terminal timeout plus total cost as the harm evidence.

A terminal/UI crash killed the active schedule but did not corrupt Git or completed trial evidence. The ledger resumed without rerunning terminal results. The restarted sandbox made `~/.codex` read-only to nested Codex, so fifteen sub-second initialization attempts were preserved and excluded before resuming at the host boundary.

## Benchmark results

<!-- BENCHMARK_TABLE -->

## Principal empirical findings

### Native baseline

Native B0 completed every currently paired ordinary task correctly, including two independent Task A runs. It also produced the smallest or tied-smallest diffs and generally the lowest time, call, and token cost. This is the reference; plugins receive no credit for capabilities already demonstrated here.

### Engineering Guardrails

Guardrails did not improve correctness on A, B, D, or F and increased cost on each. On E it moved item validation out of the service but failed to place it in the extracted `priceOrder` seam; its direct seam tests omitted the invalid-item case, the withheld oracle failed, and its final message claimed validation was preserved. Native E passed in 72.5 seconds; Guardrails failed after 146.2 seconds and 276,727 input tokens.

### Superpowers and interactions

Superpowers engineering stopped A, D, and E without a code change to ask questions whose recommended answers followed directly from “preserve existing behavior.” Its B run eventually passed but created design and plan files, attempted a commit in a read-only Git sandbox, and used 367.2 seconds, 975,647 input tokens, and 46 calls versus B0's 128.3 seconds, 203,814 tokens, and 8 calls.

Superpowers coordination and Coordinator+Superpowers both stopped Task C for an unsupported-severity choice that the contract allowed the agent to resolve safely; both failed the hidden oracle with zero changed files. Guardrails can partially suppress Superpowers' stopping behavior, but the combined successful runs are still far more expensive: D took 408.9 seconds and 1,071,075 input tokens versus native's 87.0 seconds and 177,184.

### Coordinator

Coordinator followed its own default-off contract because no marker or explicit durable-task request existed. That is better than forcing agents, but it means the plugin added no coordination value. Task C still expanded from native's four changed files to seven, including an extra module and extra tests, with no outcome gain.

### Security

Native, Guardrails, maximum, and formal Security all satisfied the Task F withheld oracle. Only the formal Security run continued into an additional race analysis, opened the checked file with descriptor semantics, revalidated the opened target, and added a regression for an ancestor-symlink swap between validation and open. That is real specialized value.

The formal run then continued through unattributed collaboration waits and failed to terminate by 900.2 seconds. Maximum did not automatically provide this stronger analysis; it produced the ordinary realpath fix after 655.4 seconds and two workflow documents. Security should therefore be an explicit, bounded adversarial phase—not part of every implementation prompt.

### Long-running work and Process Jobs

<!-- LONG_RUNNING_FINDING -->

## Effective capability map

The structured map is [capability-map.json](../capability-map.json). Primary ownership after cleanup is:

| Stage | Authoritative owner | Optional distinct layer |
| --- | --- | --- |
| Requirements and scope | Owner + repository instructions + native Codex | None |
| Design and planning | Native proportional plan; one repository execution plan for complex work | Security threat model for explicit security architecture |
| Decomposition and agents | Native parent with isolated worktrees and independent surfaces | None by default |
| Implementation, TDD, debugging | Native Codex + repository tests | None |
| Verification and review | Exact repository checks + one risk-triggered native review | Formal Security validation when explicitly requested |
| Processes | Native PTY/session, poll to terminal | Future explicit durable supervisor is a capability gap |
| Git/GitHub | Native `git`/`gh` + repository governance | Connector only if a structured remote operation truly needs it |
| Persistence/recovery | Git, one execution plan, `state/CURRENT-STATE.md`, PR | None |
| Plugin/domain administration | Dormant specialized tool | Plugin Management or exact domain app/skill |

## Overlap matrix

The complete machine-readable matrix is [overlap-matrix.csv](../overlap-matrix.csv). Codes: A unique, B complementary, C useful reinforcement, D partial redundancy, E near-total redundancy, F conflict, G better native/elsewhere.

|  | Native/repo | Guardrails | Superpowers | Coordinator | Security | GitHub | Plugin Mgmt | Process Jobs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Native/repo | — | D/C | G/F | D/B | B/A | D/B | A | G/F |
| Guardrails | D/C | — | E/F | D/B | D/B | B | — | G/F |
| Superpowers | G/F | E/F | — | D/F | D/F | D/F | — | F |
| Coordinator | D/B | D/B | D/F | — | D/F | B | — | D/F |
| Security | B/A | D/B | D/F | D/F | — | D/B | B | D/F |
| GitHub | D/B | B | D/F | B | D/B | — | B | — |
| Plugin Mgmt | A | — | — | — | B | B | — | B |
| Process Jobs | G/F | G/F | F | D/F | D/F | — | B | removed |

## Conflict matrix

The full collision record is [conflict-matrix.csv](../conflict-matrix.csv), with exact component instructions, consequence, authority, and narrowing recommendation. Highest-impact conflicts are:

| Component A | Component B | Relationship | Measured/likely consequence | Authority and action |
| --- | --- | --- | --- | --- |
| Superpowers brainstorming | Native/repo/Guardrails proceed-when-specified | Conflict | A, D, E stopped for needless confirmation | Owner/repo authoritative; remove global Superpowers activation. |
| Superpowers plans/SDD/review | Repository plan + native adaptive agents | Near-total redundancy/conflict | Extra files, failed commit/worktree attempts, waits, large token/time cost | One repo plan; native agents only when independent. |
| Coordinator shared-checkout lanes | Superpowers worktree/bite-size SDD | Conflict | Combined C stopped with no implementation | Never co-activate; recommendation removes both defaults. |
| Security scan workers | Other coordination systems | Conflict | Nested/opaque waits and timeout | Security alone owns explicit scan orchestration under a terminal budget. |
| GitHub auth/connector assumptions | Global keyring rule/current schema | Conflict/staleness | False logout gates and redundant CLI/scripts | Global rule and live schema authoritative. |
| Process Jobs turn release | Owner terminal-completion requirement | Conflict | Work returned unfinished | Already removed; native polling authoritative. |

## Ablation results

<!-- ABLATION_TABLE -->

## Removal list, highest confidence first

1. **Process Jobs — REMOVE — HARMFUL.** Already removed; do not restore.
2. **Superpowers — REMOVE — HARMFUL.** Multiple correctness failures from approval gates plus extreme overhead on successes.
3. **Engineering Guardrails — REMOVE — HARMFUL.** No win, consistent cost, one hidden regression and false claim.
4. **Empire — REMOVE.** Operationally dead and now absent.
5. **web-perf — REMOVE.** Required Chrome DevTools MCP is absent.
6. **Browser Recorder / Record and Replay — REMOVE as unavailable.** Not installed / unsupported on Linux.
7. **Parallels — REMOVE.** Native retrieval replacement.
8. **Exa — REMOVE.** No demonstrated lift over native retrieval.
9. **Coordinator — REMOVE / REPLACE.** Unique claim board did not justify hooks/topology/context; native isolated coordination performed better.
10. **GitHub workflow plugin — REMOVE / REPLACE.** Use native `git`/`gh`; keep repository GitHub enforcement.

## Specialized and conditional components

Exact triggers are versioned in [activation-rules.md](../activation-rules.md).

- **Codex Security:** explicit formal scan, threat model, finding validation/attack path, vulnerability report, or hardening request. It owns its scan workers and receives a bounded terminal budget.
- **Plugin Management:** explicit permission/dependency/connection/removal administration.
- **Default Templates:** explicit named document/spreadsheet/presentation artifact.
- **Nansen:** on-chain/crypto query; **SciSpace:** structured literature work; **Wolfram:** exact computation/data.
- **Atlassian, Linear, Sites, Document Control:** explicit connected-service tasks; external writes remain authority-gated.
- **Cloudflare family:** one broad router or the exact narrow specialist, never all overlapping skills. Turnstile/Sites/Wrangler deployment requires explicit external-state authority.
- **System imagegen/OpenAI/plugin/skill skills:** their narrow named tasks only.

## Recommended minimal stack

### Always present

- Native Codex execution, Git/worktree, subagent, web/browser where available, and terminal polling.
- Concise current repository `AGENTS.md` plus exact test/audit commands.
- Git commits, one durable repository execution plan/state checkpoint for genuinely complex work, and a PR for durable publication/review.
- Global reversible-local-merge and GitHub keyring-boundary instructions.

### Installed only if wanted, dormant by default

- Codex Security, with the narrow activation/termination rule above.
- Plugin Management.
- Exact domain apps/skills whose real work justifies them.

### Absent from the ordinary stack

Superpowers, Engineering Guardrails, Coordinator, GitHub workflow plugin, Process Jobs, Empire, Exa, Parallels, unavailable browser recorder/performance skills, and the broad automatic-coordination instruction.

## Authoritative workflow

The exact reusable workflow is [authoritative-workflow.md](../authoritative-workflow.md): interpret → inspect/reproduce → proportional plan → one isolated ownership model → smallest test-backed slice → root-cause diagnosis → one strong verification pass → specialized review only on trigger → one durable checkpoint → integration under existing authority.

Long-running commands remain owned by the assigning turn and are polled to terminal. No component may equate detachment, a scan invocation, a plan, or a review request with task completion.

## Capability gaps

[capability-gaps.md](../capability-gaps.md) records the retained gaps: durable generic cross-client jobs, observable subagent telemetry, crash-resilient nested eval execution, stable sampling/model identity, bounded Security fan-in, Linux browser-recording/performance dependencies, hosted-control verification, and missing domain-skill outcome trials.

## Limitations and confidence

- No sampling seed exists; important workflows were replicated across task classes rather than a wasteful full Cartesian product.
- The model alias may change server-side. Hashes, order, CLI version, reasoning effort, and timestamps are retained.
- Wall time is whole-harness elapsed for original runs; newer reruns also record agent-only elapsed time.
- Tool schemas do not prove connector authorization.
- Maximum-stack Task E under the earlier pre-removal hash is retained but excluded from the current-maximum aggregate; a current-hash repetition closes the comparison.
- Process Jobs was not reinstalled for Task G after the owner removed it; the decision combines direct pre-removal instruction/runtime/hook measurement with native Task G.
- Domain components are classified from actual manifests/tools/dependencies and operational state, not from artificial coding tasks.

## Decision table

<!-- DECISION_TABLE -->
