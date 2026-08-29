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

Run both exact commands declared in `.github/codex-repository.json` before completion **when the active task is at the repository's merge/release completion boundary**:

- `python3 -m unittest discover -s tests -v`
- `python3 scripts/audit_codex_github.py --root . --fail-on error`

Do not reinterpret release/merge completion gates as prerequisites for ordinary experimental iteration. Use the assurance-lane policy below to bind validation to the decision currently being made.

Use the uniquely named `Universal repository compliance / Deterministic repository audit` GitHub Actions check. Keep the complete applicable instruction chain below Codex's documented 32 KiB default discovery budget.

## Test-efficiency policy

For non-trivial software tasks where repeated testing could materially affect task wall time, load `patterns/test-efficiency-and-verification-budget.md` before the implementation loop. Start test-cost measurement before substantive implementation and route agent-initiated test commands through `scripts/test_efficiency.py` or a project-native equivalent preserving the same semantics and measurements.

If the active project does not already contain an equivalent observer, do not silently skip measurement. Vendor the current canonical `scripts/test_efficiency.py` from this repository, run the current canonical observer from a checked-out copy with `--root <PROJECT>`, or use a verified project-native equivalent. A missing local observer is not a reason to mark telemetry not applicable.

Focused and affected tests are the default inner loop. Full suites are checkpoint-based, not an after-every-edit reflex. Do not rerun an unchanged green full or mutation suite unless a material external/environment reason is recorded. Mutation testing requires an explicit test-quality, high-risk, survivor-followup, owner, or release trigger; ordinary green tests are not by themselves a reason to launch mutation testing.

Required repository-declared completion/CI gates still run at their proper checkpoint. Test-efficiency optimization changes scheduling and selection, not the required confidence boundary.

## Development assurance lanes

For software/product development, load `patterns/development-assurance-lanes.md` and match assurance to the decision being made now.

Default to the **Iteration lane** unless the owner or current project requirements actually establish a stronger boundary. A request such as “fix this,” “why is this worse?”, “try this architecture,” “make the app better,” or “let me test it” is not by itself a request for merge/release certification.

- **Iteration:** smallest reversible candidate, focused/affected tests, a few representative product cases, and early owner/product evaluation. Do not require full repository verification, multi-model judge tournaments, mutation campaigns, publication scans, multiple independent reviews, or a merge-ready PR merely to let the owner try a safe reversible candidate.
- **Decision:** use a bounded direct comparison only when a material architecture/product choice genuinely remains unresolved. Hold unrelated variables constant, compare the minimal alternatives directly, and stop when enough evidence exists to choose the next reversible implementation. Prefer the simpler candidate when decision-relevant evidence is effectively tied.
- **Release:** run the full applicable repository, CI, security/privacy, independent-review, rollback, publication, installation, and release gates only when actually preparing to merge, release, publish, install, deploy, migrate, or cross another consequential production boundary.

High-risk invariants can require targeted hard gates in Iteration/Decision, but one safety-sensitive surface does not import every unrelated release gate into the inner loop.

Before launching expensive validation, require a concrete answer to: **what current decision can this result change?** If none, defer it as later assurance debt.

Optional evaluator/provider outages or rate limits must not freeze unrelated development. Preserve the blocker, continue safe work, and defer optional evidence unless it is genuinely necessary for the current decision. Never bypass a hard gate or substitute an unauthorized model merely to avoid a limit.

After a high-rigor investigation or release, ordinary development returns to Iteration. Do not create an assurance ratchet where one difficult task permanently makes every later change release-grade.

If a durable task lock/checkpoint encodes a stronger stale lane and the owner explicitly returns the project to rapid experimentation, update/supersede that task state rather than continuing the obsolete campaign.

## Workflow

Use a task branch or worktree for substantive changes when isolation/recovery is useful. Open a pull request when the current task is actually approaching a review/merge boundary or the owner/project requires one; a reversible experimental candidate does not need to become merge-ready before the owner can try it.

Track complex work in a durable plan, update `state/CURRENT-STATE.md` at meaningful boundaries, run the checks appropriate to the active assurance lane, review the relevant diff before crossing the corresponding boundary, and complete lesson closeout at the task's actual completion level. Do not use release completion semantics for an iteration experiment.

When multiple safe in-scope execution approaches achieve the same outcome, choose the better-coordinated approach without asking the owner to select an execution mode: use isolated workspaces, a durable plan and recovery ledger, delegation plus independent review when safely separable and decision-relevant, and serialize shared mutable state. This standing permission does not broaden task authority and does not replace substantive owner decisions.

An owner answer, correction, upload, or requested clarification is input to the active task, not a completion event. After incorporating it, continue automatically to the next safe in-scope action while the stated goal remains unfinished. Do not return only an acknowledgment or ask the owner what to do next when repository state, the task plan, or the request already determines that step. Pause only for a genuine missing owner decision, new authority, destructive or irreversible risk, unavailable permission or credential, spending, publication, or access, or an explicit request to stop.

## Browser-control efficiency

For browser automation or browser control, default to **headless mode**. Use a headed/visible browser only when the task materially depends on visible browser or OS interaction, headed-only behavior, extension UI, native dialogs, window/focus behavior, WebAuthn/passkeys, visual debugging, or another capability that cannot be reproduced reliably headlessly. When deviating from headless mode, preserve the reason in the task record when one exists.

Reuse the existing browser process, context, page, or tab across sequential steps when the same session or target will be used again. Prefer navigating or resetting the existing page over repeatedly opening and closing an equivalent tab. Do not churn tabs merely as a generic cleanup habit.

Create a fresh page/context/session only when there is a concrete need for isolation, parallelism, a clean authentication/storage state, cross-account separation, recovery from corrupted/stale page state, or behavior whose correctness depends on a fresh browsing context. Close reusable browser state only when the task is finished or keeping it alive creates a material resource, security, privacy, or state-contamination risk.

## Owner-facing operational references

In user-facing prose, never make repository identifiers the primary explanation. Pull-request numbers, issue numbers, branch names, commit SHAs, workflow/run/job IDs, and similar opaque references are locating metadata, not semantic referents.

On first use in a response—or again after a topic shift when the referent could be unclear—state the plain-language object or function first and put the identifier second, for example `the local Playwright Pangram GUI runner (PR #78)` rather than `PR #78`. When several identifiers are involved, explain their substantive relationship in ordinary language instead of presenting a bare chain such as `PR #35 → PR #78`.

When an owner decision is required, state the actual choice, consequences, and recommended default in plain language. Do not ask the owner to decide among opaque identifiers or branch/PR numbers. Internal logs, code, machine-readable receipts, and developer-only diagnostics may remain identifier-dense when that precision is useful.

### Owner-facing artifact delivery

**Delivery is part of completion.** When the owner needs to use a file, packet, handoff, protocol, report, generated artifact, or other output, do not make them navigate GitHub branches or repository paths to obtain it.

Use this priority:

1. give the actual file/attachment when the active surface can materialize or attach it;
2. otherwise give a direct clickable file/download link to the artifact itself;
3. only if neither is technically possible, provide the usable contents inline when practical, or explain the exact tool limitation and give the nearest direct retrievable link.

Branch names, repository paths, PR numbers, and commit SHAs may be included **afterward as provenance**, but they are never a substitute for owner-facing delivery. Before saying `go to branch X`, `open path Y`, `grab the file from GitHub`, or equivalent, first attempt to retrieve/materialize/attach the artifact or create a direct link.

When a handoff needs companion material, deliver the complete usable set. For example, a packet that requires a controller prompt or reader protocol is incomplete if only the data windows are handed over and the instructions are merely named by repository location. Prefer one ZIP/file set where useful; when isolation or staged disclosure requires separation, give direct files/links for every artifact needed at the current stage.

Before closing an owner-facing handoff, verify that the owner can use what was delivered **without browsing GitHub or reconstructing missing pieces**, unless a real technical, security, privacy, or experimental-isolation constraint prevents that.

Use `patterns/human-readable-operational-references.md` for the full rationale, examples, artifact-delivery priority, handoff-completeness rule, and recovery rule.

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
