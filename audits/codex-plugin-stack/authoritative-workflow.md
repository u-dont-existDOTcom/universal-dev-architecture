# Authoritative minimal workflow

1. **Interpret the request.** Read the owner request and applicable repository instructions. Extract acceptance criteria, constraints, and authority. Proceed on safe reversible assumptions; ask only for a material missing decision.
2. **Inspect first.** Read the relevant code, tests, Git state, and exact project commands. Reproduce a defect or establish a characterization baseline before changing behavior.
3. **Plan proportionally.** Use no plan artifact for a trivial change, a short in-turn plan for moderate work, and one repository execution plan plus recovery checkpoint for substantial multi-step work. Never maintain competing ledgers.
4. **Choose isolation and ownership.** Use one task branch/worktree for substantive work. Use parent-local subagents only for demonstrably independent read or write surfaces; keep one integrating parent and serialize shared mutable state. Use Coordinator only under its narrow explicit trigger, never alongside a Superpowers task graph.
5. **Implement the smallest complete slice.** Prefer a failing regression test when practical, make the narrow production change, and keep public APIs and unrelated behavior stable.
6. **Diagnose failures systematically.** Gather evidence, form and test hypotheses, fix the root cause, and avoid speculative patching. Preserve useful existing work.
7. **Verify once, well.** Run focused checks, then the exact repository-wide checks proportionate to risk. Inspect the final diff and Git status. Completion claims require fresh captured evidence.
8. **Add specialized review only when triggered.** Use one independent code review for material risk. Use Codex Security only for explicit formal security work; its worker orchestration becomes the sole coordination system for that phase and must terminate within a stated budget.
9. **Persist the durable boundary.** Update the one repository plan/state file at meaningful boundaries, commit intentionally, and use the PR as the long-lived review/handoff link. Do not create generic handoff files.
10. **Integrate under existing authority.** A reversible local merge may proceed under the standing global agreement after checks and rollback preparation. Push, PR publication, external tickets, releases, deployments, or configuration mutations require their existing explicit authority.

For long-running commands, start them in a native PTY/session, poll the same process until terminal, preserve logs/status, and resume from repository state after interruption. Do not release the task merely because the command is still running.
