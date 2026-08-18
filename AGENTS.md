# Universal development architecture

## Authority

1. Current owner and task requirements
2. `.github/codex-repository.json`
3. `LESSON-INDEX.md`
4. `docs/INDEX.md`
5. `patterns/codex-github-operating-system.md` for Codex + GitHub governance, or the other relevant current pattern
6. `state/CURRENT-STATE.md`, tests, artifacts, and Git history

Project-specific current requirements win on genuine conflict.

## Validation

Run both exact commands declared in `.github/codex-repository.json`:

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/audit_codex_github.py --root . --fail-on error`

Use the uniquely named `Universal repository compliance / Deterministic repository audit` GitHub Actions check. Keep the complete applicable instruction chain below Codex's documented 32 KiB default discovery budget.

## Workflow

Use a task branch or worktree and a pull request for substantive changes. Track complex work in a durable plan, update `state/CURRENT-STATE.md` at meaningful boundaries, run applicable checks, review the final diff, and complete lesson closeout before reporting completion.

Before substantial investment in a bespoke method, framework, architecture, metric, taxonomy, protocol, evaluation system, or workflow that plausibly overlaps established knowledge, load `patterns/existing-work-scan-and-scholarly-discovery.md`. Preserve an independent conception first when useful, search the underlying problem rather than only the project's coined terminology, and explicitly decide reuse/adaptation/composition/invention/experiment. When academic literature is material and a scholarly semantic discovery system such as SciSpace is available, prefer it for terminology/literature mapping before primary-source verification; ordinary web search alone is not the default for this reinvention check.

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: use isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable, and serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

## Specialist architecture dependencies

For any task materially involving UI/UX, frontend visual implementation, website or app design/redesign, long-form reading experience, visual hierarchy, typography, color, layout, motion, interaction design, components, design systems, design critique/study, or design-production/accessibility/responsive review, load the current `u-dont-existDOTcom/design` repository before substantive design work. Start with its live default-branch `skills/design/SKILL.md` and follow `patterns/canonical-design-os-bootstrap.md`. Do not rely on remembered copies of the design methodology.

The design repository is specialist guidance below current owner/project truth and this universal architecture. It is not required for backend-only or other non-design work. If it is inaccessible, do not reconstruct its current contents from memory; continue from local authority and record the missing dependency.

## Branch roles

- `main`: canonical universal guidance
- task branches: proposed changes

## Code review rules

- Require transfer rationale and limits before promoting a project-specific finding as universal.
- Do not claim a control is active without mechanical evidence.
- Preserve provenance, supersession, and explicit blockers.

Treat chat as disposable working memory. A fresh worker must be able to recover from the repository alone.