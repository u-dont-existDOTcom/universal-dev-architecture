# Runtime projection of promoted lessons

## Problem

A lesson can be correctly promoted into cross-project developer guidance and still fail to change the behavior experienced by end users. Public products do not necessarily read the developer-governance repository at runtime.

This creates a propagation gap: the development system learns, while the shipped product continues to make the same mistake.

## Core invariant

**Promotion is not runtime deployment.**

For every promoted lesson, identify the enforcement surface required by the intended beneficiary:

- `developer_governance` — the lesson changes how developers, reviewers, or agents build and reason about the product;
- `product_runtime` — the lesson changes behavior that an end user should experience from the shipped product;
- `both` — both surfaces must change.

When the intended beneficiary is an end user and the product does not load the universal guidance at runtime, universal promotion alone is incomplete.

## Runtime projection rule

If a transferable lesson changes desired end-user behavior, project it into each affected product's canonical runtime authority using the product-native mechanism: system/developer prompt, protocol, policy, model instruction, deterministic guard, retrieval policy, or equivalent.

Do not copy an entire universal pattern into every product. Project the smallest product-native rule that preserves the universal invariant and fits local authority.

For every materially affected product, record one disposition:

- `PROJECTED` — the rule is present in canonical runtime authority and covered by a focused regression/eval;
- `NOT_APPLICABLE` — the shipped product has no relevant runtime behavior, with a reason;
- `DEFERRED` — projection is required but blocked or intentionally postponed, with the exact blocker/trigger.

Do not claim that public users are protected by a lesson while any affected product remains unexamined or `DEFERRED`.

## Trigger test

Runtime projection is required when all of these are true:

1. the lesson is transferable beyond the originating task;
2. the product has a runtime behavior that can exhibit the failure;
3. an end user can encounter the consequence without a developer/agent mediation step; and
4. the product runtime does not itself load and enforce the universal rule.

A developer-only workflow lesson normally remains `developer_governance`. A reasoning, safety, interpretation, response-quality, or interaction rule often requires `product_runtime` or `both` when a public model/product performs that behavior directly.

## Verification boundary

A repository edit is not proof of public protection.

Before claiming runtime coverage:

1. identify the exact canonical runtime artifact or deterministic control that ships;
2. verify the projected rule is reachable on the affected execution path;
3. add or update a focused regression/eval that would fail if the rule disappeared or its semantics regressed;
4. distinguish `merged`, `released/deployed`, and `live-verified` states;
5. state the strongest status actually established.

`MERGED` means future builds/releases using that authority contain the change. It does not mean current public traffic is already using it.

## Relationship to lesson promotion

Lesson closeout should therefore ask two separate questions:

1. **Where should the lesson be remembered?** — project-local, universal, or both.
2. **Where must the lesson execute?** — developer governance, product runtime, or both.

A lesson can be universally remembered yet locally executed. This is expected, not duplication: universal guidance stores the generalized invariant; each affected product stores only the minimal runtime projection required for its own execution path.

## Failure modes

Reject these substitutions:

- `the universal repository contains the rule, therefore public users get it`;
- `the product repository bootstraps universal guidance for developers, therefore the runtime model does too`;
- `the rule was merged into a prompt/protocol, therefore production is already protected`;
- copying full universal documents into product prompts instead of projecting the minimal operative invariant;
- patching every product mechanically without checking whether the runtime failure surface exists.

## Limits

- Product-specific authority overrides a generic projection when they genuinely conflict; record the local rationale.
- A deterministic product guard may be preferable to a prompt instruction when the invariant is mechanically enforceable.
- Not every universal lesson belongs in runtime prompts. Avoid instruction bloat by projecting only lessons whose triggers exist on that runtime path.
- Release/deployment remains governed by the product's own release authority and gates.
