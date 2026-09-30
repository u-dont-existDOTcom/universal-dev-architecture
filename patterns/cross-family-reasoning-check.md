# Cross-family reasoning check

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-09-24 ("anything which requires very complex reasoning and could benefit from a separate model check should be checked with either Opus 5.5 max thinking if it was from GPT, or with GPT Sol XHigh if it was from Opus"). Owner correction, 2026-09-29: long-running Opus reviews can legitimately take substantial time; before stopping or marking one unavailable, ask/check the reviewer runtime whether it is still working. The owner invited a better design; the scoping below is that refinement, not a weakening of either instruction.

## Problem

A model reviewing its own reasoning, or a sibling model from the same family reviewing it, tends to share the producer's blind spots. It often agrees with an error it would itself have made. A reviewer from a different model family has a different information state and different failure modes, so it can catch mistakes the producer normalized.

Two opposite failures are possible:

- **No check:** a long, subtle chain of reasoning drives a costly or hard-to-undo decision, and nobody outside the producing model ever examines it.
- **Check everything:** every non-trivial answer is sent to a second frontier model at maximum effort. That doubles spend and latency on work that tests, computation, or the owner's own trial would have checked more cheaply. The owner has explicitly objected to paying for pointless tool and model use.

## Existing-work basis

This is an **adaptation** of existing practice, not a new theory:

- `patterns/independent-evaluation-separation.md` already requires real independence, a blind first pass, and diagnostic rather than automatically authoritative findings. This pattern supplies the reviewer choice and trigger for reasoning checks.
- LLM evaluators recognize and favor their own generations (Panickssery, Bowman & Feng, 2024: https://arxiv.org/abs/2404.13076). This supports using a reviewer that did not produce the text.
- Intrinsic self-correction of reasoning without external feedback is unreliable (Huang et al., ICLR 2024: https://arxiv.org/abs/2310.01798). This supports using external feedback rather than asking the producer to re-check itself.

Not established here: which model family is the better reviewer for which task type. The reviewer's verdict is evidence, not a ruling.

## Trigger

Run the check only when **all three** of the following hold:

1. **Reasoning-heavy.** The conclusion rests on long or subtle reasoning, not on lookups. Examples include a multi-step derivation or proof, a causal or root-cause diagnosis, an architecture or security/authority argument, a statistical inference, a contested interpretation, or a plan whose correctness depends on many interacting constraints.
2. **Costly if wrong.** Someone will act on the conclusion without re-deriving it, and a mistake would be expensive or hard to undo. Examples include decisions, irreversible or production actions, money, publication, merge or deploy, and advice the owner will rely on.
3. **Not cheaply checkable.** Tests, computation, a type check, a source lookup, or a direct owner trial cannot settle the central claim. Run those cheaper checks first. The model check covers what they cannot.

Do not trigger for routine edits, retrieval, formatting, restating established facts, anything deterministic checks already verified, or a reversible Iteration-lane candidate the owner will try directly (the owner's trial is the check).

## Reviewer

Use the **other model family's current top reasoning setting**. The role is canonical; the binding below is updated when the model ladder changes.

| Producer family | Reviewer (current binding) |
|---|---|
| GPT (any GPT model, including GPT-5.6 and GPT-6) | Claude Opus 5.5 at effort `max` (Claude Code `--effort max`) |
| Claude (any Claude model) | GPT-6.1 Sol at Extra High (XHigh), or GPT-6 Sol at Extra High where 6.1 is not offered, per `patterns/work-model-and-effort-routing.md` |

- Route the check through an already-authorized subscription route for the reviewer family. Examples are the Claude Code provider route for Opus and the owner's ChatGPT/Codex route for Sol. This adds no API-key fallback, no new account, and no spending authority.
- A usable route is not permission to disclose the packet. Send evidence to the other provider only when that exact provider/data boundary is already authorized for this material, and minimize or redact first: never credentials or secrets, and no private health data, personal data, incident evidence, or confidential source beyond what that boundary allows. If the needed evidence cannot cross the boundary, treat the reviewer as unavailable (below).
- A same-family model, a lower effort, or a fresh context of the producing model is **not** a cross-family check. Never present one as a cross-family check.
- For an independent Claude Code check, use the neutral-workspace and `--safe-mode` invocation in `patterns/agent-to-agent-consultation.md` → **Route** so project memory cannot prime the blind pass.

## Packet (blind first pass)

Follow the information firewall in `patterns/independent-evaluation-separation.md`. Send the reviewer the minimum sufficient packet:

- the question as the owner framed it, and the governing requirements or constraints;
- the evidence and sources the conclusion depends on (literal excerpts, not the whole transcript);
- the conclusion and its load-bearing steps, stated as claims to check.

Withhold the producer's confidence, its defenses of contested choices, and any prior reviewer verdicts. When the question has a crisp answer, stage the check in two separate calls: first send the question and evidence without the conclusion and freeze the reviewer's independent answer, then disclose the conclusion and its steps for review. Ordering inside one prompt is not a firewall, because the model sees the whole prompt at once.

Ask the reviewer for:

- a verdict: `AGREES`, `FINDS_ERROR`, or `UNCERTAIN`;
- the weakest load-bearing step;
- any error, with a concrete counterexample or failing case;
- for `UNCERTAIN`, the evidence that would settle the question.

## Bounds and reconciliation

- Run **one check per conclusion, at the point of use**, before the dependent delivery or action. Do not check every intermediate step.
- Allow at most one reconciliation round. If a substantive disagreement survives, give it to the owner with both positions and a recommendation. Do not loop, and do not add a third model to outvote either side.
- A `FINDS_ERROR` with a concrete failing case must be fixed or explicitly rebutted with evidence before the conclusion is used.
- An `UNCERTAIN` verdict is not assurance. Before a consequential action depends on the conclusion, obtain the settling evidence the reviewer named, get the owner's explicit adjudication or waiver, or take the conservative reversible path; otherwise handle it as an unavailable check (below).

## Long-running reviewer liveness

A slow frontier reviewer is not an unavailable reviewer. **Elapsed wall time, a caller/tool timeout, or a long thinking phase is never by itself evidence that the review stalled or failed.**

When the reviewer runtime can persist independently of one tool call:

1. Prefer a persistent/background review session for work that may exceed the caller's normal timeout. Record its session/job ID.
2. Before declaring the reviewer stalled, unavailable, or safe to terminate, query the reviewer runtime itself for liveness: session state plus recent logs/progress where available. If the runtime exposes an agent-status command, ask it whether the review is still `busy/working`; do not infer status from silence in the parent tool.
3. Treat `busy/working` plus continuing reasoning/tool/log activity as an active review regardless of elapsed duration. Continue waiting and monitor at sensible intervals; do not kill it merely because a previous review usually finished faster.
4. Distinguish `blocked/waiting for input` from `working`. Satisfy routine, already-authorized prompts directly when safe; interrupt the owner only for a genuine owner-only decision, permission, credential, or other human gesture.
5. Treat a wrapper timeout as scoped to the wrapper. If the underlying reviewer session/process still exists, reattach, resume, or continue monitoring it rather than classifying the review as failed.
6. Call a review stalled only from positive evidence: the runtime says failed/stopped/lost, the process/session disappeared unexpectedly, or repeated liveness checks show no forward activity and no waiting-for-input state. Do not use a fixed minute cutoff as the stall criterion.
7. If the runtime has no liveness/status surface, preserve the session/process and use the strongest available same-runtime evidence (process state, output growth, tool activity, token/progress counters) before applying the unavailable path.

For current Claude Code versions that support background sessions, a version-sensitive example is: start the long review with `claude --bg ...`, then use `claude agents --json` and `claude logs <session-id>` to distinguish `busy/working`, blocked, completed, and failed states. Re-check `claude --help` before relying on these flags because CLI behavior is version-sensitive.

## Reviewer unavailable

Use this path only after the liveness rule above establishes that the other family is genuinely unreachable, failed/lost, rate-limited, unauthorized, or otherwise unavailable in the current surface:

- Do not substitute a same-family model or a lower tier and call it cross-family.
- When the conclusion is itself what the owner will act on (advice, a recommendation, a decision), delivering it is the consequential step. Do not present it as settled. Present it as unresolved with the line `Cross-family check: not run (<reason>)`, lead with the conservative reversible option, and name what the check would need to settle. It becomes a settled recommendation only after the check runs or the owner waives it.
- When an action depends on the conclusion, hold that action. Resume it when the check runs or the owner waives the check.
- Unrelated work continues, consistent with the provider-outage rule in `AGENTS.md`.

## Relation to assurance lanes

This is a targeted check for one conclusion. It is allowed in any lane when the trigger holds. It does not import release gates into Iteration, and it does not by itself make a task release-grade. When a Release-lane independent review already uses the other family on the same conclusion, that review satisfies this check. Do not run both.

## Receipt

Record one short line in the task record or final answer. The line gives the reviewer model and effort, the route, what was checked, the verdict, and how any disagreement was resolved. If liveness or reviewer availability affected the disposition, also record the reviewer session/job ID or equivalent scoped runtime identity and the status/log evidence used; elapsed time alone is not an availability receipt. Example: `Cross-family check: Opus 5.5 max via Claude Code — root-cause diagnosis — FINDS_ERROR (race in step 3) — fixed`.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-24), with reviewer-liveness correction `OWNER` (2026-09-29).
- Decision it changes: whether a reasoning-heavy, costly-if-wrong conclusion may be used unexamined outside its producing model family, and when a slow reviewer may be treated as unavailable.
- Why the simpler standard is insufficient: same-family self-review shares the producer's blind spots; separately, elapsed-time heuristics can kill a still-working frontier reviewer and falsely downgrade a required check to "unavailable".
- Why it is scoped: the trigger limits the check to conclusions where a second frontier-model pass can change a costly outcome. Liveness monitoring applies only after such a review is admitted. Unscoped checking would contradict the owner's cost instruction and the assurance-lane rules.
