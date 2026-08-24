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

Run both exact commands declared in `.github/codex-repository.json` before completion:

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/audit_codex_github.py --root . --fail-on error`

Use the uniquely named `Universal repository compliance / Deterministic repository audit` GitHub Actions check. Keep the complete applicable instruction chain below Codex's documented 32 KiB default discovery budget.

## Test-efficiency policy

For non-trivial software tasks where repeated testing could materially affect task wall time, load `patterns/test-efficiency-and-verification-budget.md` before the implementation loop. Start test-cost measurement before substantive implementation and route agent-initiated test commands through `scripts/test_efficiency.py` or a project-native equivalent preserving the same semantics and measurements.

If the active project does not already contain an equivalent observer, do not silently skip measurement. Vendor the current canonical `scripts/test_efficiency.py` from this repository, run the current canonical observer from a checked-out copy with `--root <PROJECT>`, or use a verified project-native equivalent. A missing local observer is not a reason to mark telemetry not applicable.

Focused and affected tests are the default inner loop. Full suites are checkpoint-based, not an after-every-edit reflex. Do not rerun an unchanged green full or mutation suite unless a material external/environment reason is recorded. Mutation testing requires an explicit test-quality, high-risk, survivor-followup, owner, or release trigger; ordinary green tests are not by themselves a reason to launch mutation testing.

Required repository-declared completion/CI gates still run at their proper checkpoint. Test-efficiency optimization changes scheduling and selection, not the required confidence boundary.

## Workflow

Use a task branch or worktree and a pull request for substantive changes. Track complex work in a durable plan, update `state/CURRENT-STATE.md` at meaningful boundaries, run applicable checks, review the final diff, and complete lesson closeout before reporting completion.

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: use isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable, and serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

When coordinating work from a ChatGPT Chat, keep Chat as the owner-facing supervisor for discussion, editorial judgment, synthesis, repository reading, source comparison, and actions available through its current connectors or tools. Repository involvement alone is not a reason to create a separate Work task. When the next step genuinely requires terminal or shell execution, local-filesystem tooling unavailable in Chat, tests or scripts, command-line Git, or another execution-heavy capability Chat does not have, there is standing permission to create one bounded ChatGPT Work task in the appropriate local or cloud environment. Follow that task, retrieve its result, and continue in the originating Chat without asking the owner to shuttle prompts, logs, files, or results. This routing rule does not broaden task scope, permissions, spending authority, publication authority, or destructive-action authority.

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

## Owner-facing operational references

In user-facing prose, never make repository identifiers the primary explanation. Pull-request numbers, issue numbers, branch names, commit SHAs, workflow/run/job IDs, and similar opaque references are locating metadata, not semantic referents.

On first use in a response—or again after a topic shift when the referent could be unclear—state the plain-language object or function first and put the identifier second, for example `the local Playwright Pangram GUI runner (PR #78)` rather than `PR #78`. When several identifiers are involved, explain their substantive relationship in ordinary language instead of presenting a bare chain such as `PR #35 → PR #78`.

When an owner decision is required, state the actual choice, consequences, and recommended default in plain language. Do not ask the owner to decide among opaque identifiers or branch/PR numbers. Internal logs, code, machine-readable receipts, and developer-only diagnostics may remain identifier-dense when that precision is useful.

Use `patterns/human-readable-operational-references.md` for the full rationale, examples, and recovery rule.

## Research before reinvention

Before substantial investment in a bespoke method, framework, architecture, metric, algorithm, taxonomy, protocol, evaluation system, or workflow that plausibly overlaps established knowledge, follow `patterns/research-before-reinvention.md`.

Preserve an independent conception snapshot before outside exposure when prior examples could constrain genuinely creative ideation. Then run a bounded existing-work scan across the underlying problem, not merely the project's chosen terminology. Check the strongest relevant academic literature, standards, mature implementations/tools, and adjacent disciplines. Record what is solved, partially solved, composable, incompatible, unresolved, or merely not found; choose `reuse`, `adapt`, `compose`, `invent`, or `experiment`; identify the novel remainder; and benchmark bespoke work against the strongest relevant established baseline.

When academic literature is material, the orchestration pattern routes to `patterns/existing-work-scan-and-scholarly-discovery.md` as the specialist discovery layer. Prefer a scholarly semantic discovery system such as SciSpace when available for terminology/literature mapping before primary-source verification; ordinary web search alone is not the default when the specialized route materially improves discovery.

Cheap exploratory work may defer the scan only by recording explicit research debt and a hard trigger before architecture commitment, scaling, productionization, repeated refinement, public novelty claims, cross-project promotion, or substantial implementation. Repeated bespoke refinement is itself a trigger: do not keep polishing a homemade solution without checking whether the problem is already substantially solved.

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
