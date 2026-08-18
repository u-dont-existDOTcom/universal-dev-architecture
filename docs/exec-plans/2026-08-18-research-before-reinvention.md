# Research-before-reinvention integration plan

**Goal:** Make one canonical research-before-reinvention orchestration rule mechanically visible in project task/plan templates without regressing the scholarly semantic-discovery rule already on `main`.

**Baseline:** `main` at `88066557559e137397d3f6f441176c5616772590`; uploaded `research-before-reinvention-patch-2026-08-18.zip`; current `AGENTS.md`, `LESSON-INDEX.md`, `docs/INDEX.md`, `patterns/existing-work-scan-and-scholarly-discovery.md`, task templates, tests, and repository audit.

## Research-before-reinvention gate

- **Applicability:** `required`
- **Independent conception snapshot:** the owner-supplied patch proposes a domain-general gate with independent-conception preservation, underlying-problem search, academic/standards/tooling/adjacent scans, solved/partial/incompatible/unresolved classification, explicit reuse/adapt/compose/invent/experiment disposition, external baselines, research debt, and durable prior-work ledgers.
- **Existing-work scan:** live `main` already contains `patterns/existing-work-scan-and-scholarly-discovery.md`, promoted earlier on 2026-08-18. It already covers independent conception, underlying-problem search, domain-matched discovery, SciSpace-style scholarly semantic discovery, primary verification, solved/adaptable/composable/incompatible/unresolved classification, explicit reuse/adapt/compose/invent/experiment, strongest-baseline comparison, and durable provenance. The packet adds stronger orchestration mechanics: algorithm/protocol breadth, explicit research-debt state and hard triggers, a reusable prior-work ledger, task/plan fields, and contract tests.
- **Existing-work map:**
  - already solved/reusable: scholarly terminology/literature discovery and primary-source verification routing;
  - partially solved/adaptable: universal reinvention gate and build/adapt/reuse decision;
  - incompatible: duplicating two independent full reinvention rules would create competing canonical guidance;
  - unresolved remainder: one orchestration layer, explicit research-debt mechanics, durable ledger template, task-template fields, and executable contract coverage.
- **Disposition:** `compose`
- **Novel remainder:** packet orchestration/mechanical contract composed with the existing scholarly-discovery specialization.
- **External baseline:** current live `patterns/existing-work-scan-and-scholarly-discovery.md`; the integrated rule must preserve all stronger scholarly-routing requirements while adding the packet's mechanics.
- **Research debt:** none.

**Acceptance criteria:**

- [ ] `patterns/research-before-reinvention.md` is the canonical orchestration layer and explicitly routes materially academic discovery to the existing scholarly-discovery specialization.
- [ ] `AGENTS.md`, `docs/INDEX.md`, and `LESSON-INDEX.md` expose one non-conflicting route.
- [ ] `templates/EXEC-PLAN.md`, `templates/CODEX-TASK.md`, and `templates/PRIOR-WORK-SCAN.md` carry the mechanical state/ledger fields.
- [ ] Contract regression covers dispositions, research debt, scholarly specialization, routing, and template fields.
- [ ] `python3 -m unittest discover -s tests -v` passes.
- [ ] `python3 scripts/audit_codex_github.py --root . --fail-on error` passes.

**Non-goals:** Do not delete the scholarly-discovery pattern or erase its 2026-08-18 provenance; do not alter unrelated governance/design/active-task controls.

## Decisions

| Date | Decision | Evidence | Consequence |
| --- | --- | --- | --- |
| 2026-08-18 | Compose rather than duplicate | Live `main` already has a stronger academic discovery specialization | New gate orchestrates; scholarly pattern remains specialist layer |
| 2026-08-18 | Use packet's explicit research-debt and ledger mechanics | Uploaded patch + owner instruction | Deferral becomes bounded and mechanically visible |

## Tasks

1. Add the integrated orchestration pattern and prior-work ledger template.
2. Route root/index documentation to the new orchestration layer while retaining the scholarly specialization.
3. Add research-before-reinvention fields to task and execution-plan templates.
4. Add a contract regression that fails if routing/mechanics disappear or the scholarly specialization becomes orphaned.
5. Update current-state recovery evidence.
6. Run the complete declared deterministic verification and repository audit; review final diff; land by pull request.

## Progress

| Date | Completed | Evidence/commit | Next action or blocker |
| --- | --- | --- | --- |
| 2026-08-18 | Live-state reconciliation and reuse decision | `main` `88066557559e137397d3f6f441176c5616772590` + uploaded patch | Implement composed pattern |

## Completion

Record final commit, pull request, checks, remaining limitations, and lesson disposition here before closeout.
