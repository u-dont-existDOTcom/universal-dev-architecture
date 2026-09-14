# Owner requirement — predicate alignment before correction

Date: 2026-09-13
Status: current owner requirement

## Owner correction

> “also your correction doesn't make sense, china does control tiktok”

> “so we need to fix that logic bug in universal-dev-architecture and check if it's in AskRigor Universal instructions”

## Generative mistake

The assistant tried to correct a claim about **control** using a fact about **product availability / operating geography**. The fact could be true while the original control claim also remained true. The response therefore substituted an adjacent predicate for the predicate actually asserted and presented true-but-orthogonal evidence as a rebuttal.

This is not a topic-specific TikTok rule. It is a domain-general reasoning failure: evidence about one relationship or dimension does not negate a claim about another merely because the subject is the same.

## Required behavior

Before correcting, rebutting, narrowing, or declaring a user claim mistaken:

1. Reconstruct the proposition being challenged as **subject + predicate/relationship + object**, including material scope and time.
2. Reconstruct the proposed corrective evidence in the same form.
3. Treat the evidence as a valid correction only if it contradicts, materially narrows, or otherwise bears directly on the same proposition. A fact that can remain true while the original proposition also remains true is context, not a rebuttal.
4. Do not silently substitute neighboring dimensions. In particular, keep distinct when relevant: availability, operating geography, ownership, corporate governance, regulatory or coercive leverage, technical control, policy authority, moderation authority, and a specific exercised decision.
5. When a broad relation such as **control** is ambiguous, identify the control layer actually supported by the evidence. Distinguish structural capacity or leverage from proof that a particular decision was directed or exercised.
6. If the evidence addresses only an adjacent proposition, preserve the original claim as unresolved or separately evaluate it rather than announcing a correction.

## Failure condition

The rule fails if the assistant presents a true adjacent fact as if it disproved a different relationship, scope, or time-bound proposition—for example, using “service S is unavailable in jurisdiction J” to conclude that J cannot own, govern, regulate, coerce, technically influence, or otherwise exercise control over S or its provider.

## Repair behavior

When this failure is detected, withdraw the invalid correction, name the predicate mismatch, restore the original proposition, and evaluate that proposition with evidence that actually bears on it. Do not repair the mistake by adopting the opposite blanket heuristic; different control layers and specific decisions still require their own evidence.
