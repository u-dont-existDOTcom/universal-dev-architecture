# Carrying UDA into standalone projects

## Status

Current universal pattern. Origin: **OWNER** instruction, 2026-09-29: "build instructions for any project that is going to go outside of UDA accessibility that it should import the important parts of UDA (like innersignal, askrigor), like this map for example, if and in the manners in which it makes sense to do so".

## Problem

Agents that develop a project load this architecture, but a project's runtime often doesn't. A product's live agent, a server job, a protocol served to other people's assistants, and an agent in someone else's workspace never read this repository. Rules that live only here protect the development work and leave the runtime without them. Copying everything the other way would load the runtime with process rules it doesn't need and with owner-private material it must not carry.

## Rule

1. **Name the runtime.** List what runs outside this architecture's reach: which agents or processes, who they serve, and what can go wrong there.
2. **Select what applies.** From this architecture, and first from `patterns/logic-failure-map.md`, pick the entries whose failures can happen in that runtime. For runtime imports, leave out development-process rules (pull requests, review loops, repository governance, the laptop runner). Keep applicable development-time rules in the selection for the project's `AGENTS.md` route in step 3. Leave out every owner-specific deployment detail.
3. **Import each item in the most enforceable form that fits:**
   - A mechanical rule becomes code: a validator, a gate or a test in the project.
   - A reasoning behavior of a runtime agent becomes part of the project's own runtime protocol or prompt, rewritten for that audience and domain.
   - A development-time rule is referenced, not copied. The project's `AGENTS.md` routes its developers to this architecture.
4. **Adapt, don't paste.** Runtime text is read by end users' sessions or other people's agents. Write it for them, and keep owner-private material, owner-specific examples and internal process out of it.
5. **Record where it came from.** The project keeps a short import manifest, such as `docs/uda-imports.md`, listing each imported item: its source path here, the source commit, the form it took, and where it lives in the project.
6. **Keep it in sync on purpose.** A check in the project (CI or scheduled) compares the manifest's source commits with this architecture's default branch and reports imported sources that have changed. Updating an import is a deliberate change with its own test, never an automatic copy, because it changes runtime behavior.
7. **Test the imports.** An imported check gets a test in the project that fails without it. An imported protocol passage gets whatever evaluation the project uses for its protocol.

## Bounds

- Import into runtime only what can happen there. A rule that governs how agents develop the project stays here and is referenced from the project's `AGENTS.md` when applicable.
- An import adds no authority. The project's own owner decisions, privacy boundaries and gates still apply.
- When a project's runtime already enforces a rule its own way, record that in the manifest instead of importing a second copy.

## Requirement-accretion declaration

- Origin: `OWNER` (2026-09-29).
- Decision it changes: which of this architecture's rules protect a project where its runtime runs, and in what form.
- Why the simpler standard is insufficient: routing developers here doesn't reach runtimes that never load this repository, and copying without selection or provenance drifts silently and carries material a runtime must not hold.
- Why it is scoped: it applies to projects whose runtime runs outside this architecture, and only to items that can fail there.

## Example (NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT)

Two of the owner's projects run outside this architecture:

- **InnerSignal**: the therapy runtime reaches the sessions it serves through its protocol, and the journal import runs as a job on a server. Candidate imports from the map include the understanding and reporting stages in the therapy protocol (answering the question actually asked; never presenting a guess as a fact). The import's audit and authorization gates, such as publishing only fully audited records and re-checking consent before every private call, are mechanical rules and belong in its code and tests.
- **AskRigor**: its research protocols run in other people's assistants through its connector. The evidence and reasoning stages of the map (coverage before depth, specificity, evidence direction, base rates, provenance, observed-state claims) belong in those protocols, rewritten for research users.

Each project records its imports in its own manifest; this repository keeps no copy of their runtime text.
