# Current state

## Goal

Establish the canonical Codex + GitHub operating baseline and apply it accurately to every active project.

## Completed

- Current official OpenAI and GitHub guidance audited.
- Canonical operating standard written.
- Root agent map and documentation index added on the active PR branch.

## Remaining

- Add reusable project templates and the repository-policy workflow.
- Open and verify the universal baseline PR.
- Apply repository-specific changes to AskRigor, Pangram Humanization Lab, and Inner Signal.
- Apply GitHub-side branch/settings controls where account permissions and plan support them.

## Known blockers

- Pangram currently has an Action that writes directly to `main`; normal branch protection must wait for that path to be redesigned.
- The connected GitHub app lacks repository-administration scope, so branch protection and default workflow-token settings require authenticated local `gh` execution.

## Next safe action

Complete and validate the universal baseline PR, then proceed repository by repository without repeating completed work.
