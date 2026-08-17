# Codex plugin audit and capability-ablation report

- **Audit date:** 2026-08-17
- **Host/model:** Linux, Codex CLI 0.147.0, `gpt-5.6-sol`, `xhigh`
- **Repository:** `u-dont-existDOTcom/universal-dev-architecture`
- **Decision target:** smallest stack that empirically produces the best development outcomes

## Executive conclusion

The smallest empirically best ordinary-development stack is:

> **Native Codex + concise repository-specific instructions + exact repository checks.**

No general workflow plugin earned a place in the default path.

- **Remove Superpowers.** Its engineering mode passed only one of four paired tasks, both Task C coordination variants failed, and removing it from maximum Task D saved 275 seconds and 547k input tokens. Another one-line fix consumed 1.58 million tokens and seven workflow artifacts.
- **Remove Engineering Guardrails.** Across paired Tasks A–F it produced no correctness win, added task-paired medians of 60 seconds, 143k input tokens, and 14.5 calls, and uniquely failed Task E while claiming validation had been preserved.
- **Remove/replace Coordinator from the default path.** On the decomposition task its default-off behavior matched native correctness with more time, tokens, and calls. Its unique explicitly activated multi-window claim board was not exercised, so this is not a high-confidence judgment against that specialized mode.
- **Remove the Codex Security `fix-finding` skill from the default path; treat the formal scan/tool pipeline as uncertain and specialized.** The skill-only Task F run found a real TOCTOU path-swap weakness beyond the oracle, but produced a Linux-specific `/proc/self/fd` patch and failed end to end at 900 seconds. On the same Task I prompt, the real scan pipeline matched native correctness while adding 542 seconds, 2.09 million input tokens, and 40 calls. Its distinct value was canonical scan and report artifacts, not a better patch.
- **Remove/replace the GitHub workflow skills from the default path; leave the connector conditional and uncertain.** The isolated condition had apps disabled, so it tested only four skill instructions. Removing those skills from maximum Task A preserved correctness while saving 68 seconds, 289k input tokens, and nine calls. It did not ablate the connector, which remains untested on a real PR/CI task.
- **Do not include unmeasured apps or domain skills in the empirical minimal stack.** Leave Plugin Management and exact domain integrations install-on-demand or dormant only when their named task requires them; their capability manifests are not evidence of performance benefit. Remove the currently unavailable Default Templates. Leave the non-implicit system-managed `review-agent` uncertain until a delegated-review benchmark exists.
- **Do not restore Process Jobs or Empire.** Process Jobs' turn-release policy directly harmed completion; Empire had no operational path and is now absent.

The maximum optional stack did not beat native Codex: it completed five of seven current trials versus eight of eight B0 runs. Across matched tasks, it added medians of 174 seconds, 727k input tokens, and thirteen calls; it also caused two user gates, two workflow artifacts, and both current C/E failures. B1's concise repository instructions passed A, C, and F while reducing task-paired medians by 3.4 seconds, 26.8k tokens, and 1.5 calls versus B0.

## Evidence and reproducibility

- [Methodology and rerun commands](../README.md)
- [Current and pre-removal inventory](../inventory/effective-stack-summary.md)
- [Runtime tool surface](../inventory/runtime-tool-surface.json)
- [Instruction-source evidence](../inventory/instruction-evidence.md)
- [Sanitized raw results](../results/published-raw/)
- [Normalized results](../results/normalized/all-trials.json)
- [Excluded crash/infrastructure attempt classification](../results/excluded/README.md)
- [Component decisions](../component-decisions.json)

The harness never credits invocation as success. It creates a fresh Git repository per trial, freezes the task/condition hash, captures JSONL/diff/status/workspace, injects a withheld oracle only after the agent stops, and scores correctness separately from cost. A correct workspace that times out remains an end-to-end failure.

## Inventory boundary

The frozen pre-removal snapshot contained 14 plugin manifests, 68 plugin skill files, 17 standalone/system skills, and two hook-bearing plugins. The current snapshot contains 12 manifests, 55 plugin skill files, the same 17 standalone/system skills, and one hook-bearing plugin. Process Jobs and Empire are absent.

The live tool schema contains 293 calls: 280 MCP tools and 13 native functions. GitHub (89), Linear (59), Nansen (38), Atlassian Rovo (31), Sites (22), and Codex Security (19) are the largest named groups. A visible schema is not treated as proof of account authorization or benefit.

The effective instruction chain includes unavoidable system/developer policy, `~/.codex/AGENTS.md`, repository `AGENTS.md`, `.github/AGENTS.md`, and `state/AGENTS.md`. The global automatic-coordination agreement was constant in every condition, so its marginal effect was not measured. Its prescriptive preference for worktrees, durable ledgers, delegation, and independent review creates a static risk of the same ceremony measured from optional workflow skills; narrow that preference while preserving permission for proportionate coordination. The reversible-merge and GitHub keyring-boundary sections should remain.

## Benchmark methodology

### Tasks

| Task | Class | Required outcome |
| --- | --- | --- |
| A | Small bug fix | Locate defect, minimal fix, regression coverage, verification. |
| B | Ambiguous feature | Infer a sufficient design without an unnecessary owner gate, implement, test. |
| C | Multi-component feature | Decompose safely, coordinate dependencies, integrate and verify. |
| D | Difficult debugging | Reproduce, isolate root cause, avoid random patching, verify hidden invariant. |
| E | Refactor | Extract a seam while preserving validation, rounding, shape, and API. |
| F | Security-sensitive change | Block lexical, prefix, absolute, symlink, and type variants while preserving valid reads. |
| G | Long-running workflow | Poll a >60-second failure to terminal, diagnose saved state, resume, and verify completion. |
| H | Real-project multi-component feature | Add a crash-resilient scheduler across core, CLI, and tests in a 146-file historical repository snapshot. |
| I | Formal security workflow | Compare native remediation, Security instructions, and the actual Security scan/tool pipeline on the same isolated path-boundary task. |

### Conditions

B0 disables optional plugins, apps, hooks, rules, and all discovered skills, while honestly retaining unavoidable system/developer instructions. B1 adds one controlled hashed repository instruction. Add-one, pairwise-interaction, current-maximum, specialized Security, GitHub idle-surface, maximum-minus-component, and minimal-finalist conditions use exact installed skill paths and prompt preflight.

The sampling plan is adaptive rather than a full Cartesian product. Important workflow systems are observed across multiple task classes; B0 Task A is repeated independently. Clear approval-gate failures and the 900-second specialized Security timeout are not repeated merely to inflate sample count. Domain apps receive availability/uniqueness assessment rather than irrelevant toy coding trials.

Tasks A-G are deterministic micro-projects (21-69 seed lines). They isolate causal behavior and withheld invariants, but they structurally favor low-ceremony execution and cannot alone settle planning or coordination value on large work. Task H was added from a real 146-file/~24k-line repository snapshot to challenge that bias. At this report boundary, the host safety gate still requires fresh owner approval before sending that public snapshot to nested model runs; no Task H outcome is credited unless a terminal raw trial exists.

### Metrics and important limits

Correctness requires both visible and withheld tests. The structured scorer records whole-harness wall time, completed calls, actual completed test commands, CLI-reported tokens, changed files/lines, workflow artifacts, user-input gates, false completion claims, collaboration waits, and command failures.

The numeric **engineering-quality proxy** is deterministic bookkeeping based on test-file presence, changed-file count, workflow artifacts, and correctness. It is not a blinded assessment of architecture, simplicity, maintainability, or test design. For example, Coordinator's separated component tests score below B0's single larger test file solely because more files changed. Manual qualitative review therefore qualifies those process scores and caught a portability defect in Security's numerically passing patch.

Subagent creation is not reliably observable in current JSONL. `receiver_thread_ids: []` does not prove a wait was useless. Useful findings appeared after some waits, but reviewer identity and causality are unavailable; the Task F Security stderr also records a failed collaboration spawn. The report therefore labels these unattributed waits, does not invent a subagent count, and uses terminal timeout plus total cost as the harm evidence.

A terminal/UI crash killed the active schedule but did not corrupt Git or completed trial evidence. The ledger resumed without rerunning terminal results. The restarted sandbox made `~/.codex` read-only to nested Codex, so fifteen sub-second initialization attempts were preserved and excluded before resuming at the host boundary.

## Benchmark results

<!-- BEGIN BENCHMARK_TABLE -->
| Task | Configuration | Success | Engineering-quality proxy | Verification | Time (s) | Overhead | Human intervention | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| task-a | b0 r1 | yes | 90.0 | 100.0 | 61.2 | 5 calls; 92054 input tokens; 2 files; 1 failed commands | 0 | final message unavailable |
| task-a | b0 r2 | yes | 90.0 | 100.0 | 50.2 | 6 calls; 89075 input tokens; 2 files; 1 failed commands | 0 | final message unavailable |
| task-a | b1 r1 | yes | 90.0 | 100.0 | 52.2 | 4 calls; 63781 input tokens; 2 files | 0 | — |
| task-a | github r1 | yes | 90.0 | 100.0 | 60.7 | 5 calls; 95620 input tokens; 2 files; 1 failed commands | 0 | — |
| task-a | guardrails r1 | yes | 90.0 | 100.0 | 87.1 | 15 calls; 153945 input tokens; 2 files; 2 failed commands | 0 | — |
| task-a | guardrails-plus-superpowers r1 | yes | 90.0 | 100.0 | 249.8 | 18 calls; 692101 input tokens; 2 files; 1 waits; 3 failed commands | 0 | — |
| task-a | maximum r1 | yes | 90.0 | 100.0 | 230.0 | 28 calls; 848852 input tokens; 2 files; 5 failed commands | 0 | — |
| task-a | maximum-minus-github r1 | yes | 90.0 | 100.0 | 161.6 | 19 calls; 559694 input tokens; 2 files; 3 failed commands | 0 | — |
| task-a | superpowers-engineering r1 | no | 55.0 | 0.0 | 86.8 | 17 calls; 160551 input tokens; 0 files; 1 failed commands | 1 | — |
| task-b | b0 r1 | yes | 90.0 | 100.0 | 128.3 | 8 calls; 203814 input tokens; 2 files; 1 waits; 1 failed commands | 0 | — |
| task-b | guardrails r1 | yes | 90.0 | 100.0 | 133.4 | 22 calls; 272002 input tokens; 2 files; 3 failed commands | 0 | — |
| task-b | guardrails-plus-superpowers r1 | yes | 90.0 | 100.0 | 307.4 | 14 calls; 642070 input tokens; 2 files; 1 waits; 2 failed commands | 0 | — |
| task-b | maximum r1 | yes | 90.0 | 100.0 | 392.6 | 41 calls; 945963 input tokens; 2 files; 1 waits; 4 failed commands | 0 | — |
| task-b | superpowers-engineering r1 | yes | 70.0 | 100.0 | 367.2 | 46 calls; 975647 input tokens; 4 files; 2 workflow artifacts; 1 waits; 5 failed commands | 0 | — |
| task-c | b0 r1 | yes | 90.0 | 100.0 | 158.0 | 11 calls; 205438 input tokens; 4 files; 1 failed commands | 0 | — |
| task-c | b1 r1 | yes | 90.0 | 100.0 | 118.4 | 7 calls; 117560 input tokens; 4 files | 0 | — |
| task-c | coordinator r1 | yes | 84.0 | 100.0 | 182.1 | 17 calls; 352697 input tokens; 7 files; 1 failed commands | 0 | — |
| task-c | coordinator-plus-superpowers r1 | no | 55.0 | 0.0 | 69.7 | 17 calls; 144813 input tokens; 0 files | 1 | — |
| task-c | guardrails r1 | yes | 87.0 | 100.0 | 204.4 | 31 calls; 333370 input tokens; 6 files; 6 failed commands | 0 | — |
| task-c | maximum r1 | no | 55.0 | 0.0 | 112.4 | 7 calls; 299138 input tokens; 0 files; 1 failed commands | 1 | — |
| task-c | maximum-minus-coordinator r1 | no | 55.0 | 0.0 | 86.2 | 17 calls; 190142 input tokens; 0 files; 1 failed commands | 1 | — |
| task-c | superpowers-coordination r1 | no | 55.0 | 0.0 | 58.7 | 10 calls; 96772 input tokens; 0 files | 1 | — |
| task-d | b0 r1 | yes | 90.0 | 100.0 | 87.0 | 9 calls; 177184 input tokens; 2 files; 2 failed commands | 0 | — |
| task-d | guardrails r1 | yes | 90.0 | 100.0 | 184.1 | 25 calls; 342272 input tokens; 2 files; 2 waits; 3 failed commands | 0 | — |
| task-d | guardrails-plus-superpowers r1 | yes | 80.0 | 100.0 | 408.9 | 40 calls; 1071075 input tokens; 3 files; 1 workflow artifacts; 1 waits; 4 failed commands | 0 | — |
| task-d | maximum r1 | yes | 90.0 | 100.0 | 427.2 | 22 calls; 904562 input tokens; 2 files; 2 waits; 3 failed commands | 0 | — |
| task-d | maximum-minus-guardrails r1 | yes | 48.0 | 100.0 | 587.1 | 27 calls; 1576617 input tokens; 9 files; 7 workflow artifacts; 5 waits | 0 | — |
| task-d | maximum-minus-superpowers r1 | yes | 90.0 | 100.0 | 151.8 | 21 calls; 357280 input tokens; 2 files; 5 failed commands | 0 | — |
| task-d | superpowers-engineering r1 | no | 55.0 | 0.0 | 74.0 | 17 calls; 176035 input tokens; 0 files | 1 | — |
| task-e | b0 r1 | yes | 90.0 | 100.0 | 72.5 | 6 calls; 91250 input tokens; 3 files; 1 failed commands | 0 | — |
| task-e | guardrails r1 | no | 55.0 | 0.0 | 146.2 | 18 calls; 276727 input tokens; 3 files; 2 failed commands | 0 | 1 false completion claim |
| task-e | guardrails-plus-superpowers r1 | no | 55.0 | 0.0 | 101.1 | 6 calls; 262503 input tokens; 0 files | 1 | — |
| task-e | maximum r2 | no | 55.0 | 0.0 | 88.1 | 17 calls; 249063 input tokens; 0 files; 1 failed commands | 1 | — |
| task-e | superpowers-engineering r1 | no | 55.0 | 0.0 | 60.2 | 8 calls; 109574 input tokens; 0 files; 1 failed commands | 1 | — |
| task-f | b0 r1 | yes | 90.0 | 100.0 | 153.9 | 8 calls; 140080 input tokens; 2 files; 1 failed commands | 0 | — |
| task-f | b1 r1 | yes | 90.0 | 100.0 | 214.2 | 8 calls; 190745 input tokens; 2 files | 0 | — |
| task-f | guardrails r1 | yes | 90.0 | 100.0 | 262.1 | 23 calls; 298802 input tokens; 2 files; 3 failed commands | 0 | — |
| task-f | maximum r1 | yes | 70.0 | 100.0 | 655.4 | 24 calls; 1525552 input tokens; 4 files; 2 workflow artifacts; 1 waits; 3 failed commands | 0 | — |
| task-f | maximum-minus-security r1 | no | 55.0 | 0.0 | 112.9 | 23 calls; 406221 input tokens; 0 files; 1 failed commands | 1 | — |
| task-f | security r1 | no (implementation correct; run failed) | 90.0 | 100.0 | 900.2 | 44 calls; n/a input tokens; 2 files; 8 waits; 4 failed commands | 0 | scored preserved workspace despite trial infrastructure failure; final message unavailable; token usage unavailable |
| task-g | b0 r1 | yes | 90.0 | 100.0 | 180.3 | 5 calls; 130309 input tokens; 1 files; 1 failed commands | 0 | — |
| task-g | maximum r1 | yes | 90.0 | 100.0 | 180.7 | 7 calls; 384235 input tokens; 1 files; 1 failed commands | 0 | — |
| task-i | b0 r1 | yes | 90.0 | 100.0 | 306.7 | 22 calls; 795310 input tokens; 2 files; 3 failed commands | 0 | — |
| task-i | security r1 | yes | 90.0 | 100.0 | 594.5 | 29 calls; 1489711 input tokens; 2 files; 3 waits; 2 failed commands | 0 | — |
| task-i | security-full r1 | yes | 90.0 | 100.0 | 848.5 | 62 calls; 2885602 input tokens; 2 files; 2 waits; 3 failed commands | 0 | — |
<!-- END BENCHMARK_TABLE -->

## Principal empirical findings

### Native baseline

Native B0 completed all seven task classes correctly across eight trials, including two independent Task A runs. It also produced the smallest or tied-smallest diffs and generally the lowest time, call, and token cost. B1 then showed that a concise repository contract can improve this baseline without a workflow plugin. This is the reference; plugins receive no credit for capabilities already demonstrated here.

### Engineering Guardrails

Guardrails did not improve correctness on A–D or F and increased paired cost. On E it moved item validation out of the service but failed to place it in the extracted `priceOrder` seam; its direct seam tests omitted the invalid-item case, the withheld oracle failed, and its final message claimed validation was preserved. Native E passed in 72.5 seconds; Guardrails failed after 146.2 seconds and 276,727 input tokens.

### Superpowers and interactions

Superpowers engineering stopped A, D, and E without a code change to ask questions whose recommended answers followed directly from “preserve existing behavior.” Its B run eventually passed but created design and plan files, attempted a commit in a read-only Git sandbox, and used 367.2 seconds, 975,647 input tokens, and 46 calls versus B0's 128.3 seconds, 203,814 tokens, and 8 calls.

Superpowers coordination and Coordinator+Superpowers both stopped Task C for an unsupported-severity choice that the contract allowed the agent to resolve safely; both failed the hidden oracle with zero changed files. Guardrails can partially suppress Superpowers' stopping behavior, but the combined successful runs are still far more expensive: D took 408.9 seconds and 1,071,075 input tokens versus native's 87.0 seconds and 177,184.

The direct maximum-minus comparison is stronger: removing Superpowers from Task D preserved the correct two-file fix while cutting wall time from 427.2 to 151.8 seconds and input tokens from 904,562 to 357,280. Conversely, removing Guardrails while leaving Superpowers triggered the full SDD ceremony: 587.1 seconds, 1,576,617 tokens, five waits, a blocked commit, and seven plan/brief/report/review artifacts for the same one-line repair.

### Coordinator

Coordinator followed its own default-off contract because no marker or explicit durable-task request existed. That is better than forcing agents, but it means the plugin added no coordination value in this run. Task C used more time, tokens, and calls than native with the same oracle outcome. Its seven-file diff separated component tests that B0 kept in one larger file, so file count alone is not treated as an engineering-quality harm.

Removing Coordinator from maximum Task C did not change the outcome: both variants stopped for Superpowers approval with zero implementation. This separates Coordinator's lack of demonstrated lift from the approval-gate failure caused by the other workflow system.

### Security

Task F's `security` condition exposed the `fix-finding` skill but disabled plugin tools; it was not a formal scan. Native, Guardrails, maximum, and the preserved Security workspace all satisfied the original Task F oracle. The skill-only run continued into an additional race analysis and identified an ancestor-symlink swap between validation and open. That idea is useful qualitative evidence, but its patch unconditionally resolved `/proc/self/fd/<descriptor>` and its own review scoped the claim to Linux; on platforms without `/proc`, legitimate reads fail. Its 900-second timeout, failed collaboration spawn, and unattributed waits also make it an end-to-end failure. Do not credit this as a verified independent Security worker or a portable remediation.

Task I then compared the same prompt under B0, the skill-only condition, and `security-full`, which enabled the actual plugin tool surface. All three produced portable patches and passed both oracles. Native took 306.7 seconds, 795,310 input tokens, and 22 calls; the skill-only run took 594.5 seconds, 1,489,711 tokens, and 29 calls; the real scan pipeline took 848.5 seconds, 2,885,602 tokens, and 62 calls. The formal pipeline returned a terminal canonical report with three validated findings, but found no requirement-relevant defect native missed and did not improve the final code outcome. One role-relevant trial supports a distinct artifact capability, not a general KEEP decision.

Maximum-minus-Security removed only Security skills; plugin tools remained enabled in both variants. It failed before implementation because Superpowers asked whether legitimate in-root symlinks should remain allowed. That does not justify Security in the ordinary stack: native and B1 passed without either component. It shows only that the skill surface happened to suppress a harmful general-workflow gate inside the already-bad maximum composition.

### Long-running work and Process Jobs

<!-- BEGIN LONG_RUNNING_FINDING -->
Native Task G completed end to end in 180.3 seconds with 5 completed calls. It observed the first terminal failure, reused the saved state on the second invocation, and ran the verification suite instead of detaching the command. Maximum completed in 180.7 seconds with 7 calls and 384235 input tokens, versus native's 5 calls and 130309 input tokens. Process Jobs was not reinstalled after owner removal. Its direct pre-removal audit showed a deliberate detach/release-turn policy and measurable global hook overhead. Native owns same-turn process completion; a future durable registry must be explicit and must not change that default.
<!-- END LONG_RUNNING_FINDING -->

## Effective capability map

The structured map is [capability-map.json](../capability-map.json). Primary ownership after cleanup is:

| Stage | Authoritative owner | Optional distinct layer |
| --- | --- | --- |
| Requirements and scope | Owner + repository instructions + native Codex | None |
| Design and planning | Native proportional plan; one repository execution plan for complex work | Formal Security threat-model artifacts only on explicit request; outcome value uncertain |
| Decomposition and agents | Native parent with isolated worktrees and independent surfaces | None by default |
| Implementation, TDD, debugging | Native Codex + repository tests | None |
| Verification and review | Exact repository checks + one risk-triggered native review | Formal Security validation only when canonical artifacts are explicitly required; outcome value uncertain |
| Processes | Native PTY/session, poll to terminal | Future explicit durable supervisor is a capability gap |
| Git/GitHub | Native `git`/`gh` + repository governance | Connector only if a structured remote operation truly needs it |
| Persistence/recovery | Git, one execution plan, `state/CURRENT-STATE.md`, PR | None |
| Plugin/domain administration | Dormant specialized tool | Plugin Management or exact domain app/skill |

## Core workflow overlap matrix

The dense core-workflow matrix is [overlap-matrix.csv](../overlap-matrix.csv). The exhaustive long-form inventory is [component-relationships.csv](../component-relationships.csv): every decision component has an explicit capability/component/comparison row; no additional row means no material interaction was identified. Codes: A unique, B complementary, C useful reinforcement, D partial redundancy, E near-total redundancy, F conflict, G better native/elsewhere.

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

<!-- BEGIN ABLATION_TABLE -->
| Component | Performance with | Performance without | Marginal benefit | Marginal harm | Confidence |
| --- | --- | --- | --- | --- | --- |
| Engineering Guardrails | 5/6 end-to-end; 5/6 correct workspaces; median 165.2s, 287764 input tokens, 22.5 calls | 7/7 end-to-end; 7/7 correct workspaces; median 87.0s, 140080 input tokens, 8.0 calls | No correctness win; one additional hidden failure. | median deltas: +60.0s, +143327.0 input tokens, +14.5 calls; 0 user gates, 0 workflow artifacts, 1 false completion claims | High |
| Superpowers engineering | 1/4 end-to-end; 1/4 correct workspaces; median 80.4s, 168293 input tokens, 17.0 calls | 5/5 end-to-end; 5/5 correct workspaces; median 72.5s, 92054 input tokens, 6.0 calls | No repeatable benefit; successful B produced the same behavior. | median deltas: +9.4s, +44155.2 input tokens, +9.8 calls; 3 user gates, 2 workflow artifacts, 0 false completion claims | High |
| Guardrails + Superpowers | 3/4 end-to-end; 3/4 correct workspaces; median 278.6s, 667086 input tokens, 16.0 calls | 3/4 end-to-end; 3/4 correct workspaces; median 139.8s, 274364 input tokens, 20.0 calls | Adding Superpowers preserved the same 3/4 correctness and added substantial cost; no marginal gain. | median deltas: +168.3s, +454112.0 input tokens, -2.5 calls; 1 user gates, 1 workflow artifacts, 0 false completion claims | High |
| Coordinator | 1/1 end-to-end; 1/1 correct workspaces; median 182.1s, 352697 input tokens, 17.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 158.0s, 205438 input tokens, 11.0 calls | No outcome gain on multi-component Task C. | median deltas: +24.1s, +147259.0 input tokens, +6.0 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | High |
| Superpowers coordination | 0/1 end-to-end; 0/1 correct workspaces; median 58.7s, 96772 input tokens, 10.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 158.0s, 205438 input tokens, 11.0 calls | None; zero-file failure on Task C. | median deltas: -99.3s, -108666.0 input tokens, -1.0 calls; 1 user gates, 0 workflow artifacts, 0 false completion claims | High |
| Coordinator + Superpowers vs native | 0/1 end-to-end; 0/1 correct workspaces; median 69.7s, 144813 input tokens, 17.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 158.0s, 205438 input tokens, 11.0 calls | None; zero-file failure on Task C. | median deltas: -88.4s, -60625.0 input tokens, +6.0 calls; 1 user gates, 0 workflow artifacts, 0 false completion claims | High |
| Adding Superpowers to Coordinator | 0/1 end-to-end; 0/1 correct workspaces; median 69.7s, 144813 input tokens, 17.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 182.1s, 352697 input tokens, 17.0 calls | Lost Task C correctness; no synergy. | median deltas: -112.4s, -207884.0 input tokens, +0.0 calls; 1 user gates, 0 workflow artifacts, 0 false completion claims | High |
| Adding Coordinator to Superpowers coordination | 0/1 end-to-end; 0/1 correct workspaces; median 69.7s, 144813 input tokens, 17.0 calls | 0/1 end-to-end; 0/1 correct workspaces; median 58.7s, 96772 input tokens, 10.0 calls | No correctness gain; added cost. | median deltas: +10.9s, +48041.0 input tokens, +7.0 calls; 1 user gates, 0 workflow artifacts, 0 false completion claims | Medium |
| Codex Security fix-finding skill | 1/2 end-to-end; 2/2 correct workspaces; median 747.4s, 1489711 input tokens, 36.5 calls | 2/2 end-to-end; 2/2 correct workspaces; median 230.3s, 467695 input tokens, 15.0 calls | One additional TOCTOU idea on F, but no portable outcome lift; same-prompt I matched native. | median deltas: +517.0s, +694401.0 input tokens, +21.5 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | High for default-path harm; medium for specialized analysis |
| Codex Security formal scan/tool pipeline | 1/1 end-to-end; 1/1 correct workspaces; median 848.5s, 2885602 input tokens, 62.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 306.7s, 795310 input tokens, 22.0 calls | Canonical scan/report lifecycle; no correctness lift on same-prompt Task I. | median deltas: +541.8s, +2090292.0 input tokens, +40.0 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | Medium; one role-relevant trial |
| Current maximum | 5/7 end-to-end; 5/7 correct workspaces; median 230.0s, 848852 input tokens, 22.0 calls | 8/8 end-to-end; 8/8 correct workspaces; median 107.7s, 135194 input tokens, 7.0 calls | No paired correctness advantage. | median deltas: +174.4s, +727378.0 input tokens, +13.0 calls; 2 user gates, 2 workflow artifacts, 0 false completion claims | High |
| Repository instructions / minimal finalist | 3/3 end-to-end; 3/3 correct workspaces; median 118.4s, 117560 input tokens, 7.0 calls | 4/4 end-to-end; 4/4 correct workspaces; median 107.5s, 116067 input tokens, 7.0 calls | Repository-specific invariants and verification contract. | median deltas: -3.4s, -26783.5 input tokens, -1.5 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | Medium |
| GitHub workflow skill surface | 1/1 end-to-end; 1/1 correct workspaces; median 60.7s, 95620 input tokens, 5.0 calls | 2/2 end-to-end; 2/2 correct workspaces; median 55.7s, 90564 input tokens, 5.5 calls | No ordinary-coding outcome advantage; connector was disabled in this condition. | median deltas: +5.1s, +5055.5 input tokens, -0.5 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | Medium |
| Guardrails inside maximum | 1/1 end-to-end; 1/1 correct workspaces; median 427.2s, 904562 input tokens, 22.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 587.1s, 1576617 input tokens, 27.0 calls | Partially suppressed Superpowers ceremony in this interaction; no standalone gain. | median deltas: -160.0s, -672055.0 input tokens, -5.0 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | Medium |
| Superpowers inside maximum | 1/1 end-to-end; 1/1 correct workspaces; median 427.2s, 904562 input tokens, 22.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 151.8s, 357280 input tokens, 21.0 calls | None; removing it preserved correctness while sharply reducing cost. | median deltas: +275.4s, +547282.0 input tokens, +1.0 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | High |
| Coordinator inside maximum | 0/1 end-to-end; 0/1 correct workspaces; median 112.4s, 299138 input tokens, 7.0 calls | 0/1 end-to-end; 0/1 correct workspaces; median 86.2s, 190142 input tokens, 17.0 calls | None; both variants failed Task C. | median deltas: +26.2s, +108996.0 input tokens, -10.0 calls; 1 user gates, 0 workflow artifacts, 0 false completion claims | Medium |
| Security skills inside maximum | 1/1 end-to-end; 1/1 correct workspaces; median 655.4s, 1525552 input tokens, 24.0 calls | 0/1 end-to-end; 0/1 correct workspaces; median 112.9s, 406221 input tokens, 23.0 calls | Prevented Superpowers' approval stop on F; plugin tools remained enabled in both variants. | median deltas: +542.5s, +1119331.0 input tokens, +1.0 calls; 0 user gates, 2 workflow artifacts, 0 false completion claims | Medium |
| GitHub skills inside maximum | 1/1 end-to-end; 1/1 correct workspaces; median 230.0s, 848852 input tokens, 28.0 calls | 1/1 end-to-end; 1/1 correct workspaces; median 161.6s, 559694 input tokens, 19.0 calls | None on Task A; connector remained enabled in both variants. | median deltas: +68.4s, +289158.0 input tokens, +9.0 calls; 0 user gates, 0 workflow artifacts, 0 false completion claims | Medium |
<!-- END ABLATION_TABLE -->

## Removal list, highest confidence first

1. **Process Jobs — REMOVE — HARMFUL.** Already removed; do not restore.
2. **Superpowers — REMOVE — HARMFUL.** Multiple correctness failures from approval gates plus extreme overhead on successes.
3. **Engineering Guardrails — REMOVE — HARMFUL.** No win, consistent cost, one hidden regression and false claim.
4. **Maximum optional stack — REMOVE — HARMFUL.** Five of seven successes versus B0's eight of eight, at extreme cost.
5. **Empire — REMOVE.** Operationally dead and now absent.
6. **Default Templates — REMOVE.** All twenty skills were unavailable in prompt preflight.
7. **web-perf — REMOVE.** Required Chrome DevTools MCP is absent.
8. **Browser Recorder / Record and Replay — REMOVE as unavailable.** Not installed / unsupported on Linux.
9. **Parallels — REMOVE.** Native retrieval replacement.
10. **Exa — REMOVE.** No demonstrated lift over native retrieval.
11. **Coordinator — REMOVE / REPLACE FROM DEFAULT PATH.** Ordinary-task evidence favors native coordination, but the unique staged claim board remains unmeasured.
12. **GitHub workflow skills — REMOVE / REPLACE FROM DEFAULT PATH.** Use native `git`/`gh`; the connector itself was not ablated by these trials.

## Specialized and conditional components

Exact triggers are versioned in [activation-rules.md](../activation-rules.md).

- **Codex Security formal pipeline — UNCERTAIN / SPECIALIZED:** consider only for an explicit formal scan, threat model, finding validation/attack path, vulnerability report, or hardening request where canonical artifacts matter. It owns its scan workers and receives a bounded terminal budget. Do not use `fix-finding` as an ordinary implementation methodology.
- **Plugin Management:** explicit permission/dependency/connection/removal administration.
- **Nansen:** on-chain/crypto query; **SciSpace:** structured literature work; **Wolfram:** exact computation/data.
- **Atlassian, Linear, Sites, Document Control:** explicit connected-service tasks; external writes remain authority-gated.
- **Cloudflare family:** one broad router or the exact narrow specialist, never all overlapping skills. Turnstile/Sites/Wrangler deployment requires explicit external-state authority.
- **System imagegen/OpenAI/plugin/skill skills:** their narrow named tasks only.
- **GitHub connector/app:** uncertain and conditional pending a real connected PR/CI benchmark; never credit the skill-only trials as connector evidence.
- **review-agent:** uncertain system-managed role; explicit delegated read-only review only, never an automatic second review layer.

## Recommended minimal stack

### Always present

- Native Codex execution, Git/worktree, subagent, web/browser where available, and terminal polling.
- Concise current repository `AGENTS.md` plus exact test/audit commands.
- Git commits, one durable repository execution plan/state checkpoint for genuinely complex work, and a PR for durable publication/review.
- Global reversible-local-merge and GitHub keyring-boundary instructions.

### Installed only if wanted, dormant by default

- Codex Security formal scan/tool pipeline only if its canonical artifacts are worth retaining despite uncertain marginal outcome value; otherwise omit it.
- Plugin Management.
- Exact domain apps/skills whose real work justifies them.

### Absent from the ordinary stack

Superpowers, Engineering Guardrails, default-path Coordinator and GitHub workflow skills, Process Jobs, Empire, Default Templates, Exa, Parallels, unavailable browser recorder/performance skills, and the broad automatic-coordination instruction. The GitHub connector and system-managed review agent are not ordinary-path components, but this audit does not support removing them outright.

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
- Condition `content_sha256` is a prompt-routing hash, not a complete remote plugin/server identity. Skill-content and frozen effective-stack/tool-surface hashes are stored separately; server-side connector drift remains possible.
- Maximum-stack Task E under the earlier pre-removal hash is retained but excluded from the current-maximum aggregate; a current-hash repetition closes the comparison.
- Process Jobs was not reinstalled for Task G after the owner removed it; the decision combines direct pre-removal instruction/runtime/hook measurement with native Task G.
- A-G are synthetic micro-projects; broad complex-project conclusions remain lower confidence until Task H or another real-project suite receives terminal model trials.
- Coordinator's unique durable shared-checkout claim-board mode was not staged across persistent windows; evidence supports default-path removal only.
- The GitHub skill-only condition had apps disabled, while maximum-minus-GitHub left apps enabled. It supports removing/narrowing workflow instructions, not a causal connector judgment.
- Important comparisons span task classes but generally have one trial per task/configuration. Same-task stochastic variance is under-sampled beyond B0 Task A.
- Domain components are classified from actual manifests/tools/dependencies and operational state, not from artificial coding tasks.

## Decision table

<!-- BEGIN DECISION_TABLE -->
| Component | Decision | Empirical improvement | Unique capability | Redundancy | Harm/overhead | Consequence of removal | Confidence |
| --- | --- | ---: | --- | --- | --- | --- | ---: |
| Native Codex shell, Git, worktrees, subagents, and polling | KEEP | A-G B0 completed all seven task classes and eight baseline trials; the additional Task I B0 also passed end to end | Core implementation and execution substrate | Plugins wrap rather than replace it | No optional methodology context | No development agent | 99% |
| Repository-specific AGENTS.md and exact verification commands | KEEP | B1 passed A, C, and F; task-paired medians improved by 3.4 seconds, 26784 input tokens, and 1.5 calls versus B0 | Project-specific truth and commands | Generic workflows cannot safely substitute | F spent 60 seconds more on selective review; context cost rises if instructions grow | Missed local requirements and weaker recovery | 97% |
| Global reversible-local-merge agreement | KEEP — AUTHORITY CONTRACT | Not independently ablated; static authority analysis shows that the grant removes a class of unnecessary merge questions | Owner-granted authority boundary | None | Small instruction cost | More avoidable user gates | 82% |
| Global automatic-coordination agreement | UNCERTAIN — NARROW | Not independently ablated; it was constant in every condition, including the successful B0 baseline | Owner permission to coordinate is useful | Native judgment and repository plans already choose isolation/delegation | Static wording may pressure plans, ledgers, delegation, and review even when disproportionate | Replace only the prescriptive preference while retaining permission for proportionate coordination | 55% |
| Global GitHub sandbox-auth agreement | KEEP — HOST CONTRACT | Not independently ablated; host/sandbox diagnostics verify the keyring boundary | Host-specific execution-boundary knowledge | Conflicts with stale plugin auth advice but is not redundant | Small instruction cost | Unnecessary login prompts and unsafe credential workarounds | 90% |
| Maximum optional stack (configuration) | REMOVE — HARMFUL | Five of seven current trials succeeded versus eight of eight native baselines; no paired correctness advantage | None as a combined always-on surface | Aggregates overlapping workflow, security, GitHub, domain, and system skills | Task-paired medians added 174.4 seconds, 727378 input tokens, and 13 calls; two user gates and two workflow artifacts | Retain only explicit specialized components below | 99% |
| Codex Engineering Guardrails 1.1.1 | REMOVE — HARMFUL | Five of six paired runs passed versus seven of seven B0 runs; no correctness win and Task E regressed | No necessary capability beyond native implementation/review | High overlap with native reasoning, repository checks, and system review | Task-paired medians added 60.0 seconds, 143327 input tokens, and 14.5 calls; Task E made a false completion claim | Use native proportional planning, diagnosis, tests, and verification | 97% |
| Superpowers 6.2.0 | REMOVE — HARMFUL | Engineering mode passed one of four paired tasks; both Task C coordination variants failed | None needed; writing-skills is better covered by the system skill creator | Near-total overlap with native/repository planning, TDD, debugging, agents, review, and Git | Three approval stops; removing it from maximum Task D saved 275.4 seconds and 547282 tokens; another run used 1.58M tokens and seven artifacts for a one-line fix | Lose prescriptive training-style rituals, not an execution primitive | 99% |
| Codex Coordinator 0.4.0 | REMOVE / REPLACE — DEFAULT PATH | Task C correctness matched B0 but took 182.1s versus 158.0s, 352697 versus 205438 input tokens, and 17 versus 11 calls; its 7 versus 4 changed files were organized component tests, not adjudicated quality harm; the explicitly triggered durable-claim mode was not exercised | Active shared-checkout claim board, not role-tested in this benchmark | Native subagents, isolated worktrees, Git, and repository recovery state cover the normal need | Measured extra time, tokens, and calls plus session hooks, exact-ID requirements, advisory-only path boundaries, and same-checkout topology | Ordinary work loses nothing measured; explicit same-checkout multi-window work loses an unmeasured claim registry | 78% |
| Codex Security fix-finding skill 0.1.19 | REMOVE — HARMFUL FROM DEFAULT | Task I matched native correctness but took 594.5s/1489711 input tokens/29 calls versus 306.7s/795310/22; Task F surfaced a real TOCTOU idea but timed out and produced a Linux-only patch | Structured finding-remediation methodology | Native implementation and adversarial review produced the required portable fix | No oracle lift in two tasks; large cost, one nonterminal run, unattributed waits, and a portability regression | Use native remediation; no measured final-outcome loss | 88% |
| Codex Security formal scan/tool pipeline 0.1.19 | UNCERTAIN — SPECIALIZED | Task I completed a real standard scan and portable patch, but matched native correctness and found no requirement-relevant defect native missed | Canonical scan, threat-model, validation, attack-path, coverage, and report artifacts | Source review and remediation overlap native; formal artifact lifecycle is distinct | 848.5s, 2885602 input tokens, and 62 calls versus native 306.7s, 795310, and 22; one trial only | Lose the formal canonical security-report workflow, not ordinary security reasoning | 72% |
| GitHub plugin workflow skills 0.1.8 | REMOVE / REPLACE — DEFAULT PATH | The skill-only Task A surface matched native within noise; removing the four skills from maximum preserved correctness and saved 68.4 seconds, 289158 input tokens, and nine calls | Packaged PR-comment and CI-fix procedures | Native git, gh, gh api, repository rules, and current host-auth instructions cover the mechanics | Connector/auth advice is partly stale and adds workflow context without ordinary coding lift | Use native gh and repository rules; no measured ordinary-development loss | 86% |
| GitHub plugin connector/app 0.1.8 | UNCERTAIN — CONDITIONAL | Not measured: the isolated GitHub condition had apps disabled and maximum-minus-GitHub left apps enabled | Structured connected GitHub context may simplify remote PR, issue, and review-thread work | Native gh and gh api cover most remote operations | Large tool schema and an additional auth/data path; causal overhead is unmeasured | Lose connector convenience and use native gh; outcome impact is unknown | 45% |
| Plugin Management 0.1.0 | UNCERTAIN — CONDITIONAL | Not empirically tested | Plugin permissions, dependencies, connections, and removal administration | Limited | Irrelevant prompt/tool surface during coding | Plugin administration moves to product UI/manual paths | 50% |
| Default Templates 0.1.1 | REMOVE | No coding lift and all twenty templates were unavailable in controlled prompt preflight | Potential named document, spreadsheet, and presentation layouts | No engineering-workflow role | Twenty cached catalog entries with no callable current path | No current capability loss; recreate a needed template explicitly | 90% |
| Codex Process Jobs 0.3.0 | REMOVE — HARMFUL | Durability did not improve the owner's ordinary completion outcome | Cross-client durable job registry and replayable logs/results | Native PTY polling is better for same-turn work | Released unfinished work by design and added global hook latency | No generic cross-client job registry; terminal work completes reliably in-turn | 99% |
| Empire 1.5.1 | REMOVE | No runnable path during audit | Hypothetical external-model routing | Review, handoff, image, and readiness overlap native/system components | Dead catalog/context/maintenance surface | None in current environment | 98% |
| Codex Browser Recorder | REMOVE | Not installed | None available | Native browser where supported | Catalog ambiguity | None | 99% |
| OpenAI Record and Replay | REMOVE | Unavailable on Linux | None available on this host | Native browser tools only partially overlap | Unavailable path | None on this host | 99% |
| Parallels app | REMOVE | No development lift demonstrated | No verified unique capability | General retrieval duplicates native search/fetch | Connector and tool surface | Use native web/search | 87% |
| Exa app | REMOVE | No development lift demonstrated | Semantic retrieval style, not a necessary capability | Native web/search | Connector and tool surface | Use native web/search | 82% |
| Nansen app | UNCERTAIN — INSTALL ON DEMAND | Not measured | On-chain and crypto intelligence if authorized | Low | Large irrelevant tool surface outside crypto work | Lose integrated on-chain queries | 45% |
| SciSpace app | UNCERTAIN — INSTALL ON DEMAND | Not measured | Structured academic discovery and triage if authorized | Paper search overlaps native web | External connector/context | Use native paper search and manual synthesis | 42% |
| Wolfram app | UNCERTAIN — INSTALL ON DEMAND | Not measured | Exact symbolic/numeric computation and curated data if authorized | Some overlap with native calculation | External connector/context | Lose integrated Wolfram evaluation | 48% |
| Atlassian Rovo app | UNCERTAIN — INSTALL ON DEMAND | Not measured | Structured Jira and Confluence context/writes if authorized | CLI/API access may overlap | 31 external schemas and consequential writes | Use native APIs/manual workflow | 44% |
| Linear app | UNCERTAIN — INSTALL ON DEMAND | Not measured | Structured Linear workflow-state reads/writes if authorized | CLI/API access may overlap | 59 external schemas and competing persistence state | Use native API/manual workflow | 45% |
| Sites app | UNCERTAIN — INSTALL ON DEMAND | Not measured | Integrated site deployment/configuration surface if authorized | Deployment CLIs and provider APIs overlap | 22 write-capable external schemas | Use explicit provider CLI/API | 43% |
| Codex Document Control app | UNCERTAIN — INSTALL ON DEMAND | Not measured | Document-session administration | Low | Irrelevant outside document tasks | Lose integrated document-session operations | 40% |
| Safety Settings app | UNCERTAIN — OUTSIDE AUDIT | Outside development scope and not measured | Product parental-control and trusted-contact settings | None in development stack | Irrelevant tool surface during coding | Lose integrated safety administration | 35% |
| Hotline app | UNCERTAIN — OUTSIDE AUDIT | Outside development scope and not measured | Local hotline lookup | Native web may overlap | Negligible one-tool surface | Use native search | 35% |
| imagegen system skill | SYSTEM — CONDITIONAL (UNBENCHMARKED) | Not measured | Raster generation/editing | Replaces Empire image routing | None when trigger remains narrow | Lose image generation | 55% |
| openai-docs system skill | SYSTEM — CONDITIONAL (UNBENCHMARKED) | Not measured | Current authoritative OpenAI product retrieval | Native web can retrieve but lacks routing discipline | None when trigger remains narrow | Weaker/currentness-risky Codex and API guidance | 55% |
| plugin-creator system skill | SYSTEM — CONDITIONAL (UNBENCHMARKED) | Not measured | Current plugin manifest/cachebuster workflow | Limited | None outside plugin creation | Manual plugin scaffolding | 50% |
| skill-creator system skill | SYSTEM — CONDITIONAL (UNBENCHMARKED) | Not measured | Skill authoring contract | Makes Superpowers writing-skills unnecessary | None outside skill work | Manual skill authoring | 50% |
| skill-installer system skill | SYSTEM — CONDITIONAL (UNBENCHMARKED) | Not measured | Curated/repository skill installation | Limited | External mutation only on explicit install tasks | Manual installation | 50% |
| review-agent system skill | UNCERTAIN — SYSTEM-MANAGED | Not measured: it is intentionally non-implicit and is invoked only when another agent delegates read-only review | A system-managed delegated-review role may supply a standardized read-only reviewer | Native subagent review | Minimal while implicit invocation is disabled; duplicate review is possible only when explicitly delegated | Unknown; may remove a system-managed reviewer role even though native review remains | 45% |
| cloudflare umbrella skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Broad Cloudflare routing | Overlaps every Cloudflare specialist | Multiple retrieval workflows if co-loaded | Generic Pages/storage/network topics need native docs retrieval | 40% |
| agents-sdk skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Current Agents SDK patterns | Partial Durable Objects and umbrella overlap | Conditional context | Weaker agent-platform guidance | 42% |
| cloudflare-email-service skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Email Service and routing configuration | Some umbrella overlap | Conditional context and external side effects | Manual current-doc retrieval | 42% |
| cloudflare-one skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Zero Trust/SASE product guidance | Umbrella and migrations overlap | Conditional context | Manual current-doc retrieval | 42% |
| cloudflare-one-migrations skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Vendor migration and parity mapping | Cloudflare One overlap | Conditional context | Lose packaged migration mappings | 40% |
| durable-objects skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Durable Objects implementation depth | Agents SDK and umbrella overlap | Conditional context | Manual current-doc retrieval | 42% |
| sandbox-sdk skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Secure untrusted-code execution patterns | Low | Conditional context | Manual current-doc retrieval | 43% |
| turnstile-spin skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | End-to-end Turnstile setup | Cloudflare umbrella overlap | Can create account objects, deploy, and persist a skill | Manual setup; fewer accidental external mutations | 42% |
| web-perf skill | REMOVE | Cannot run | Potential Chrome performance diagnostics | Native browser tooling may partially overlap | Missing Chrome DevTools MCP guarantees an unavailable path | No current capability loss | 99% |
| workers-best-practices skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Workers production anti-pattern review | Umbrella overlap | Conditional context | Manual current-doc review | 42% |
| wrangler skill | UNCERTAIN — INSTALL ON DEMAND | Not measured | Current Wrangler command/config syntax | Umbrella and specialist overlap | Can lead to deployment/config mutations if authority is unclear | Manual CLI documentation lookup | 43% |
| Universal repository compliance workflow | KEEP | Provides deterministic PR/main verification independent of agent claims | Hosted enforcement of unit tests and repository audit | Repeats local checks intentionally at a trust boundary | Bounded CI time | Weaker merge-time enforcement | 97% |
| Weekly repository drift workflow | KEEP — CONDITIONAL | Provides scheduled drift detection and durable issue reconciliation | Time-triggered verification after agent sessions | Repeats deterministic audit intentionally | Scheduled CI and issue-write activity | Drift is found only during manual work | 90% |
| CODEOWNERS, Dependabot, PR template, and codex-repository manifest | KEEP | Supplies durable ownership, update, evidence, and exact-command contracts | Repository governance state | Some prose overlap is intentional | Small maintenance cost | Weaker durable governance and reproducibility | 94% |
<!-- END DECISION_TABLE -->
