# Cross-family reasoning check

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-09-24 ("anything which requires very complex reasoning and could benefit from a separate model check should be checked with either Opus 5.5 max thinking if it was from GPT, or with GPT Sol XHigh if it was from Opus"). The owner invited a better design; the scoping below is that refinement, not a weakening of the instruction.

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
| GPT (any GPT-5.6 Sol or GPT-6 Astra tier) | Claude Opus 5.5 at effort `max` (Claude Code `--effort max`) |
| Claude (any Claude model) | GPT-5.6 Sol at Extra High (XHigh), the difficult-task baseline in `patterns/work-model-and-effort-routing.md` |

- Route the check through an already-authorized subscription route for the reviewer family. Examples are the Claude Code provider route for Opus and the owner's ChatGPT/Codex route for Sol. This adds no API-key fallback, no new account, and no spending authority.
- A usable route is not permission to disclose the packet. Send evidence to the other provider only when that exact provider/data boundary is already authorized for this material, and minimize or redact first: never credentials or secrets, and no private health data, personal data, incident evidence, or confidential source beyond what that boundary allows. If the needed evidence cannot cross the boundary, treat the reviewer as unavailable (below).
- A same-family model, a lower effort, or a fresh context of the producing model is **not** a cross-family check. Never present one as a cross-family check.

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

## Reviewer unavailable

If the other family is unreachable, rate-limited, or not authorized in the current surface:

- Do not substitute a same-family model or a lower tier and call it cross-family.
- Deliver with an explicit line: `Cross-family check: not run (<reason>)`.
- Hold only the consequential action that depends on the unchecked conclusion. Resume it when the check runs or the owner waives the check. Unrelated work continues, consistent with the provider-outage rule in `AGENTS.md`.

## Relation to assurance lanes

This is a targeted check for one conclusion. It is allowed in any lane when the trigger holds. It does not import release gates into Iteration, and it does not by itself make a task release-grade. When a Release-lane independent review already uses the other family on the same conclusion, that review satisfies this check. Do not run both.

## Receipt

Record one short line in the task record or final answer. The line gives the reviewer model and effort, the route, what was checked, the verdict, and how any disagreement was resolved. Example: `Cross-family check: Opus 5.5 max via Claude Code — root-cause diagnosis — FINDS_ERROR (race in step 3) — fixed`.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-24).
- Decision it changes: whether a reasoning-heavy, costly-if-wrong conclusion may be used unexamined outside its producing model family.
- Why the simpler standard is insufficient: same-family self-review shares the producer's blind spots (see the existing-work basis above).
- Why it is scoped: the trigger limits the check to conclusions where a second frontier-model pass can change a costly outcome. Unscoped checking would contradict the owner's cost instruction and the assurance-lane rules.
