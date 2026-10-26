# One-line GitHub handoff at the end of every turn

## Authority and purpose

**Origin: explicit owner instruction, 2026-10-26:** “continue and give me at the end of every turn a one-line github handoff in case chat is overflowed. make that a rule in UDA also”.

This is a per-turn **owner-facing output and continuity requirement** in UDA-governed conversations. It supplements `patterns/context-compaction-resilience.md`, `patterns/cross-account-continuity.md`, and `patterns/human-readable-operational-references.md`; it does not weaken Git ownership, privacy, licensing, data-use consent or publication gates.

## Required behavior

1. **Every UDA-governed assistant turn ends with exactly one final, single-line GitHub handoff.** Put it after the main answer and file links, with no text after it. This applies to short replies as well as long multi-step work. Include a current GitHub link to a directly readable, authoritative checkpoint (a precise branch/ref file, issue, or PR containing the task's latest verified state). Do **not** merely link to a project homepage when the successor must search for the checkpoint.
2. **Keep a stable workstream recovery record.** Before writing the line, update or verify the existing Git checkpoint for an OPEN multi-session task: the unchanged parent objective, work completed and verified, open gaps, known blockers/permission gates, key artifact locators, and one exact next safe action. Prefer one evolving workstream checkpoint, not a new file per message. A GitHub link is a pointer to evidence, not evidence that a speculative claim was validated.
3. **Compress without losing resume instructions.** Format: `GitHub handoff: [Resume <workstream>](<verified GitHub URL>) — <current verified state>; next: <specific safe action>.` Keep the line short enough to be read and reused without context. The actual source file provides detail. The handoff must be the *final line* of the reply; no signoff follows it.
4. **Verify the destination.** Read back the exact GitHub checkpoint/PR/issue in the present turn and confirm its content is sufficient to resume. Do not point to a hypothetical file, a draft that was not saved, an account-bound chat, a personal Library document, or a checkpoint from an earlier phase described as current. If GitHub write/read fails, say `GitHub handoff: BLOCKED — <precise route failure>; resume: <one-line current action>`; do not invent a GitHub URL or claim persistence. A known previous link may be supplied only if explicitly marked STALE.
5. **Preserve privacy and release authority.** Put identifiable or restricted records only in an authorized private repository. Public repositories contain only deidentified, permission-safe process pointers. An unreviewed study is marked provisional; a PR is marked unmerged; a local or Library-only artifact is not called a GitHub checkpoint. Never publish raw emails, medical narratives, credentials or protected data to satisfy the handoff.
6. **Zero-work turns:** When there is no active multi-session workstream, the final line may point to the applicable current GitHub rule/checkpoint and say `no open work; next: none`. Do not invent a project or create an unnecessary Git commit merely to satisfy the format.
7. **After context loss,** the successor opens the linked checkpoint, reconciles it with current Git and source evidence, loads applicable UDA rules, then resumes the recorded safe action. A handoff line is only a locator, not independent authority or proof of completion.

## Enforcement and tests

- **Activation:** the root `AGENTS.md` per-turn pointer and the `LESSON-INDEX.md` entry activate the rule.
- **Pre-final check:** inspect the literal last line of the intended final answer for one `GitHub handoff:` prefix, an actually verified current GitHub destination or an honest `BLOCKED` marker, a state and next action; remove any subsequent text.
- **Mechanical coverage:** repository unit tests can check the existence, route, format and privacy safeguards of this *instruction*. They cannot prove every deployed model response obeyed it; runtime response validation is a separate integration requirement.
- **Cost/authority:** do not turn the handoff into a new research-validation or release gate. Continue safe work when saving fails and explicitly disclose the missing durability in the line.

## Example

`GitHub handoff: [Resume Atlas](https://github.com/example-org/private-atlas/blob/main/checkpoints/CURRENT.md) — source audit provisional; next: verify primary-study comparator and record unresolved fields.`

The example URL is illustrative, **not an actual destination to surface**.
